import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.ts';
import { CARTE_BASE, mazzoBaseCompleto } from '../src/carte-base.ts';
import { applicaAzione, creaPartita, rigioca, validaMazzo, azioniLegali } from '../src/motore.ts';
import { casella } from '../src/tabellone.ts';
import { scenario, metti, cartaIn } from './aiuto.ts';
import type { Azione } from '../src/types.ts';
import type { StatoPartitaConCatalogo } from '../src/motore.ts';

function fineTurno(s: StatoPartitaConCatalogo): StatoPartitaConCatalogo {
  let stato = s;
  while (stato.fase !== 'support' && stato.fase !== 'finita')
    stato = applicaAzione(stato, { tipo: 'passaFase' });
  return stato.fase === 'finita' ? stato : applicaAzione(stato, { tipo: 'passaFase' });
}

describe('apertura della partita', () => {
  test('mano iniziale di 4 carte piu la pescata del primo turno', () => {
    const s = scenario({ primo: 0 });
    assert.equal(s.giocatori[0].mano.length, CONFIG.mazzo.manoIniziale + 1);
    assert.equal(s.giocatori[1].mano.length, CONFIG.mazzo.manoIniziale);
    assert.equal(s.giocatori[0].mazzo.length, 20 - 5);
  });

  test('entrambi partono con 20 punti vita e tabellone vuoto', () => {
    const s = scenario();
    for (const g of s.giocatori) {
      assert.equal(g.vita, CONFIG.tabellone.vitaGiocatore);
      assert.equal(g.tabellone.filter(Boolean).length, 0);
    }
  });

  test('un mazzo non da 20 carte non e giocabile', () => {
    const conosciute = new Set(CARTE_BASE.map((c) => c.id));
    assert.ok(validaMazzo(CARTE_BASE.slice(0, 19).map((c) => c.id), conosciute).length > 0);
    assert.equal(validaMazzo(mazzoBaseCompleto(), conosciute).length, 0);
  });

  test('piu di 2 copie della stessa carta non sono ammesse', () => {
    const conosciute = new Set(CARTE_BASE.map((c) => c.id));
    const mazzo = [
      ...new Array(3).fill('base-01'),
      ...CARTE_BASE.slice(1, 18).map((c) => c.id),
    ];
    assert.equal(mazzo.length, 20);
    const errori = validaMazzo(mazzo, conosciute);
    assert.ok(errori.some((e) => /copie/.test(e)));
  });
});

describe('economia delle gocce', () => {
  test('una goccia a turno, accumulata', () => {
    let s = scenario({ primo: 0 });
    assert.equal(s.giocatori[0].gocce, 1);
    s = fineTurno(s); // turno giocatore 1
    s = fineTurno(s); // di nuovo giocatore 0
    assert.equal(s.giocatori[0].gocce, 2);
  });

  test('il tetto e 10: l eccedenza e persa', () => {
    let s = scenario({ primo: 0 });
    s.giocatori[0].gocce = CONFIG.economia.tettoGocce;
    s = fineTurno(s);
    s = fineTurno(s);
    assert.equal(s.giocatori[0].gocce, CONFIG.economia.tettoGocce);
  });

  test('evocare scala le gocce; senza gocce la mossa e illegale', () => {
    let s = scenario({ primo: 0 });
    s.giocatori[0].gocce = 3;
    s.giocatori[0].mano = ['base-12']; // Cavaliere di Pece, costo 3
    s = applicaAzione(s, { tipo: 'evoca', indiceMano: 0, casella: 0 });
    assert.equal(s.giocatori[0].gocce, 0);
    assert.equal(cartaIn(s, 0, 0, 0)!.nome, 'Cavaliere di Pece');

    s.giocatori[0].mano = ['base-12'];
    assert.throws(() => applicaAzione(s, { tipo: 'evoca', indiceMano: 0, casella: 1 }), /insufficienti/);
  });

  test('una carta appena evocata e fresca', () => {
    let s = scenario({ primo: 0 });
    s.giocatori[0].mano = ['base-01'];
    s = applicaAzione(s, { tipo: 'evoca', indiceMano: 0, casella: 0 });
    assert.equal(cartaIn(s, 0, 0, 0)!.fresca, true);
    s = fineTurno(s);
    s = fineTurno(s);
    assert.equal(cartaIn(s, 0, 0, 0)!.fresca, false, 'operativa dal turno successivo');
  });

  test('non si evoca su una casella occupata', () => {
    let s = scenario({ primo: 0 });
    s.giocatori[0].gocce = 5;
    s.giocatori[0].mano = ['base-01', 'base-02'];
    s = applicaAzione(s, { tipo: 'evoca', indiceMano: 0, casella: 0 });
    assert.throws(() => applicaAzione(s, { tipo: 'evoca', indiceMano: 0, casella: 0 }), /occupata/);
  });
});

