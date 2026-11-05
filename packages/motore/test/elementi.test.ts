import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { moltiplicatoreElementale, dannoSuCarta, ELEMENTI } from '../src/elementi.ts';

describe('ciclo elementale', () => {
  test('la catena forte da +50%', () => {
    assert.equal(moltiplicatoreElementale('latte', 'veleno'), 1.5);
    assert.equal(moltiplicatoreElementale('veleno', 'acqua'), 1.5);
    assert.equal(moltiplicatoreElementale('acqua', 'fuoco'), 1.5);
    assert.equal(moltiplicatoreElementale('fuoco', 'petrolio'), 1.5);
  });

  test('la catena non e circolare: il petrolio non batte il latte col +50%', () => {
    assert.equal(moltiplicatoreElementale('petrolio', 'latte'), 1.2);
  });

  test('il petrolio da +20% a latte, veleno e acqua ma non al fuoco', () => {
    assert.equal(moltiplicatoreElementale('petrolio', 'latte'), 1.2);
    assert.equal(moltiplicatoreElementale('petrolio', 'veleno'), 1.2);
    assert.equal(moltiplicatoreElementale('petrolio', 'acqua'), 1.2);
    assert.equal(moltiplicatoreElementale('petrolio', 'fuoco'), 1);
  });

  test('il sangue e neutro in entrambe le direzioni', () => {
    for (const e of ELEMENTI) {
      assert.equal(moltiplicatoreElementale('sangue', e), 1, `sangue -> ${e}`);
      assert.equal(moltiplicatoreElementale(e, 'sangue'), 1, `${e} -> sangue`);
    }
  });

  test('nella v0.1 il vantaggio agisce solo sul danno inflitto', () => {
    // Il veleno batte l acqua. L acqua che colpisce il veleno non viene punita.
    assert.equal(moltiplicatoreElementale('veleno', 'acqua'), 1.5);
    assert.equal(moltiplicatoreElementale('acqua', 'veleno'), 1);
  });

  test('ogni elemento ha al massimo un bersaglio forte', () => {
    for (const a of ELEMENTI) {
      const forti = ELEMENTI.filter((d) => moltiplicatoreElementale(a, d) === 1.5);
      assert.ok(forti.length <= 1, `${a} ha ${forti.length} bersagli forti`);
    }
  });

  test('arrotondamento classico: 4,5 diventa 5', () => {
    assert.equal(dannoSuCarta(3, 'latte', 'veleno'), 5); // 3 x 1,5 = 4,5
    assert.equal(dannoSuCarta(1, 'latte', 'veleno'), 2); // 1,5 -> 2
    assert.equal(dannoSuCarta(5, 'petrolio', 'acqua'), 6); // 6,0
    assert.equal(dannoSuCarta(3, 'petrolio', 'acqua'), 4); // 3,6 -> 4
    assert.equal(dannoSuCarta(2, 'petrolio', 'acqua'), 2); // 2,4 -> 2
  });

  test('lo scarto fra vantaggio e svantaggio e doppio, non triplo', () => {
    // Il caso che il documento usa per giustificare la modifica alla bozza:
    // latte 4 attacco contro veleno 4 attacco.
    const latteSuVeleno = dannoSuCarta(4, 'latte', 'veleno');
    const velenoSuLatte = dannoSuCarta(4, 'veleno', 'latte');
    assert.equal(latteSuVeleno, 6);
    assert.equal(velenoSuLatte, 4);
  });
});
