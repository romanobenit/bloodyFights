import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CARTE_BASE, mazzoBaseCompleto } from '@bloodyfights/motore';
import { archivioInMemoria, creaArena, creaServer, rotte, rotteOnline } from '@bloodyfights/server';
import { creaCliente, type AvvisoRemoto, type Cliente } from '../src/cliente.ts';
import { riassuntoEsito, secondiAlTurno } from '../src/online.ts';

/**
 * DUE CLIENT VERI, UN SERVER VERO, UNA PARTITA.
 *
 * Il cliente ha i suoi test con un fetch finto e il server i suoi con
 * chiamate dirette alle rotte: entrambi possono passare mentre il confine fra
 * loro e' rotto. Qui si avvia il server e gli si parla con il cliente vero -
 * compreso il lettore del flusso di eventi, che e' la parte piu' facile da
 * sbagliare perche' legge byte a pezzi.
 */
describe('una partita fra due client', () => {
  let server: Server;
  let uno: Cliente;
  let due: Cliente;
  let arena: ReturnType<typeof creaArena>;
  let orologio = 0;

  before(async () => {
    const archivio = archivioInMemoria();
    arena = creaArena({ archivio, carte: CARTE_BASE, seme: () => 2024 });
    server = creaServer({
      rotte: [...rotte(archivio), ...rotteOnline({ archivio, arena, adesso: () => orologio })],
      origini: ['http://localhost:5173'],
    });
    await new Promise<void>((pronto) => server.listen(0, '127.0.0.1', pronto));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    uno = creaCliente(base);
    due = creaCliente(base);
  });

  after(() => new Promise((chiuso) => server.close(chiuso)));

  test('dalla registrazione alla fine della partita', async () => {
    const a = await uno.registrazione('a@esempio.it', 'gocce-di-sangue-42', 'Alfa');
    const b = await due.registrazione('b@esempio.it', 'gocce-di-sangue-42', 'Beta');

    // I due flussi, come li apre l'interfaccia.
    const avvisiA: AvvisoRemoto[] = [];
    const avvisiB: AvvisoRemoto[] = [];
    const chiudiA = uno.apriFlusso(a.token, (v) => avvisiA.push(v));
    const chiudiB = due.apriFlusso(b.token, (v) => avvisiB.push(v));
    await attendi(() => avvisiA.length > 0 && avvisiB.length > 0);

    // Primo in coda: aspetta.
    const attesa = await uno.entraInCoda(a.token, mazzoBaseCompleto());
    assert.equal(attesa.inCoda, true);
    assert.equal(attesa.partita, null);

    // Secondo in coda: si parte, e lo sanno entrambi dal flusso.
    await due.entraInCoda(b.token, mazzoBaseCompleto());
    await attendi(() => avvisiA.some((v) => v.tipo === 'partitaTrovata'));
    await attendi(() => avvisiB.some((v) => v.tipo === 'partitaTrovata'));

    const partitaA = (await uno.leggiPartita(a.token)).partita!;
    const partitaB = (await due.leggiPartita(b.token)).partita!;
    assert.equal(partitaA.partitaId, partitaB.partitaId);
    assert.notEqual(partitaA.io, partitaB.io);

    // Il contasecondi che mostra l'interfaccia viene dalla scadenza del server.
    assert.equal(secondiAlTurno(partitaA, orologio), 60);

    // Chi non ha il turno viene respinto; chi ce l'ha passa, e l'altro lo
    // vede arrivare sul flusso senza chiedere niente.
    const stato = partitaA.stato as { turnoDi: 0 | 1 };
    const diTurno = stato.turnoDi === partitaA.io ? { c: uno, t: a.token } : { c: due, t: b.token };
    const fermo = diTurno.c === uno ? { c: due, t: b.token } : { c: uno, t: a.token };

    await assert.rejects(
      () => fermo.c.agisci(fermo.t, { tipo: 'passaFase' }),
      /turno/i,
      'il server deve rifiutare la mossa di chi non ha il turno',
    );

    const attesiPrima = (fermo.c === uno ? avvisiA : avvisiB).length;
    await diTurno.c.agisci(diTurno.t, { tipo: 'passaFase' });
    await attendi(() => (fermo.c === uno ? avvisiA : avvisiB).length > attesiPrima);

    // Abbandono: l'altro vince, il punteggio si muove, il riassunto lo dice.
    await fermo.c.abbandona(fermo.t);
    await arena.attendiScritture();

    const finale = (await diTurno.c.leggiPartita(diTurno.t)).partita!;
    assert.ok(finale.esito, 'la partita deve essere chiusa');
    const mioId = diTurno.c === uno ? a.utente.id : b.utente.id;
    assert.equal(finale.esito!.vincitoreId, mioId);
    assert.match(riassuntoEsito(finale, mioId), /vinto/);

    const io = await diTurno.c.io(diTurno.t);
    assert.ok(io.mmr > 1000, `il punteggio doveva salire, e ${io.mmr}`);
    assert.equal(io.vittorie, 1);

    chiudiA();
    chiudiB();
  });

  test('un mazzo invalido viene respinto dal server, non dal client', async () => {
    const c = await uno.registrazione('c@esempio.it', 'gocce-di-sangue-42', 'Gamma');
    await assert.rejects(() => uno.entraInCoda(c.token, ['base-01']), /20|carte/i);
  });

  test('chiudere il flusso smette di riaprirlo', async () => {
    const d = await due.registrazione('d@esempio.it', 'gocce-di-sangue-42', 'Delta');
    let quanti = 0;
    const chiudi = due.apriFlusso(d.token, () => quanti++);
    await attendi(() => quanti > 0);
    chiudi();
    const dopoLaChiusura = quanti;
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(quanti, dopoLaChiusura, 'nessun evento dopo la chiusura');
  });
});

/** Aspetta che una condizione diventi vera, o si arrende con un errore. */
async function attendi(condizione: () => boolean, timeoutMs = 3000): Promise<void> {
  const fine = Date.now() + timeoutMs;
  while (!condizione()) {
    if (Date.now() > fine) throw new Error('condizione mai verificata');
    await new Promise((r) => setTimeout(r, 20));
  }
}
