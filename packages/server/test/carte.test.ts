import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CARTE_BASE, collezioneIniziale, mazzoIniziale } from '@bloodyfights/motore';
import { codifica, telaVuota } from '@bloodyfights/pixel';
import { archivioInMemoria, datiVuoti, type Archivio, type Utente } from '../src/archivio.ts';
import {
  CARTE_PER_UTENTE, ErroreCarta, carteDiUtente, catalogoApprovato, codaDiRevisione,
  comeCartaCompleta, decidiSuCarta, inviaCarta, revocaDecisione, verificaBozza,
} from '../src/carte.ts';

const DISEGNO = codifica(telaVuota(3));

function utente(id: string): Utente {
  return {
    id, email: `${id}@x.it`, impronta: '', sale: '', nickname: `Nick ${id}`, bio: '',
    oro: 0, mmr: 1000, vittorie: 0, sconfitte: 0, cartaCreataId: null,
    collezione: collezioneIniziale(CARTE_BASE),
    mazzi: [{ id: 'mazzo-1', nome: 'Mazzo base', carte: mazzoIniziale(CARTE_BASE) }],
    mazzoAttivoId: 'mazzo-1', ultimaVittoriaIl: null,
    creatoIl: new Date(0).toISOString(), tentativiFalliti: 0, ultimoTentativo: 0,
  };
}

const BUONA = {
  nome: 'Ratto di Cantina', descrizione: 'Rosicchia quello che trova.',
  tipo: 'mischia' as const, elemento: 'sangue' as const, vita: 3, attacco: 2, pixels: DISEGNO,
};

let archivio: Archivio;
beforeEach(() => {
  const dati = datiVuoti();
  dati.utenti.push(utente('a'), utente('b'));
  archivio = archivioInMemoria(dati);
});

describe('verifica della bozza', () => {
  test('una carta ben fatta passa', () => {
    assert.equal(verificaBozza(BUONA).nome, 'Ratto di Cantina');
  });

  test('ripulisce gli spazi intorno al nome', () => {
    assert.equal(verificaBozza({ ...BUONA, nome: '  Ratto  ' }).nome, 'Ratto');
  });

  test('niente carta, niente da fare', () => {
    assert.throws(() => verificaBozza(undefined), ErroreCarta);
    assert.throws(() => verificaBozza('una stringa'), ErroreCarta);
  });

  test('un campo mancante lo dice per nome', () => {
    assert.throws(() => verificaBozza({ ...BUONA, elemento: undefined }), /elemento/);
    assert.throws(() => verificaBozza({ ...BUONA, vita: undefined }), /vita/);
  });

  test('la vita e l attacco devono essere numeri, non stringhe che ci somigliano', () => {
    assert.throws(() => verificaBozza({ ...BUONA, vita: '3' }), /vita/);
  });

  test('una carta fuori dal tetto di potenza viene respinta', () => {
    assert.throws(() => verificaBozza({ ...BUONA, vita: 10, attacco: 10 }), ErroreCarta);
  });

  test('il latte non supera i cinque punti vita', () => {
    assert.throws(() => verificaBozza({ ...BUONA, elemento: 'latte', vita: 8 }), /latte/i);
  });

  test('una descrizione chilometrica viene respinta', () => {
    assert.throws(() => verificaBozza({ ...BUONA, descrizione: 'x'.repeat(200) }), /descrizione/i);
  });

  test('un disegno che non e un disegno viene respinto', () => {
    assert.throws(() => verificaBozza({ ...BUONA, pixels: 'non sono una tela' }), /leggibile/i);
  });

  test('una tela della lunghezza sbagliata viene respinta', () => {
    assert.throws(() => verificaBozza({ ...BUONA, pixels: DISEGNO.slice(0, 100) }), /leggibile/i);
  });

  test('le carte oggetto non si creano', () => {
    assert.throws(() => verificaBozza({ ...BUONA, tipo: 'oggetto' }), ErroreCarta);
  });
});

