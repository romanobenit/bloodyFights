import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CARTE_BASE, mazzoBaseCompleto } from '../src/carte-base.ts';
import { applicaAzione, creaPartita } from '../src/motore.ts';
import { CARTA_COPERTA, occulta } from '../src/occulta.ts';

function partita() {
  return creaPartita({
    idGiocatori: ['A', 'B'],
    mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()],
    carte: CARTE_BASE,
    seme: 4242,
    primoGiocatore: 0,
  });
}

describe('occultamento', () => {
  test('la mia mano resta leggibile', () => {
    const stato = partita();
    const mio = occulta(stato, 0);
    assert.deepEqual(mio.giocatori[0].mano, stato.giocatori[0].mano);
    assert.ok(mio.giocatori[0].mano.every((id) => id !== CARTA_COPERTA));
  });

  test('la mano dell avversario diventa segnaposto, ma se ne conta il numero', () => {
    const stato = partita();
    const mio = occulta(stato, 0);
    assert.equal(mio.giocatori[1].mano.length, stato.giocatori[1].mano.length);
    assert.ok(mio.giocatori[1].mano.every((id) => id === CARTA_COPERTA));
  });

  test('nessuna carta vera dell avversario sopravvive da nessuna parte', () => {
    const stato = partita();
    const sueCarte = new Set([...stato.giocatori[1].mano, ...stato.giocatori[1].mazzo]);
    const testo = JSON.stringify(occulta(stato, 0).giocatori[1]);
    for (const id of sueCarte) assert.doesNotMatch(testo, new RegExp(id), `${id} trapela`);
  });

  test('anche il mio mazzo si copre: l ordine di pescata e gia deciso', () => {
    const mio = occulta(partita(), 0);
    assert.ok(mio.giocatori[0].mazzo.every((id) => id === CARTA_COPERTA));
    assert.ok(mio.giocatori[0].mazzo.length > 0);
  });

  test('il registro non rivela cosa ha pescato l avversario', () => {
    let stato = partita();
    for (let i = 0; i < 6; i++) stato = applicaAzione(stato, { tipo: 'passaFase' });

    const pescateAltrui = stato.log.filter((v) => v.tipo === 'pescata' && v.giocatore === 1);
    assert.ok(pescateAltrui.length > 0, 'la prova ha senso solo se ha pescato');

    const mio = occulta(stato, 0);
    for (const voce of mio.log) {
      if (voce.tipo === 'pescata' && voce.giocatore === 1)
        assert.equal(voce.cartaId, CARTA_COPERTA);
    }
  });

  test('le mie pescate restano leggibili nel registro', () => {
    let stato = partita();
    for (let i = 0; i < 6; i++) stato = applicaAzione(stato, { tipo: 'passaFase' });
    const mie = occulta(stato, 0).log.filter((v) => v.tipo === 'pescata' && v.giocatore === 0);
    assert.ok(mie.length > 0);
    assert.ok(mie.every((v) => v.tipo === 'pescata' && v.cartaId !== CARTA_COPERTA));
  });

  test('il tabellone resta visibile a tutti e due: le carte in campo sono pubbliche', () => {
    const stato = partita();
    stato.giocatori[1].tabellone[0] = {
      uid: 'x', cartaId: 'base-01', nome: 'Topo di Fogna', tipo: 'mischia', elemento: 'sangue',
      vita: 2, vitaMax: 2, attacco: 2, costo: 1, descrizione: '', fresca: false, haAgito: false,
    };
    assert.equal(occulta(stato, 0).giocatori[1].tabellone[0]?.nome, 'Topo di Fogna');
  });

  test('non tocca lo stato ricevuto', () => {
    const stato = partita();
    const copia = structuredClone(stato);
    occulta(stato, 0);
    assert.deepEqual(stato, copia);
  });

  test('funziona per entrambi i giocatori, a specchio', () => {
    const stato = partita();
    const suo = occulta(stato, 1);
    assert.deepEqual(suo.giocatori[1].mano, stato.giocatori[1].mano);
    assert.ok(suo.giocatori[0].mano.every((id) => id === CARTA_COPERTA));
  });
});
