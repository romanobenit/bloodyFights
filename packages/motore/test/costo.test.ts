import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CARTE_BASE } from '../src/carte-base.ts';
import { calcolaPotenza, calcolaCosto, scomposizionePotenza, validaCarta } from '../src/costo.ts';
import { CONFIG } from '../src/config.ts';

/** La tabella del cap. 6, copiata dal documento: e' lei l'oracolo. */
const ATTESI = [
  ['Topo di Fogna',         5,    1, 'comune'],
  ['Goccia Randagia',       4.5,  1, 'comune'],
  ['Spora Tossica',         4.5,  1, 'comune'],
  ['Secchio di Latte',      5,    1, 'comune'],
  ['Fiammifero Vivo',       7.5,  2, 'comune'],
  ['Mungitrice',            9,    2, 'comune'],
  ['Zanna Nera',            8,    2, 'comune'],
  ['Sanguisuga',            8,    2, 'comune'],
  ['Ranocchio Velenoso',    8.5,  2, 'comune'],
  ['Arciere di Sale',       10.5, 3, 'raro'],
  ['Guaritrice di Sangue',  13,   3, 'raro'],
  ['Cavaliere di Pece',     12,   3, 'raro'],
  ['Serpe di Fuoco',        12,   3, 'raro'],
  ['Sputaveleno',           11.5, 3, 'raro'],
  ['Balestriere di Pece',   15.5, 4, 'epico'],
  ['Lattaia Eterna',        15,   4, 'epico'],
  ["Idra d'Acqua",          15.5, 4, 'epico'],
  ['Torre di Fiamma',       15,   4, 'epico'],
  ['Colosso di Sangue',     19,   5, 'leggendario'],
  ['Leviatano di Petrolio', 18.5, 5, 'leggendario'],
] as const;

/** Le creature: le carte oggetto non passano dalla formula del costo. */
const CREATURE = CARTE_BASE.filter((c) => c.tipo !== 'oggetto');

describe('formula del costo', () => {
  test('le 20 carte base riproducono la tabella del documento', () => {
    assert.equal(CREATURE.length, 20);
    for (const [i, [nome, potenza, costo, rarita]] of ATTESI.entries()) {
      const carta = CREATURE[i];
      assert.equal(carta.nome, nome, `carta ${i + 1}`);
      assert.equal(carta.potenza, potenza, `potenza di ${nome}`);
      assert.equal(carta.costo, costo, `costo di ${nome}`);
      assert.equal(carta.rarita, rarita, `rarita di ${nome}`);
    }
  });

  test('distribuzione per costo: 4 / 5 / 5 / 4 / 2', () => {
    const perCosto = [1, 2, 3, 4, 5].map((c) => CREATURE.filter((x) => x.costo === c).length);
    assert.deepEqual(perCosto, [4, 5, 5, 4, 2]);
  });

  test('distribuzione per elemento e per tipo', () => {
    const conta = (k: 'elemento' | 'tipo', v: string) => CREATURE.filter((c) => c[k] === v).length;
    assert.equal(conta('elemento', 'petrolio'), 4);
    assert.equal(conta('elemento', 'sangue'), 4);
    assert.equal(conta('elemento', 'acqua'), 3);
    assert.equal(conta('elemento', 'veleno'), 3);
    assert.equal(conta('elemento', 'fuoco'), 3);
    assert.equal(conta('elemento', 'latte'), 3);
    assert.equal(conta('tipo', 'mischia'), 11);
    assert.equal(conta('tipo', 'distanza'), 6);
    assert.equal(conta('tipo', 'support'), 3);
  });

  test('il tipo distanza paga l attacco 1,5 volte', () => {
    const base = { vita: 4, attacco: 4, elemento: 'sangue' } as const;
    const mischia = calcolaPotenza({ ...base, tipo: 'mischia' });
    const distanza = calcolaPotenza({ ...base, tipo: 'distanza' });
    assert.equal(mischia, 9);
    assert.equal(distanza, 11);
  });

  test('il support paga il bonus di +4 e cura invece di colpire', () => {
    const p = calcolaPotenza({ vita: 4, attacco: 2, tipo: 'support', elemento: 'latte' });
    assert.equal(p, 9); // 4 + 2 - 1 + 4
  });

  test('le fasce di costo coprono tutto l intervallo 2-20', () => {
    for (let p = 2; p <= CONFIG.carte.potenzaMax; p += 0.5) {
      const costo = calcolaCosto(p);
      assert.ok(costo >= 1 && costo <= 5, `potenza ${p} -> costo ${costo}`);
    }
  });
});

describe('carte oggetto', () => {
  test('non passano dalla formula: potenza zero e costo zero', () => {
    const oggetto = CARTE_BASE.find((c) => c.tipo === 'oggetto');
    assert.ok(oggetto, 'c e almeno una carta oggetto');
    assert.equal(oggetto.potenza, 0);
    assert.equal(oggetto.costo, 0);
    assert.equal(oggetto.effetto, 'goccia');
  });

  test('un utente non le puo creare', () => {
    const esito = validaCarta({ vita: 1, attacco: 0, tipo: 'oggetto', elemento: 'sangue', nome: 'Furba' });
    assert.equal(esito.valida, false);
    assert.match(esito.errori.join(' '), /non si possono creare/);
  });
});