describe('invio', () => {
  test('la carta entra in coda, non nel catalogo', async () => {
    const carta = await inviaCarta(archivio, 'a', BUONA);
    assert.equal(carta.stato, 'pending');
    assert.deepEqual(await catalogoApprovato(archivio), []);
    assert.equal((await codaDiRevisione(archivio)).length, 1);
  });

  test('il nome del creatore si copia all invio', async () => {
    const carta = await inviaCarta(archivio, 'a', BUONA);
    assert.equal(carta.creatoreNickname, 'Nick a');
  });

  test('potenza costo e rarita non si salvano: si ricalcolano', async () => {
    const carta = await inviaCarta(archivio, 'a', BUONA);
    assert.ok(!('potenza' in carta), 'un numero salvato non si ribilancia piu');
    const completa = comeCartaCompleta(carta);
    assert.equal(typeof completa.potenza, 'number');
    assert.equal(typeof completa.costo, 'number');
    assert.ok(completa.rarita);
  });

  test('una carta per utente', async () => {
    await inviaCarta(archivio, 'a', BUONA);
    await assert.rejects(() => inviaCarta(archivio, 'a', { ...BUONA, nome: 'Altro' }), /gia una carta/i);
    assert.equal(CARTE_PER_UTENTE, 1);
  });

  test('ma un altro utente puo mandare la sua', async () => {
    await inviaCarta(archivio, 'a', BUONA);
    await inviaCarta(archivio, 'b', { ...BUONA, nome: 'Altro' });
    assert.equal((await codaDiRevisione(archivio)).length, 2);
  });

  test('dopo un rifiuto si puo riprovare: e il senso del rifiuto', async () => {
    const prima = await inviaCarta(archivio, 'a', BUONA);
    await decidiSuCarta(archivio, prima.id, 'rejected', 'nome');
    const seconda = await inviaCarta(archivio, 'a', { ...BUONA, nome: 'Ratto Educato' });
    assert.equal(seconda.stato, 'pending');
  });

  test('un utente che non esiste non manda niente', async () => {
    await assert.rejects(() => inviaCarta(archivio, 'fantasma', BUONA), /sconosciuto/i);
  });

  test('ogni carta ha un identificativo suo', async () => {
    const uno = await inviaCarta(archivio, 'a', BUONA);
    const due = await inviaCarta(archivio, 'b', BUONA);
    assert.notEqual(uno.id, due.id);
  });
});

describe('revisione', () => {
  test('approvata, la carta entra nel catalogo', async () => {
    const carta = await inviaCarta(archivio, 'a', BUONA);
    await decidiSuCarta(archivio, carta.id, 'approved');
    const catalogo = await catalogoApprovato(archivio);
    assert.equal(catalogo.length, 1);
    assert.deepEqual(await codaDiRevisione(archivio), []);
  });

  test('approvata, il creatore ne riceve una copia', async () => {
    const carta = await inviaCarta(archivio, 'a', BUONA);
    await decidiSuCarta(archivio, carta.id, 'approved');
    const dati = await archivio.leggi();
    assert.equal(dati.utenti.find((u) => u.id === 'a')!.collezione[carta.id], 1);
  });

  test('rifiutata, resta fuori dal catalogo e porta il motivo', async () => {
    const carta = await inviaCarta(archivio, 'a', BUONA);
    const decisa = await decidiSuCarta(archivio, carta.id, 'rejected', 'offensivo');
    assert.equal(decisa.motivoRifiuto, 'offensivo');
    assert.deepEqual(await catalogoApprovato(archivio), []);
  });

  test('rifiutata, il creatore non riceve niente', async () => {
    const carta = await inviaCarta(archivio, 'a', BUONA);
    await decidiSuCarta(archivio, carta.id, 'rejected', 'offensivo');
    const dati = await archivio.leggi();
    assert.equal(dati.utenti.find((u) => u.id === 'a')!.collezione[carta.id], undefined);
  });

  test('approvare dopo un rifiuto cancella il motivo', async () => {
    const carta = await inviaCarta(archivio, 'a', BUONA);
    await decidiSuCarta(archivio, carta.id, 'rejected', 'nome');
    const poi = await decidiSuCarta(archivio, carta.id, 'approved');
    assert.equal(poi.motivoRifiuto, undefined);
  });

  test('revocare riporta la carta in coda', async () => {
    const carta = await inviaCarta(archivio, 'a', BUONA);
    await decidiSuCarta(archivio, carta.id, 'rejected', 'nome');
    const tornata = await revocaDecisione(archivio, carta.id);
    assert.equal(tornata.stato, 'pending');
    assert.equal((await codaDiRevisione(archivio)).length, 1);
  });

  test('una carta che non esiste non si giudica', async () => {
    await assert.rejects(() => decidiSuCarta(archivio, 'inesistente', 'approved'), /non trovata/i);
  });

  test('la coda mette davanti chi aspetta da piu tempo', async () => {
    let n = 0;
    const orologio = () => new Date(1000 * ++n).toISOString();
    await inviaCarta(archivio, 'a', BUONA, orologio);
    await inviaCarta(archivio, 'b', { ...BUONA, nome: 'Seconda' }, orologio);
    const coda = await codaDiRevisione(archivio);
    assert.equal(coda[0].nome, 'Ratto di Cantina');
  });

  test('le proprie carte si leggono in qualunque stato', async () => {
    const carta = await inviaCarta(archivio, 'a', BUONA);
    await decidiSuCarta(archivio, carta.id, 'rejected', 'nome');
    const mie = await carteDiUtente(archivio, 'a');
    assert.equal(mie.length, 1);
    assert.equal(mie[0].stato, 'rejected');
  });
});
