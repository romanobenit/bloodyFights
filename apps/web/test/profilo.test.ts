import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CARTE_BASE, CONFIG } from '@bloodyfights/motore';
import {
  COPIE_OGGETTO, MAZZI_MASSIMI, aggiungiAlMazzo, carteNelMazzo, copieConcesse, disponibili,
  erroriMazzo, mazzoAttivo, mazzoComeLista, mazzoGiocabile, nuovoMazzo, profiloIniziale,
  registraEsito, sostituisciMazzo, togliDalMazzo, type Mazzo, type Profilo,
} from '../src/profilo.ts';
import { depositoInMemoria, depositoLocale } from '../src/deposito.ts';


const profilo = (): Profilo => profiloIniziale(CARTE_BASE, 'Benito');
const attivo = (p: Profilo): Mazzo => mazzoAttivo(p)!;

describe('profilo iniziale', () => {
  test('tante copie quante se ne possono mettere nel mazzo', () => {
    const p = profilo();
    assert.equal(Object.keys(p.collezione).length, CARTE_BASE.length);
    assert.equal(p.collezione['base-01'], 3, 'costa 1: tre copie');
    assert.equal(p.collezione['base-19'], 2, 'costa 5: due copie');
    assert.equal(p.collezione['base-21'], COPIE_OGGETTO, 'le carte oggetto si danno a mani basse');
  });

  test('il mazzo di partenza e gia giocabile', () => {
    const p = profilo();
    assert.equal(carteNelMazzo(attivo(p)), CONFIG.mazzo.carteNelMazzo);
    assert.equal(mazzoGiocabile(p, attivo(p), CARTE_BASE), true);
  });

  test('le carte oggetto restano fuori dal mazzo di partenza', () => {
    assert.equal('base-21' in attivo(profilo()).carte, false);
  });

  test('copieConcesse segue il costo, tranne che per gli oggetti', () => {
    const perId = new Map(CARTE_BASE.map((c) => [c.id, c]));
    assert.equal(copieConcesse(perId.get('base-01')!), 3);
    assert.equal(copieConcesse(perId.get('base-10')!), 2);
    assert.equal(copieConcesse(perId.get('base-21')!), COPIE_OGGETTO);
  });

  test('il mazzo iniziale e accettato anche dal motore', () => {
    const lista = mazzoComeLista(attivo(profilo()));
    assert.equal(lista.length, 20);
    assert.equal(new Set(lista).size, 20, 'una copia di ciascuna');
  });
});

