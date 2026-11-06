import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { CARTE_BASE, mazzoBaseCompleto } from '@bloodyfights/motore';
import { archivioInMemoria } from '../src/archivio.ts';
import { creaArena } from '../src/arena.ts';
import { creaServer } from '../src/http.ts';
import { rotte } from '../src/rotte.ts';
import { rotteOnline } from '../src/rotte-online.ts';

const ORIGINE = 'http://localhost:5173';
const MAZZO = mazzoBaseCompleto();

let server: Server;
let base: string;
let arena: ReturnType<typeof creaArena>;
let orologio = 0;

before(async () => {
  const archivio = archivioInMemoria();
  arena = creaArena({ archivio, carte: CARTE_BASE, seme: () => 999 });
  server = creaServer({
    rotte: [...rotte(archivio), ...rotteOnline({ archivio, arena, adesso: () => orologio })],
    origini: [ORIGINE],
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  const indirizzo = server.address();
  base = `http://localhost:${typeof indirizzo === 'object' && indirizzo ? indirizzo.port : 0}`;
});

after(() => server?.close());

async function chiama(metodo: string, percorso: string, token?: string, corpo?: unknown) {
  const risposta = await fetch(`${base}${percorso}`, {
    method: metodo,
    headers: {
      Origin: ORIGINE,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const testo = await risposta.text();
  return { stato: risposta.status, corpo: testo ? JSON.parse(testo) : null };
}

async function iscrivi(nome: string) {
  const esito = await chiama('POST', '/identita/registrazione', undefined, {
    email: `${nome}@bloodyfights.test`, password: 'parolaLunghissima1', nickname: nome,
  });
  assert.equal(esito.stato, 201, JSON.stringify(esito.corpo));
  return esito.corpo.token as string;
}

/**
 * Apre il flusso con fetch - non con EventSource - perche' cosi' il token
 * viaggia nell'intestazione e non nell'indirizzo. Restituisce gli eventi
 * raccolti e il modo per chiudere.
 */
function apriFlusso(token: string) {
  const annulla = new AbortController();
  const eventi: { evento: string; dati: any }[] = [];
  const attese: ((e: any) => void)[] = [];

  const pronto = fetch(`${base}/online/flusso`, {
    headers: { Origin: ORIGINE, Authorization: `Bearer ${token}` },
    signal: annulla.signal,
  }).then(async (risposta) => {
    assert.equal(risposta.status, 200);
    assert.match(risposta.headers.get('content-type') ?? '', /text\/event-stream/);
    const lettore = risposta.body!.getReader();
    const decodifica = new TextDecoder();
    let avanzo = '';
    try {
      for (;;) {
        const { done, value } = await lettore.read();
        if (done) break;
        avanzo += decodifica.decode(value, { stream: true });
        const pezzi = avanzo.split('\n\n');
        avanzo = pezzi.pop() ?? '';
        for (const pezzo of pezzi) {
          const evento = /^event: (.+)$/m.exec(pezzo)?.[1];
          const dati = /^data: (.+)$/m.exec(pezzo)?.[1];
          if (!evento || !dati) continue;
          const voce = { evento, dati: JSON.parse(dati) };
          eventi.push(voce);
          attese.shift()?.(voce);
        }
      }
    } catch {
      // chiusura voluta
    }
    return risposta;
  });

  return {
    eventi,
    pronto,
    /** Aspetta il prossimo evento di un certo tipo, o quello gia arrivato. */
    async aspetta(tipo: string, timeoutMs = 2000) {
      const gia = eventi.find((e) => e.evento === tipo);
      if (gia) return gia;
      return await new Promise<any>((risolvi, rifiuta) => {
        const scadenza = setTimeout(() => {
          attese.splice(attese.indexOf(ascolta), 1);
          rifiuta(new Error(`nessun evento ${tipo}`));
        }, timeoutMs);
        // L'ascoltatore si rimette in coda da solo se arriva un altro tipo:
        // niente arguments.callee, che in un modulo non esiste.
        const ascolta = (e: any) => {
          if (e.evento !== tipo) {
            attese.push(ascolta);
            return;
          }
          clearTimeout(scadenza);
          risolvi(e);
        };
        attese.push(ascolta);
      });
    },
    chiudi: () => annulla.abort(),
  };
}

describe('rotte online: protezione', () => {
  test('senza token non si entra in coda', async () => {
    assert.equal((await chiama('POST', '/online/coda', undefined, { mazzo: MAZZO })).stato, 401);
  });

  test('senza token non si legge la partita', async () => {
    assert.equal((await chiama('GET', '/online/partita')).stato, 401);
  });

  test('senza token non si apre il flusso', async () => {
    assert.equal((await chiama('GET', '/online/flusso')).stato, 401);
  });

  test('un mazzo mancante e colpa di chi chiama, non del server', async () => {
    const token = await iscrivi('malformato');
    const esito = await chiama('POST', '/online/coda', token, {});
    assert.equal(esito.stato, 400);
  });

  test('un mazzo invalido risponde 409, non 500', async () => {
    const token = await iscrivi('mazzocorto');
    const esito = await chiama('POST', '/online/coda', token, { mazzo: ['base-01'] });
    assert.equal(esito.stato, 409);
    assert.match(esito.corpo.errore, /20|carte/i);
  });
});

describe('rotte online: una partita intera', () => {
  test('due giocatori si incontrano, giocano e il server tiene il punto', async () => {
    const uno = await iscrivi('uno');
    const due = await iscrivi('due');

    // Primo in coda: resta in attesa.
    const attesa = await chiama('POST', '/online/coda', uno, { mazzo: MAZZO });
    assert.equal(attesa.stato, 200);
    assert.equal(attesa.corpo.inCoda, true);
    assert.equal(attesa.corpo.partita, null);

    // Secondo in coda: la partita parte subito, senza aspettare il battito.
    const trovata = await chiama('POST', '/online/coda', due, { mazzo: MAZZO });
    assert.equal(trovata.corpo.inCoda, false);
    assert.ok(trovata.corpo.partita, 'la partita deve esserci');

    const partitaUno = (await chiama('GET', '/online/partita', uno)).corpo.partita;
    const partitaDue = (await chiama('GET', '/online/partita', due)).corpo.partita;
    assert.equal(partitaUno.partitaId, partitaDue.partitaId);
    assert.notEqual(partitaUno.io, partitaDue.io);

    // Ognuno vede la propria mano e non quella dell'altro.
    assert.ok(JSON.stringify(partitaUno.stato.giocatori[partitaUno.io].mano).includes('base-'));
    assert.ok(!JSON.stringify(partitaUno.stato.giocatori[1 - partitaUno.io].mano).includes('base-'));

    // Chi non ha il turno non muove.
    const diTurno = partitaUno.stato.turnoDi === partitaUno.io ? uno : due;
    const fermo = diTurno === uno ? due : uno;
    const rifiutata = await chiama('POST', '/online/partita/azione', fermo, {
      azione: { tipo: 'passaFase' },
    });
    assert.equal(rifiutata.stato, 409);
    assert.match(rifiutata.corpo.errore, /turno/i);

    // Chi ha il turno, si.
    const mossa = await chiama('POST', '/online/partita/azione', diTurno, {
      azione: { tipo: 'passaFase' },
    });
    assert.equal(mossa.stato, 200);
    assert.notEqual(mossa.corpo.partita.stato.fase, partitaUno.stato.fase);

    // L'avversario vede subito la mossa: l'autorita e una sola.
    const dopo = (await chiama('GET', '/online/partita', fermo)).corpo.partita;
    assert.equal(dopo.stato.fase, mossa.corpo.partita.stato.fase);

    // Abbandono: l'altro vince e il punteggio si muove.
    await chiama('POST', '/online/partita/abbandono', fermo);
    await arena.attendiScritture();
    const finale = (await chiama('GET', '/online/partita', diTurno)).corpo.partita;
    assert.equal(finale.esito.motivo, 'abbandono');
    const io = (await chiama('GET', '/identita/io', diTurno)).corpo.utente;
    assert.ok(io.mmr > 1000, `${io.mmr}`);
    assert.equal(io.vittorie, 1);
  });

  test('si esce dalla coda e non si viene piu accoppiati', async () => {
    const tre = await iscrivi('tre');
    await chiama('POST', '/online/coda', tre, { mazzo: MAZZO });
    assert.equal((await chiama('DELETE', '/online/coda', tre)).stato, 204);
    assert.equal((await chiama('GET', '/online/partita', tre)).corpo.inCoda, null);
  });
});

describe('flusso in tempo reale', () => {
  test('il flusso manda subito lo stato e poi gli aggiornamenti', async () => {
    const quattro = await iscrivi('quattro');
    const cinque = await iscrivi('cinque');

    const flusso = apriFlusso(quattro);
    const primo = await flusso.aspetta('stato');
    assert.equal(primo.dati.partita, null, 'senza partita, lo stato e vuoto');

    await chiama('POST', '/online/coda', quattro, { mazzo: MAZZO });
    await flusso.aspetta('inCoda');

    await chiama('POST', '/online/coda', cinque, { mazzo: MAZZO });
    const trovata = await flusso.aspetta('partitaTrovata');
    assert.ok(trovata.dati.partita.partitaId);

    // Una mossa dell'avversario arriva sul flusso, senza chiedere niente.
    const mia = trovata.dati.partita;
    const quantiPrima = flusso.eventi.filter((e) => e.evento === 'stato').length;
    const chiMuove = mia.stato.turnoDi === mia.io ? quattro : cinque;
    await chiama('POST', '/online/partita/azione', chiMuove, { azione: { tipo: 'passaFase' } });

    await new Promise((r) => setTimeout(r, 200));
    const quantiDopo = flusso.eventi.filter((e) => e.evento === 'stato').length;
    assert.ok(quantiDopo > quantiPrima, 'la mossa deve arrivare sul flusso');

    // La fine della partita arriva come evento.
    await chiama('POST', '/online/partita/abbandono', cinque);
    const fine = await flusso.aspetta('finita');
    assert.ok(fine.dati.partita.esito);

    flusso.chiudi();
    await flusso.pronto;
  });

  test('il flusso aperto e la presenza: chi lo chiude viene dato per assente', async () => {
    const sei = await iscrivi('sei');
    const sette = await iscrivi('sette');
    await chiama('POST', '/online/coda', sei, { mazzo: MAZZO });
    await chiama('POST', '/online/coda', sette, { mazzo: MAZZO });

    const flussoSei = apriFlusso(sei);
    const flussoSette = apriFlusso(sette);
    await flussoSei.aspetta('stato');
    await flussoSette.aspetta('stato');

    const partita = (await chiama('GET', '/online/partita', sei)).corpo.partita;
    const id = partita.partitaId;
    assert.equal(arena.partita(id)!.assenteDa[arena.partita(id)!.utenti[0]], null, 'presenti');

    // Sei chiude: parte il conto alla rovescia.
    flussoSei.chiudi();
    await new Promise((r) => setTimeout(r, 200));
    const quale = arena.partita(id)!.utenti.find((u) => arena.partita(id)!.assenteDa[u] !== null);
    assert.ok(quale, 'chi ha chiuso deve risultare assente');

    // Passati trenta secondi, vince chi e rimasto.
    orologio += 31_000;
    arena.passaIlTempo(orologio);
    const esito = arena.partita(id)!.esito;
    assert.equal(esito?.motivo, 'abbandono');
    assert.notEqual(esito?.vincitoreId, quale);

    flussoSette.chiudi();
    await flussoSette.pronto;
  });
});