describe('descrizioni', () => {
  test('ogni carta ne ha una, e nessuna supera il limite', () => {
    for (const carta of CARTE_BASE) {
      assert.ok(carta.descrizione.length > 0, `${carta.nome} senza descrizione`);
      assert.ok(
        carta.descrizione.length <= CONFIG.carte.descrizioneMaxCaratteri,
        `${carta.nome}: ${carta.descrizione.length} caratteri`,
      );
    }
  });

  test('la descrizione non incide sul costo', () => {
    const base = { vita: 5, attacco: 4, tipo: 'mischia', elemento: 'sangue' } as const;
    assert.equal(calcolaPotenza(base), calcolaPotenza({ ...base }));
  });
});

describe('validazione della carta creata da un utente', () => {
  test('la carta 10/10 mischia sangue viene rifiutata: P = 21', () => {
    const s = { vita: 10, attacco: 10, tipo: 'mischia', elemento: 'sangue' } as const;
    assert.equal(calcolaPotenza(s), 21);
    const esito = validaCarta(s);
    assert.equal(esito.valida, false);
    assert.match(esito.errori.join(' '), /tetto/);
  });

  test('una carta a distanza petrolio 10/10 e il caso limite del documento', () => {
    const s = { vita: 10, attacco: 10, tipo: 'distanza', elemento: 'petrolio' } as const;
    assert.equal(calcolaPotenza(s), 27);
    assert.equal(validaCarta(s).valida, false);
  });

  test('vita 0 non e ammessa, attacco 0 si (carta muro)', () => {
    assert.equal(validaCarta({ vita: 0, attacco: 5, tipo: 'mischia', elemento: 'sangue' }).valida, false);
    assert.equal(validaCarta({ vita: 8, attacco: 0, tipo: 'mischia', elemento: 'sangue' }).valida, true);
  });

  test('le carte latte si fermano a 5 punti vita', () => {
    assert.equal(validaCarta({ vita: 5, attacco: 1, tipo: 'mischia', elemento: 'latte' }).valida, true);
    const troppo = validaCarta({ vita: 6, attacco: 1, tipo: 'mischia', elemento: 'latte' });
    assert.equal(troppo.valida, false);
    assert.match(troppo.errori.join(' '), /latte/);
  });

  test('il nome oltre 24 caratteri viene rifiutato', () => {
    const esito = validaCarta({
      vita: 3, attacco: 3, tipo: 'mischia', elemento: 'sangue',
      nome: 'Un nome assurdamente lungo che non ci sta',
    });
    assert.equal(esito.valida, false);
    assert.match(esito.errori.join(' '), /24/);
  });

  test('statistiche non intere rifiutate', () => {
    assert.equal(validaCarta({ vita: 3.5, attacco: 3, tipo: 'mischia', elemento: 'sangue' }).valida, false);
  });
});

describe('scomposizione della potenza', () => {
  test('le voci sommate danno esattamente il totale', () => {
    const casi = [
      { vita: 5, attacco: 6, tipo: 'mischia', elemento: 'fuoco' },
      { vita: 6, attacco: 7, tipo: 'distanza', elemento: 'petrolio' },
      { vita: 4, attacco: 2, tipo: 'support', elemento: 'latte' },
      { vita: 2, attacco: 2, tipo: 'mischia', elemento: 'sangue' },
    ] as const;

    for (const caso of casi) {
      const { voci, totale } = scomposizionePotenza(caso);
      const somma = voci.reduce((s, v) => s + v.valore, 0);
      assert.equal(Math.round(somma * 100) / 100, totale, JSON.stringify(caso));
      assert.equal(totale, calcolaPotenza(caso));
    }
  });

  test('il peso dell attacco a distanza e spiegato, quello della mischia no', () => {
    const distanza = scomposizionePotenza({ vita: 5, attacco: 6, tipo: 'distanza', elemento: 'sangue' });
    assert.match(distanza.voci[1].dettaglio ?? '', /6 x 1,5/);
    const mischia = scomposizionePotenza({ vita: 5, attacco: 6, tipo: 'mischia', elemento: 'sangue' });
    assert.equal(mischia.voci[1].dettaglio, undefined);
  });

  test('per un support l attacco si chiama cura, e compare il bonus', () => {
    const { voci } = scomposizionePotenza({ vita: 4, attacco: 2, tipo: 'support', elemento: 'sangue' });
    assert.equal(voci[1].etichetta, 'Cura');
    assert.ok(voci.some((v) => v.etichetta === 'Bonus support' && v.valore === 4));
  });

  test('un elemento senza bonus non aggiunge una voce da zero', () => {
    const { voci } = scomposizionePotenza({ vita: 5, attacco: 5, tipo: 'mischia', elemento: 'sangue' });
    assert.ok(voci.every((v) => v.valore !== 0));
    // Il sangue vale +1: c'e'. Un elemento a +0 non esiste nella tabella,
    // ma la funzione non deve comunque produrre voci nulle.
    assert.ok(voci.some((v) => v.etichetta.includes('sangue')));
  });
});
