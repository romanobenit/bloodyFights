import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applicaAzione } from '../src/motore.ts';
import { scenario, metti, cartaIn } from './aiuto.ts';
import type { StatoPartitaConCatalogo } from '../src/motore.ts';

/** Porta il giocatore di turno dalla fase 1 alla risoluzione dell attacco. */
function attacca(stato: StatoPartitaConCatalogo): StatoPartitaConCatalogo {
  let s = stato;
  while (s.fase !== 'support') s = applicaAzione(s, { tipo: 'passaFase' });
  return applicaAzione(s, { tipo: 'passaFase' });
}

/**
 * Chi inizia salta la Fase 4 al primo turno: per testare il combattimento
 * si fa giocare al giocatore 0 un turno a vuoto, poi al giocatore 1, e si
 * torna al giocatore 0 che ora puo attaccare.
 */
function scenarioCombattimento(): StatoPartitaConCatalogo {
  let s = scenario({ primo: 0 });
  s = attacca(s); // turno 1 del giocatore 0: attacco saltato
  s = attacca(s); // turno del giocatore 1
  return s; // ora e' di nuovo il turno del giocatore 0, fase evocazione
}

describe('cascata dei bersagli', () => {
  test('primo livello: colpisce la prima linea avversaria nella sua colonna', () => {
    let s = scenarioCombattimento();
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 3 });
    metti(s, 1, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 9, attacco: 2 });
    metti(s, 1, 1, 0, { tipo: 'mischia', elemento: 'sangue', vita: 9, attacco: 2 });
    s = attacca(s);
    assert.equal(cartaIn(s, 1, 0, 0)!.vita, 6);
    assert.equal(cartaIn(s, 1, 1, 0)!.vita, 9, 'la seconda linea non viene toccata');
    assert.equal(s.giocatori[1].vita, 20);
  });

  test('secondo livello: prima linea vuota, colpisce la seconda', () => {
    let s = scenarioCombattimento();
    metti(s, 0, 0, 2, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 4 });
    metti(s, 1, 1, 2, { tipo: 'mischia', elemento: 'sangue', vita: 9, attacco: 2 });
    s = attacca(s);
    assert.equal(cartaIn(s, 1, 1, 2)!.vita, 5);
    assert.equal(s.giocatori[1].vita, 20);
  });

  test('terzo livello: colonna completamente vuota, colpisce il giocatore', () => {
    let s = scenarioCombattimento();
    metti(s, 0, 0, 3, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 4 });
    // La colonna 3 avversaria e' vuota, ma le altre colonne sono presidiate:
    // non devono assorbire nulla.
    metti(s, 1, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 9, attacco: 2 });
    s = attacca(s);
    assert.equal(s.giocatori[1].vita, 16);
    assert.equal(cartaIn(s, 1, 0, 0)!.vita, 9);
  });

  test('il danno al giocatore ignora il moltiplicatore elementale', () => {
    let s = scenarioCombattimento();
    // Il latte batte il veleno, ma il giocatore non ha elemento.
    metti(s, 0, 0, 1, { tipo: 'mischia', elemento: 'latte', vita: 5, attacco: 4 });
    s = attacca(s);
    assert.equal(s.giocatori[1].vita, 16, 'danno pieno, non 6');
  });
});

describe('chi attacca e chi no', () => {
  test('una carta da mischia in seconda linea resta inattiva', () => {
    let s = scenarioCombattimento();
    metti(s, 0, 1, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 7 });
    s = attacca(s);
    assert.equal(s.giocatori[1].vita, 20);
  });

  test('una carta a distanza in seconda linea colpisce scavalcando', () => {
    let s = scenarioCombattimento();
    metti(s, 0, 1, 0, { tipo: 'distanza', elemento: 'sangue', vita: 5, attacco: 7 });
    s = attacca(s);
    assert.equal(s.giocatori[1].vita, 13);
  });

  test('i support non attaccano mai, il loro attacco e cura', () => {
    let s = scenarioCombattimento();
    metti(s, 0, 0, 0, { tipo: 'support', elemento: 'sangue', vita: 5, attacco: 7 });
    s = attacca(s);
    assert.equal(s.giocatori[1].vita, 20);
  });

  test('una carta fresca non attacca', () => {
    let s = scenarioCombattimento();
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 7, fresca: true });
    s = attacca(s);
    assert.equal(s.giocatori[1].vita, 20);
  });

  test('il difensore non risponde: chi viene colpito non infligge nulla', () => {
    let s = scenarioCombattimento();
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 3 });
    metti(s, 1, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 9, attacco: 9 });
    s = attacca(s);
    assert.equal(cartaIn(s, 0, 0, 0)!.vita, 5, 'l attaccante non subisce nulla');
  });
});

describe('risoluzione a fotografia', () => {
  test('due attaccanti sulla stessa colonna colpiscono lo stesso bersaglio', () => {
    // Senza la fotografia, il primo colpo uccide il bersaglio e il secondo
    // slitterebbe sulla carta dietro: e' esattamente il bug che la regola evita.
    let s = scenarioCombattimento();
    metti(s, 0, 0, 0, { tipo: 'mischia',  elemento: 'sangue', vita: 5, attacco: 4 });
    metti(s, 0, 1, 0, { tipo: 'distanza', elemento: 'sangue', vita: 5, attacco: 4 });
    metti(s, 1, 0, 0, { tipo: 'mischia',  elemento: 'sangue', vita: 3, attacco: 1 });
    metti(s, 1, 1, 0, { tipo: 'mischia',  elemento: 'sangue', vita: 9, attacco: 1 });
    s = attacca(s);
    assert.equal(cartaIn(s, 1, 0, 0), null, 'la prima linea muore');
    assert.equal(cartaIn(s, 1, 1, 0)!.vita, 9, 'la seconda linea e intatta: 8 danni sono andati sul morto');
  });

  test('il danno in eccesso non trabocca sul giocatore', () => {
    let s = scenarioCombattimento();
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 10 });
    metti(s, 1, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 1, attacco: 1 });
    s = attacca(s);
    assert.equal(cartaIn(s, 1, 0, 0), null);
    assert.equal(s.giocatori[1].vita, 20);
  });

  test('la carta morta finisce nel cimitero', () => {
    let s = scenarioCombattimento();
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 10 });
    metti(s, 1, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 2, attacco: 1 });
    s = attacca(s);
    assert.equal(s.giocatori[1].cimitero.length, 1);
  });

  test('quattro colonne presidiate: nessun danno al giocatore', () => {
    let s = scenarioCombattimento();
    for (let c = 0; c < 4; c++) {
      metti(s, 0, 0, c, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 3 });
      metti(s, 1, 0, c, { tipo: 'mischia', elemento: 'sangue', vita: 9, attacco: 3 });
    }
    s = attacca(s);
    assert.equal(s.giocatori[1].vita, 20);
  });
});

describe('vittoria', () => {
  test('si perde quando la vita scende a 0 o meno', () => {
    let s = scenarioCombattimento();
    s.giocatori[1].vita = 3;
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 4 });
    s = attacca(s);
    assert.equal(s.vincitore, 0);
    assert.equal(s.fase, 'finita');
    assert.ok(s.giocatori[1].vita <= 0);
  });

  test('a partita finita ogni azione e illegale', () => {
    let s = scenarioCombattimento();
    s.giocatori[1].vita = 1;
    metti(s, 0, 0, 0, { tipo: 'mischia', elemento: 'sangue', vita: 5, attacco: 4 });
    s = attacca(s);
    assert.throws(() => applicaAzione(s, { tipo: 'passaFase' }), /finita/);
  });
});
