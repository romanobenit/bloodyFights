import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CARTE_BASE, mazzoBaseCompleto } from '@bloodyfights/motore';
import { archivioInMemoria, datiVuoti, type Utente } from '../src/archivio.ts';
import { RICONNESSIONE_MS, TURNO_MS, creaArena } from '../src/arena.ts';

function utente(id: string, mmr = 1000): Utente {
  return {
    id, email: `${id}@x.it`, impronta: '', sale: '', nickname: id, bio: '',
    oro: 0, mmr, vittorie: 0, sconfitte: 0, cartaCreataId: null,
    creatoIl: new Date(0).toISOString(), tentativiFalliti: 0, ultimoTentativo: 0,
  };
}

function arena(mmrA = 1000, mmrB = 1000) {
  const dati = datiVuoti();
  dati.utenti.push(utente('a', mmrA), utente('b', mmrB));
  const archivio = archivioInMemoria(dati);
  let n = 0;
  return {
    archivio,
    a: creaArena({ archivio, carte: CARTE_BASE, seme: () => 777, nuovoId: () => `p${++n}` }),
  };
}

const MAZZO = mazzoBaseCompleto();

/** Mette due giocatori in partita e li dichiara collegati. */
function duePartiti(mmrA = 1000, mmrB = 1000) {
  const { a: arn, archivio } = arena(mmrA, mmrB);
  arn.entra('a', mmrA, MAZZO, 0);
  arn.entra('b', mmrB, MAZZO, 0);
  arn.passaIlTempo(0);
  arn.presente('a', 0);
  arn.presente('b', 0);
  // Se i punteggi fossero troppo distanti non si incontrerebbero, e ogni
  // prova qui sotto passerebbe per il motivo sbagliato.
  assert.ok(arn.partitaDi('a'), 'i due devono essersi incontrati');
  return { arn, archivio };
}

describe('coda', () => {
  test('da solo si resta in coda', () => {
    const { a: arn } = arena();
    arn.entra('a', 1000, MAZZO, 0);
    arn.passaIlTempo(0);
    assert.equal(arn.partitaDi('a'), null);
    assert.equal(arn.quantiInCoda(), 1);
  });

  test('due in coda diventano una partita', () => {
    const { arn } = duePartiti();
    assert.equal(arn.quantiInCoda(), 0);
    assert.equal(arn.partitaDi('a')?.id, arn.partitaDi('b')?.id);
  });

  test('un mazzo non valido non entra in coda', () => {
    const { a: arn } = arena();
    assert.throws(() => arn.entra('a', 1000, ['base-01'], 0), /mazzo|cart|20/i);
    assert.equal(arn.quantiInCoda(), 0);
  });

  test('non si entra in coda con una partita in corso', () => {
    const { arn } = duePartiti();
    assert.throws(() => arn.entra('a', 1000, MAZZO, 0), /in corso/i);
  });

  test('si esce dalla coda', () => {
    const { a: arn } = arena();
    arn.entra('a', 1000, MAZZO, 0);
    arn.esci('a');
    arn.entra('b', 1000, MAZZO, 0);
    arn.passaIlTempo(0);
    assert.equal(arn.partitaDi('b'), null);
  });

  test('entrambi vengono avvisati del ritrovamento', () => {
    const { a: arn } = arena();
    const visti: string[] = [];
    arn.ascolta('a', (v) => visti.push(`a:${v.tipo}`));
    arn.ascolta('b', (v) => visti.push(`b:${v.tipo}`));
    arn.entra('a', 1000, MAZZO, 0);
    arn.entra('b', 1000, MAZZO, 0);
    arn.passaIlTempo(0);
    assert.ok(visti.includes('a:partitaTrovata'));
    assert.ok(visti.includes('b:partitaTrovata'));
  });

  test('smettere di ascoltare vale davvero', () => {
    const { a: arn } = arena();
    let quanti = 0;
    const stacca = arn.ascolta('a', () => quanti++);
    stacca();
    arn.entra('a', 1000, MAZZO, 0);
    assert.equal(quanti, 0);
  });

  test('un ascoltatore che esplode non ferma l altro', () => {
    const { a: arn } = arena();
    let arrivato = false;
    arn.ascolta('a', () => { throw new Error('crac'); });
    arn.ascolta('a', () => { arrivato = true; });
    arn.entra('a', 1000, MAZZO, 0);
    assert.equal(arrivato, true);
  });
});