describe('pescata', () => {
  test('la carta pescata con la mano piena viene scartata', () => {
    let s = scenario({ primo: 0 });
    s.giocatori[0].mano = new Array(CONFIG.mazzo.manoMassima).fill('base-01');
    const cimiteroPrima = s.giocatori[0].cimitero.length;
    s = fineTurno(s);
    s = fineTurno(s);
    assert.equal(s.giocatori[0].mano.length, CONFIG.mazzo.manoMassima);
    assert.equal(s.giocatori[0].cimitero.length, cimiteroPrima + 1);
  });

  test('mazzo esaurito: non si pesca piu, nessun danno da fatica', () => {
    let s = scenario({ primo: 0 });
    s.giocatori[0].mazzo = [];
    const vitaPrima = s.giocatori[0].vita;
    s = fineTurno(s);
    s = fineTurno(s);
    assert.equal(s.giocatori[0].vita, vitaPrima);
    assert.ok(s.log.some((v) => v.tipo === 'mazzoEsaurito'));
  });
});

describe('riposizionamento', () => {
  test('una sola azione per turno', () => {
    let s = scenario({ primo: 0 });
    metti(s, 0, 1, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 3 });
    s = applicaAzione(s, { tipo: 'passaFase' });
    assert.equal(s.fase, 'riposizionamento');
    s = applicaAzione(s, { tipo: 'riposiziona', da: casella(1, 0), a: casella(0, 0) });
    assert.equal(cartaIn(s, 0, 0, 0)!.attacco, 3);
    assert.equal(cartaIn(s, 0, 1, 0), null);
    assert.throws(
      () => applicaAzione(s, { tipo: 'riposiziona', da: casella(0, 0), a: casella(0, 1) }),
      /gia usato/,
    );
  });

  test('scambio di due carte proprie', () => {
    let s = scenario({ primo: 0 });
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 1, nome: 'Alfa' });
    metti(s, 0, 1, 0, { tipo: 'distanza', elemento: 'sangue', vita: 5, attacco: 2, nome: 'Beta' });
    s = applicaAzione(s, { tipo: 'passaFase' });
    s = applicaAzione(s, { tipo: 'riposiziona', da: casella(0, 0), a: casella(1, 0) });
    assert.equal(cartaIn(s, 0, 0, 0)!.nome, 'Beta');
    assert.equal(cartaIn(s, 0, 1, 0)!.nome, 'Alfa');
  });

  test('non si riposiziona una casella vuota, ne fuori fase', () => {
    let s = scenario({ primo: 0 });
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 1 });
    assert.throws(() => applicaAzione(s, { tipo: 'riposiziona', da: 0, a: 1 }), /fase/);
    const r = applicaAzione(s, { tipo: 'passaFase' });
    assert.throws(() => applicaAzione(r, { tipo: 'riposiziona', da: 5, a: 6 }), /Nessuna carta/);
  });
});

describe('fase support', () => {
  function inFaseSupport(): StatoPartitaConCatalogo {
    let s = scenario({ primo: 0 });
    s = applicaAzione(s, { tipo: 'passaFase' });
    return applicaAzione(s, { tipo: 'passaFase' });
  }

  test('la cura vale l attacco del support e non supera la vita massima', () => {
    let s = inFaseSupport();
    metti(s, 0, 1, 0, { tipo: 'support', elemento: 'sangue', vita: 5, attacco: 3 });
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 2, attacco: 4, vitaMax: 9 });
    s = applicaAzione(s, { tipo: 'supportCura', casella: casella(1, 0), bersaglio: casella(0, 0) });
    assert.equal(cartaIn(s, 0, 0, 0)!.vita, 5);
  });

  test('la cura si ferma alla vita massima', () => {
    let s = inFaseSupport();
    metti(s, 0, 1, 0, { tipo: 'support', elemento: 'sangue', vita: 5, attacco: 7 });
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 8, attacco: 4, vitaMax: 9 });
    s = applicaAzione(s, { tipo: 'supportCura', casella: casella(1, 0), bersaglio: casella(0, 0) });
    assert.equal(cartaIn(s, 0, 0, 0)!.vita, 9);
  });

  test('in alternativa produce una goccia', () => {
    let s = inFaseSupport();
    metti(s, 0, 0, 0, { tipo: 'support', elemento: 'sangue', vita: 5, attacco: 3 });
    const prima = s.giocatori[0].gocce;
    s = applicaAzione(s, { tipo: 'supportGoccia', casella: 0 });
    assert.equal(s.giocatori[0].gocce, prima + 1);
  });

  test('un support agisce una volta sola per turno', () => {
    let s = inFaseSupport();
    metti(s, 0, 0, 0, { tipo: 'support', elemento: 'sangue', vita: 5, attacco: 3 });
    s = applicaAzione(s, { tipo: 'supportGoccia', casella: 0 });
    assert.throws(() => applicaAzione(s, { tipo: 'supportGoccia', casella: 0 }), /gia agito/);
  });

  test('due support agiscono in modo indipendente', () => {
    let s = inFaseSupport();
    metti(s, 0, 0, 0, { tipo: 'support', elemento: 'sangue', vita: 5, attacco: 3 });
    metti(s, 0, 0, 1, { tipo: 'support', elemento: 'sangue', vita: 5, attacco: 3 });
    metti(s, 0, 1, 1, { tipo: 'mischia', elemento: 'sangue', vita: 1, attacco: 3, vitaMax: 9 });
    const prima = s.giocatori[0].gocce;
    s = applicaAzione(s, { tipo: 'supportGoccia', casella: 0 });
    s = applicaAzione(s, { tipo: 'supportCura', casella: 1, bersaglio: casella(1, 1) });
    assert.equal(s.giocatori[0].gocce, prima + 1);
    assert.equal(cartaIn(s, 0, 1, 1)!.vita, 4);
  });

  test('un support fresco non agisce; una carta non support non puo agire', () => {
    let s = inFaseSupport();
    metti(s, 0, 0, 0, { tipo: 'support', elemento: 'sangue', vita: 5, attacco: 3, fresca: true });
    metti(s, 0, 0, 1, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 3 });
    assert.throws(() => applicaAzione(s, { tipo: 'supportGoccia', casella: 0 }), /fresca/);
    assert.throws(() => applicaAzione(s, { tipo: 'supportGoccia', casella: 1 }), /non e una carta support/);
  });
});