describe('aggiungere carte al mazzo', () => {
  test('una seconda copia si puo aggiungere se la possiedi', () => {
    const p = profilo();
    const m = togliDalMazzo(attivo(p), 'base-20').mazzo; // fa spazio
    const esito = aggiungiAlMazzo(p, m, 'base-01', CARTE_BASE);
    assert.equal(esito.rifiuto, null);
    assert.equal(esito.mazzo.carte['base-01'], 2);
  });

  test('una carta che non esiste nel catalogo viene rifiutata', () => {
    const p = profilo();
    const m = togliDalMazzo(attivo(p), 'base-20').mazzo;
    assert.match(aggiungiAlMazzo(p, m, 'non-esiste', CARTE_BASE).rifiuto ?? '', /sconosciuta/);
  });

  test('di una carta da 1 goccia se ne possono mettere tre, non quattro', () => {
    const p = profilo();
    let m = attivo(p);
    for (const via of ['base-20', 'base-19', 'base-18']) m = togliDalMazzo(m, via).mazzo;
    m = aggiungiAlMazzo(p, m, 'base-01', CARTE_BASE).mazzo;
    m = aggiungiAlMazzo(p, m, 'base-01', CARTE_BASE).mazzo;
    assert.equal(m.carte['base-01'], 3);
    assert.match(aggiungiAlMazzo(p, m, 'base-01', CARTE_BASE).rifiuto ?? '', /Massimo 3/);
  });

  test('di una carta cara se ne possono mettere solo due', () => {
    const p = profilo();
    let m = togliDalMazzo(attivo(p), 'base-20').mazzo;
    m = aggiungiAlMazzo(p, m, 'base-19', CARTE_BASE).mazzo;
    assert.equal(m.carte['base-19'], 2);
    m = togliDalMazzo(m, 'base-18').mazzo;
    assert.match(aggiungiAlMazzo(p, m, 'base-19', CARTE_BASE).rifiuto ?? '', /Massimo 2/);
  });

  test('non si aggiunge una carta che non possiedi', () => {
    const p: Profilo = { ...profilo(), collezione: { 'base-01': 1 } };
    const m: Mazzo = { id: 'm', nome: 'm', carte: { 'base-01': 1 } };
    assert.equal(disponibili(p, m, 'base-01'), 0);
    assert.match(aggiungiAlMazzo(p, m, 'base-01', CARTE_BASE).rifiuto ?? '', /non possiedi/i);
  });

  test('oltre le 20 carte il mazzo e pieno', () => {
    const p = profilo();
    const esito = aggiungiAlMazzo(p, attivo(p), 'base-01', CARTE_BASE);
    assert.match(esito.rifiuto ?? '', /gia' 20 carte|gia 20 carte/);
  });

  test('un rifiuto lascia il mazzo esattamente com era', () => {
    const p = profilo();
    const prima = attivo(p);
    const esito = aggiungiAlMazzo(p, prima, 'base-01', CARTE_BASE);
    assert.notEqual(esito.rifiuto, null);
    assert.equal(esito.mazzo, prima, 'stesso oggetto, nessuna copia inutile');
  });
});

describe('togliere carte dal mazzo', () => {
  test('togliere l ultima copia fa sparire la voce', () => {
    const m = togliDalMazzo(attivo(profilo()), 'base-01').mazzo;
    assert.equal('base-01' in m.carte, false);
    assert.equal(carteNelMazzo(m), 19);
  });

  test('togliere una carta assente viene rifiutato', () => {
    const m: Mazzo = { id: 'm', nome: 'm', carte: {} };
    assert.notEqual(togliDalMazzo(m, 'base-01').rifiuto, null);
  });

  test('le funzioni non modificano il mazzo ricevuto', () => {
    const p = profilo();
    const originale = attivo(p);
    const copia = structuredClone(originale);
    togliDalMazzo(originale, 'base-01');
    aggiungiAlMazzo(p, originale, 'base-02', CARTE_BASE);
    assert.deepEqual(originale, copia);
  });
});

describe('validazione del mazzo', () => {
  test('un mazzo da 19 carte non e giocabile e lo dice', () => {
    const p = profilo();
    const m = togliDalMazzo(attivo(p), 'base-01').mazzo;
    const errori = erroriMazzo(p, m, CARTE_BASE);
    assert.ok(errori.length > 0);
    assert.match(errori.join(' '), /20 carte/);
  });

  test('un mazzo con piu copie di quante ne possiedi e rifiutato', () => {
    const p: Profilo = { ...profilo(), collezione: { 'base-01': 1 } };
    const m: Mazzo = { id: 'm', nome: 'm', carte: { 'base-01': 2 } };
    assert.match(erroriMazzo(p, m, CARTE_BASE).join(' '), /ne hai 1 copie/);
  });

  test('una carta sconosciuta al catalogo e rifiutata', () => {
    const p = profilo();
    const m: Mazzo = { id: 'm', nome: 'm', carte: { 'carta-inventata': 20 } };
    assert.match(erroriMazzo(p, m, CARTE_BASE).join(' '), /sconosciuta|copie/);
  });
});

describe('piu mazzi', () => {
  test('se ne possono tenere tre, il quarto no', () => {
    let p = profilo();
    for (let i = 1; i < MAZZI_MASSIMI; i++) {
      const esito = nuovoMazzo(p);
      assert.equal(esito.rifiuto, null);
      p = esito.profilo;
    }
    assert.equal(p.mazzi.length, MAZZI_MASSIMI);
    assert.match(nuovoMazzo(p).rifiuto ?? '', /Massimo 3/);
  });

  test('il mazzo appena creato diventa quello attivo', () => {
    const p = nuovoMazzo(profilo()).profilo;
    assert.equal(mazzoAttivo(p)?.id, 'mazzo-2');
    assert.equal(carteNelMazzo(mazzoAttivo(p)!), 0);
  });

  test('sostituire un mazzo non tocca gli altri', () => {
    let p = nuovoMazzo(profilo()).profilo;
    const modificato = { ...mazzoAttivo(p)!, nome: 'Petrolio puro' };
    p = sostituisciMazzo(p, modificato);
    assert.equal(p.mazzi[1].nome, 'Petrolio puro');
    assert.equal(p.mazzi[0].nome, 'Mazzo base');
  });
});

describe('statistiche', () => {
  test('vittorie e sconfitte si accumulano separatamente', () => {
    let p = profilo();
    p = registraEsito(p, true);
    p = registraEsito(p, true);
    p = registraEsito(p, false);
    assert.equal(p.vittorie, 2);
    assert.equal(p.sconfitte, 1);
  });
});

describe('deposito', () => {
  test('in memoria: scrive, rilegge, e dichiara di non essere duraturo', () => {
    const d = depositoInMemoria();
    assert.equal(d.duraturo, false);
    assert.equal(d.leggi('niente'), null);
    assert.equal(d.scrivi('profilo', profilo()), true);
    assert.equal(d.leggi<Profilo>('profilo')?.nickname, 'Benito');
  });

  test('un profilo intero sopravvive al viaggio in JSON', () => {
    const d = depositoInMemoria();
    const p = profilo();
    d.scrivi('profilo', p);
    assert.deepEqual(d.leggi<Profilo>('profilo'), p);
  });

  test('senza localStorage si ripiega sulla memoria invece di esplodere', () => {
    // In Node localStorage non c'e': e' esattamente il caso della navigazione
    // privata o dei cookie bloccati.
    const d = depositoLocale();
    assert.doesNotThrow(() => d.scrivi('profilo', profilo()));
    assert.equal(d.leggi<Profilo>('profilo')?.nickname, 'Benito');
  });

  test('un localStorage che solleva a ogni accesso non blocca la pagina', () => {
    const originale = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('accesso negato');
      },
    });
    try {
      const d = depositoLocale();
      assert.equal(d.duraturo, false);
      assert.doesNotThrow(() => d.scrivi('x', 1));
    } finally {
      if (originale) Object.defineProperty(globalThis, 'localStorage', originale);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