describe('stato occultato', () => {
  test('ognuno vede la sua mano e non quella dell altro', () => {
    const { arn } = duePartiti();
    const mia = arn.vista('a')!;
    assert.equal(mia.io, 0);
    const avversario = JSON.stringify(mia.stato.giocatori[1].mano);
    assert.ok(!avversario.includes('base-'), avversario);
    assert.ok(JSON.stringify(mia.stato.giocatori[0].mano).includes('base-'));
  });

  test('chi non gioca non vede niente', () => {
    const { arn } = duePartiti();
    assert.equal(arn.vista('estraneo'), null);
  });
});

describe('mosse', () => {
  test('solo chi ha il turno puo agire', () => {
    const { arn } = duePartiti();
    const diTurno = arn.partitaDi('a')!.stato.turnoDi;
    const fermo = diTurno === 0 ? 'b' : 'a';
    assert.throws(() => arn.agisci(fermo, { tipo: 'passaFase' }, 0), /turno/i);
  });

  test('chi non gioca non puo agire', () => {
    const { arn } = duePartiti();
    assert.throws(() => arn.agisci('estraneo', { tipo: 'passaFase' }, 0), /partite/i);
  });

  test('passare le fasi avanza la partita', () => {
    const { arn } = duePartiti();
    const partita = arn.partitaDi('a')!;
    const chi = partita.utenti[partita.stato.turnoDi];
    const prima = partita.stato.fase;
    arn.agisci(chi, { tipo: 'passaFase' }, 0);
    assert.notEqual(arn.partitaDi('a')!.stato.fase, prima);
  });

  test('il cronometro riparte solo quando cambia il turno', () => {
    const { arn } = duePartiti();
    const partita = arn.partitaDi('a')!;
    const chi = partita.utenti[partita.stato.turnoDi];
    arn.agisci(chi, { tipo: 'passaFase' }, 5_000);
    assert.equal(partita.scadeIl, TURNO_MS, 'il turno non e cambiato: scadenza intatta');

    for (let i = 0; i < 4 && partita.stato.turnoDi === partita.stato.turnoDi; i++) {
      if (partita.utenti[partita.stato.turnoDi] !== chi) break;
      arn.agisci(chi, { tipo: 'passaFase' }, 5_000);
    }
    assert.equal(partita.scadeIl, 5_000 + TURNO_MS, 'turno cambiato: cronometro nuovo');
  });

  test('una mossa avvisa entrambi i giocatori', () => {
    const { arn } = duePartiti();
    const visti: string[] = [];
    arn.ascolta('a', (v) => visti.push(`a:${v.tipo}`));
    arn.ascolta('b', (v) => visti.push(`b:${v.tipo}`));
    const partita = arn.partitaDi('a')!;
    arn.agisci(partita.utenti[partita.stato.turnoDi], { tipo: 'passaFase' }, 0);
    assert.deepEqual(visti.sort(), ['a:stato', 'b:stato']);
  });
});

describe('cronometro del turno', () => {
  test('a turno scaduto il turno passa all altro', () => {
    const { arn } = duePartiti();
    const partita = arn.partitaDi('a')!;
    const chiEra = partita.stato.turnoDi;
    arn.passaIlTempo(TURNO_MS);
    assert.notEqual(partita.stato.turnoDi, chiEra);
  });

  test('scadere il turno non chiude la partita', () => {
    const { arn } = duePartiti();
    arn.passaIlTempo(TURNO_MS);
    assert.equal(arn.partitaDi('a')!.esito, null);
  });

  test('un turno scaduto riparte col tempo pieno', () => {
    const { arn } = duePartiti();
    arn.passaIlTempo(TURNO_MS);
    assert.equal(arn.partitaDi('a')!.scadeIl, TURNO_MS * 2);
  });

  test('prima della scadenza non succede niente', () => {
    const { arn } = duePartiti();
    const chiEra = arn.partitaDi('a')!.stato.turnoDi;
    arn.passaIlTempo(TURNO_MS - 1);
    assert.equal(arn.partitaDi('a')!.stato.turnoDi, chiEra);
  });
});