describe('compensazione del primo giocatore', () => {
  test('chi inizia salta la Fase 4 solo al suo primo turno', () => {
    let s = scenario({ primo: 0 });
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 4 });
    s = fineTurno(s);
    assert.equal(s.giocatori[1].vita, 20, 'primo turno: attacco saltato');
    assert.ok(s.log.some((v) => v.tipo === 'attaccoSaltato'));

    s = fineTurno(s); // turno del giocatore 1
    s = fineTurno(s); // secondo turno del giocatore 0
    assert.equal(s.giocatori[1].vita, 16, 'dal secondo turno attacca');
  });

  test('il secondo giocatore attacca gia al suo primo turno', () => {
    let s = scenario({ primo: 0 });
    metti(s, 1, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 4 });
    s = fineTurno(s); // giocatore 0
    s = fineTurno(s); // giocatore 1, primo turno
    assert.equal(s.giocatori[0].vita, 16);
  });
});

describe('purezza e determinismo', () => {
  test('applicaAzione non modifica lo stato ricevuto', () => {
    const s = scenario({ primo: 0 });
    const copia = structuredClone(s);
    s.giocatori[0].gocce = 5;
    copia.giocatori[0].gocce = 5;
    s.giocatori[0].mano = ['base-01'];
    copia.giocatori[0].mano = ['base-01'];
    const dopo = applicaAzione(s, { tipo: 'evoca', indiceMano: 0, casella: 0 });
    assert.deepEqual(s, copia, 'lo stato di partenza e intatto');
    assert.notDeepEqual(dopo, copia);
  });

  test('stesso seme, stessa partita', () => {
    const a = creaPartita({ idGiocatori: ['A', 'B'], mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()], carte: CARTE_BASE, seme: 777 });
    const b = creaPartita({ idGiocatori: ['A', 'B'], mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()], carte: CARTE_BASE, seme: 777 });
    assert.deepEqual(a, b);
  });

  test('semi diversi, mazzi mischiati diversamente', () => {
    const a = creaPartita({ idGiocatori: ['A', 'B'], mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()], carte: CARTE_BASE, seme: 1 });
    const b = creaPartita({ idGiocatori: ['A', 'B'], mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()], carte: CARTE_BASE, seme: 2 });
    assert.notDeepEqual(a.giocatori[0].mano, b.giocatori[0].mano);
  });

  test('una partita si rigioca dalla sequenza delle azioni', () => {
    const iniziale = scenario({ primo: 0, seme: 99 });
    const azioni: Azione[] = [
      { tipo: 'passaFase' }, { tipo: 'passaFase' }, { tipo: 'passaFase' },
      { tipo: 'passaFase' }, { tipo: 'passaFase' }, { tipo: 'passaFase' },
    ];
    assert.deepEqual(rigioca(iniziale, azioni), rigioca(iniziale, azioni));
  });
});

describe('azioni legali', () => {
  test('in fase di evocazione propone solo carte pagabili su caselle libere', () => {
    let s = scenario({ primo: 0 });
    s.giocatori[0].gocce = 1;
    s.giocatori[0].mano = ['base-01', 'base-19']; // costo 1 e costo 5
    const evocazioni = azioniLegali(s).filter((a) => a.tipo === 'evoca');
    assert.equal(evocazioni.length, CONFIG.tabellone.caselle, 'solo la carta da 1 goccia, su 8 caselle');
    assert.ok(evocazioni.every((a) => a.tipo === 'evoca' && a.indiceMano === 0));
  });

  test('a partita finita non resta nessuna azione', () => {
    const s = scenario({ primo: 0 });
    s.fase = 'finita';
    assert.deepEqual(azioniLegali(s), []);
  });

  test('ogni azione proposta e effettivamente applicabile', () => {
    let s = scenario({ primo: 0 });
    s.giocatori[0].gocce = 10;
    for (const azione of azioniLegali(s)) {
      assert.doesNotThrow(() => applicaAzione(s, azione), `azione ${JSON.stringify(azione)}`);
    }
  });
});
