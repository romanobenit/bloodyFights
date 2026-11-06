import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  K, MMR_MINIMO, TOLLERANZA_MASSIMA, accoppia, nuovoMmr, probabilitaAttesa, tolleranza,
  type InAttesa,
} from '../src/elo.ts';

describe('punteggio', () => {
  test('a pari punteggio la partita e una monetina', () => {
    assert.equal(probabilitaAttesa(1000, 1000), 0.5);
  });

  test('vincere alza, perdere abbassa', () => {
    assert.ok(nuovoMmr(1000, 1000, true) > 1000);
    assert.ok(nuovoMmr(1000, 1000, false) < 1000);
  });

  test('a pari punteggio si muove di mezzo K', () => {
    assert.equal(nuovoMmr(1000, 1000, true), 1000 + K / 2);
  });

  test('battere un favorito vale piu che battere un fanalino', () => {
    const impresa = nuovoMmr(1000, 1600, true) - 1000;
    const dovere = nuovoMmr(1000, 400, true) - 1000;
    assert.ok(impresa > dovere, `${impresa} dovrebbe superare ${dovere}`);
  });

  test('perdere contro un favorito costa poco', () => {
    const scusabile = 1000 - nuovoMmr(1000, 1600, false);
    const grave = 1000 - nuovoMmr(1000, 400, false);
    assert.ok(grave > scusabile);
  });

  test('la somma resta in equilibrio: quanto prende uno lo lascia l altro', () => {
    const a = 1200, b = 900;
    const preso = nuovoMmr(a, b, true) - a;
    const lasciato = b - nuovoMmr(b, a, false);
    assert.ok(Math.abs(preso - lasciato) <= 1, `${preso} vs ${lasciato}`);
  });

  test('non si scende sotto il minimo', () => {
    let mmr = MMR_MINIMO;
    for (let i = 0; i < 50; i++) mmr = nuovoMmr(mmr, 2000, false);
    assert.equal(mmr, MMR_MINIMO);
  });

  test('restituisce sempre numeri interi', () => {
    for (const [a, b] of [[1000, 1013], [1457, 988], [333, 1777]]) {
      assert.equal(nuovoMmr(a, b, true) % 1, 0);
    }
  });
});

describe('tolleranza', () => {
  test('appena arrivato: cento punti', () => {
    assert.equal(tolleranza(0), 100);
  });

  test('si allarga di cinquanta ogni dieci secondi', () => {
    assert.equal(tolleranza(9_999), 100);
    assert.equal(tolleranza(10_000), 150);
    assert.equal(tolleranza(25_000), 200);
  });

  test('non cresce all infinito', () => {
    assert.equal(tolleranza(10 * 60 * 60 * 1000), TOLLERANZA_MASSIMA);
  });

  test('un tempo negativo non rompe niente', () => {
    assert.equal(tolleranza(-5000), 100);
  });
});

function attesa(utenteId: string, mmr: number, da = 0): InAttesa {
  return { utenteId, mmr, da };
}

describe('accoppiamento', () => {
  test('da solo non si gioca', () => {
    assert.deepEqual(accoppia([attesa('a', 1000)], 0), []);
  });

  test('due punteggi vicini si incontrano subito', () => {
    const esito = accoppia([attesa('a', 1000), attesa('b', 1050)], 0);
    assert.equal(esito.length, 1);
    assert.deepEqual([esito[0].primo.utenteId, esito[0].secondo.utenteId].sort(), ['a', 'b']);
  });

  test('due punteggi lontani aspettano', () => {
    assert.deepEqual(accoppia([attesa('a', 1000), attesa('b', 1400)], 0), []);
  });

  test('aspettando, i lontani finiscono per incontrarsi', () => {
    const coda = [attesa('a', 1000), attesa('b', 1300)];
    assert.equal(accoppia(coda, 0).length, 0);
    assert.equal(accoppia(coda, 60_000).length, 1);
  });

  test('la tolleranza serve a tutti e due: chi arriva ora non paga l attesa altrui', () => {
    // 'veterano' aspetta da due minuti, 'nuovo' e' appena entrato.
    const coda = [attesa('veterano', 1000, 0), attesa('nuovo', 1400, 120_000)];
    assert.deepEqual(accoppia(coda, 120_000), [], 'il nuovo non deve subire la forbice del veterano');
  });

  test('fra piu possibilita vince la piu equilibrata', () => {
    const esito = accoppia([attesa('a', 1000), attesa('b', 1090), attesa('c', 1010)], 0);
    assert.equal(esito.length, 1);
    assert.deepEqual([esito[0].primo.utenteId, esito[0].secondo.utenteId].sort(), ['a', 'c']);
  });

  test('nessuno gioca due partite nello stesso giro', () => {
    const esito = accoppia(
      [attesa('a', 1000), attesa('b', 1000), attesa('c', 1000), attesa('d', 1000)], 0,
    );
    assert.equal(esito.length, 2);
    const tutti = esito.flatMap((c) => [c.primo.utenteId, c.secondo.utenteId]);
    assert.equal(new Set(tutti).size, 4);
  });

  test('con un numero dispari uno resta in coda, non viene duplicato', () => {
    const esito = accoppia([attesa('a', 1000), attesa('b', 1000), attesa('c', 1000)], 0);
    assert.equal(esito.length, 1);
  });

  test('a pari differenza passa avanti chi aspetta da piu tempo', () => {
    const coda = [
      attesa('vecchio', 1000, 0), attesa('vecchio2', 1000, 0),
      attesa('appena', 1000, 50_000), attesa('appena2', 1000, 50_000),
    ];
    const primo = accoppia(coda, 50_000)[0];
    assert.deepEqual([primo.primo.utenteId, primo.secondo.utenteId].sort(), ['vecchio', 'vecchio2']);
  });

  test('non modifica la coda ricevuta', () => {
    const coda = [attesa('a', 1000), attesa('b', 1010)];
    const copia = structuredClone(coda);
    accoppia(coda, 0);
    assert.deepEqual(coda, copia);
  });
});