describe('abbandono', () => {
  test('chi sparisce per mezzo minuto perde', async () => {
    const { arn, archivio } = duePartiti();
    arn.assente('a', 0);
    arn.passaIlTempo(RICONNESSIONE_MS);

    const esito = arn.partitaDi('b')!.esito;
    assert.equal(esito?.vincitoreId, 'b');
    assert.equal(esito?.motivo, 'abbandono');

    await arn.attendiScritture();
    const dati = await archivio.leggi();
    assert.ok(dati.utenti.find((u) => u.id === 'b')!.mmr > 1000);
    assert.equal(dati.utenti.find((u) => u.id === 'b')!.vittorie, 1);
    assert.equal(dati.utenti.find((u) => u.id === 'a')!.sconfitte, 1);
  });

  test('tornare prima dei trenta secondi salva la partita', () => {
    const { arn } = duePartiti();
    arn.assente('a', 0);
    arn.passaIlTempo(RICONNESSIONE_MS - 1_000);
    arn.presente('a', RICONNESSIONE_MS - 1_000);
    arn.passaIlTempo(RICONNESSIONE_MS + 10_000);
    assert.equal(arn.partitaDi('a')!.esito, null);
  });

  test('se sparisce anche l altro non vince nessuno', () => {
    const { arn } = duePartiti();
    arn.assente('a', 0);
    arn.assente('b', 0);
    arn.passaIlTempo(RICONNESSIONE_MS);
    assert.equal(arn.partitaDi('a')!.esito?.vincitoreId, null);
  });

  test('chi non si collega mai perde: si parte da assenti', () => {
    const { a: arn } = arena();
    arn.entra('a', 1000, MAZZO, 0);
    arn.entra('b', 1000, MAZZO, 0);
    arn.passaIlTempo(0);
    arn.presente('a', 0);
    arn.passaIlTempo(RICONNESSIONE_MS);
    assert.equal(arn.partitaDi('a')!.esito?.vincitoreId, 'a');
  });

  test('abbandonare a mano da la vittoria all avversario, subito', () => {
    const { arn } = duePartiti();
    arn.abbandona('a');
    assert.equal(arn.partitaDi('b')!.esito?.vincitoreId, 'b');
  });

  test('a partita conclusa non si gioca piu', () => {
    const { arn } = duePartiti();
    arn.abbandona('a');
    const partita = arn.partitaDi('b')!;
    assert.throws(() => arn.agisci(partita.utenti[partita.stato.turnoDi], { tipo: 'passaFase' }, 0), /finita/i);
  });

  test('il tabellone finale resta leggibile da entrambi', () => {
    const { arn } = duePartiti();
    arn.abbandona('a');
    assert.ok(arn.vista('a')?.esito);
    assert.ok(arn.vista('b')?.esito);
  });

  test('a partita finita si puo rientrare in coda', () => {
    const { arn } = duePartiti();
    arn.abbandona('a');
    arn.entra('a', 1000, MAZZO, 1_000);
    assert.equal(arn.quantiInCoda(), 1);
  });
});

describe('punteggio al termine', () => {
  test('il vincitore sale, il perdente scende, e la vista lo riporta', async () => {
    const { arn, archivio } = duePartiti(1000, 1080);
    arn.abbandona('b');
    await arn.attendiScritture();

    const dati = await archivio.leggi();
    const a = dati.utenti.find((u) => u.id === 'a')!;
    const b = dati.utenti.find((u) => u.id === 'b')!;
    assert.ok(a.mmr > 1000, `${a.mmr}`);
    assert.ok(b.mmr < 1080, `${b.mmr}`);
    assert.equal(arn.vista('a')!.esito!.mmr['a'], a.mmr);
  });

  test('un pareggio non muove i punteggi', async () => {
    const { arn, archivio } = duePartiti();
    arn.assente('a', 0);
    arn.assente('b', 0);
    arn.passaIlTempo(RICONNESSIONE_MS);
    await arn.attendiScritture();
    const dati = await archivio.leggi();
    assert.equal(dati.utenti.find((u) => u.id === 'a')!.mmr, 1000);
    assert.equal(dati.utenti.find((u) => u.id === 'b')!.mmr, 1000);
  });
});

describe('pulizia', () => {
  test('le partite concluse vengono dimenticate, non le altre', () => {
    const { arn } = duePartiti();
    const id = arn.partitaDi('a')!.id;
    arn.pulisci(10 * 60_000);
    assert.ok(arn.partita(id), 'una partita in corso non si butta');

    arn.abbandona('a');
    arn.pulisci(60 * 60_000);
    assert.equal(arn.partita(id), null);
    assert.equal(arn.vista('a'), null);
  });
});
