import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { codifica, telaVuota } from '@bloodyfights/pixel';
import { archivioInMemoria, type Archivio } from '../src/archivio.ts';
import { creaServer } from '../src/http.ts';
import { rotte } from '../src/rotte.ts';
import { rotteCarte } from '../src/rotte-carte.ts';
import { rotteShop } from '../src/rotte-shop.ts';

const ORIGINE = 'http://localhost:5173';
const DISEGNO = codifica(telaVuota(3));
const BUONA = {
  nome: 'Ratto di Cantina', descrizione: 'Rosicchia quello che trova.',
  tipo: 'mischia', elemento: 'sangue', vita: 3, attacco: 2, pixels: DISEGNO,
};

let server: Server;
let base: string;
let archivio: Archivio;

before(async () => {
  archivio = archivioInMemoria();
  server = creaServer({
    rotte: [
      ...rotte(archivio),
      ...rotteCarte({ archivio, amministratori: ['capo@bf.it'] }),
      ...rotteShop({ archivio }),
    ],
    origini: [ORIGINE],
  });
  await new Promise<void>((pronto) => server.listen(0, '127.0.0.1', pronto));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise((chiuso) => server.close(chiuso)));

async function chiama(metodo: string, percorso: string, token?: string, corpo?: unknown) {
  const risposta = await fetch(`${base}${percorso}`, {
    method: metodo,
    headers: {
      Origin: ORIGINE, 'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const testo = await risposta.text();
  return { stato: risposta.status, corpo: testo ? JSON.parse(testo) : null };
}

async function iscrivi(email: string, nickname: string) {
  const esito = await chiama('POST', '/identita/registrazione', undefined, {
    email, password: 'gocce-di-sangue-42', nickname,
  });
  assert.equal(esito.stato, 201, JSON.stringify(esito.corpo));
  return esito.corpo.token as string;
}

describe('catalogo', () => {
  test('si legge senza account: sono le carte del gioco, non un segreto', async () => {
    const esito = await chiama('GET', '/carte');
    assert.equal(esito.stato, 200);
    assert.deepEqual(esito.corpo.carte, []);
  });
});

describe('invio', () => {
  test('senza account non si manda niente', async () => {
    assert.equal((await chiama('POST', '/carte', undefined, { carta: BUONA })).stato, 401);
  });

  test('con l account la carta entra in coda', async () => {
    const token = await iscrivi('creatore@bf.it', 'Creatore');
    const esito = await chiama('POST', '/carte', token, { carta: BUONA });
    assert.equal(esito.stato, 201, JSON.stringify(esito.corpo));
    assert.equal(esito.corpo.carta.stato, 'pending');
    assert.equal(esito.corpo.carta.creatore, 'Creatore');
  });

  test('il costo e la rarita arrivano calcolati, non dal client', async () => {
    const esito = await chiama('GET', '/carte/mie', await iscrivi('calcolo@bf.it', 'Calcolo'));
    assert.equal(esito.stato, 200);
    const token = await iscrivi('calcolo2@bf.it', 'Calcolo2');
    const inviata = (await chiama('POST', '/carte', token, { carta: BUONA })).corpo.carta;
    assert.equal(typeof inviata.costo, 'number');
    assert.ok(inviata.rarita);
  });

  test('una carta sbilanciata viene respinta anche se il client la manda lo stesso', async () => {
    const token = await iscrivi('furbo@bf.it', 'Furbo');
    const esito = await chiama('POST', '/carte', token, {
      carta: { ...BUONA, vita: 10, attacco: 10 },
    });
    assert.equal(esito.stato, 400);
  });

  test('i numeri che il client si inventa non passano: il server ricalcola', async () => {
    const token = await iscrivi('inventore@bf.it', 'Inventore');
    // Costo 1 dichiarato su una carta che ne vale molti di piu'.
    const esito = await chiama('POST', '/carte', token, {
      carta: { ...BUONA, vita: 8, attacco: 7, costo: 1, potenza: 2, rarita: 'comune' },
    });
    assert.equal(esito.stato, 201);
    assert.notEqual(esito.corpo.carta.costo, 1, 'il costo lo decide la formula');
    assert.equal(esito.corpo.carta.rarita, 'epico');
  });

  test('l identificativo del creatore non esce: basta il suo nome', async () => {
    const token = await iscrivi('riservato@bf.it', 'Riservato');
    const esito = await chiama('POST', '/carte', token, { carta: { ...BUONA, nome: 'Riservata' } });
    assert.equal(esito.corpo.carta.creatoreId, undefined);
    assert.equal(esito.corpo.carta.creatore, 'Riservato');
  });
});

describe('moderazione: chi puo entrare', () => {
  test('senza account il pannello non risulta nemmeno esistere', async () => {
    assert.equal((await chiama('GET', '/moderazione/coda')).stato, 401);
  });

  test('con un account qualunque, il pannello risponde 404 e non 403', async () => {
    const token = await iscrivi('passante@bf.it', 'Passante');
    const esito = await chiama('GET', '/moderazione/coda', token);
    assert.equal(esito.stato, 404, 'un 403 confermerebbe che il pannello esiste');
  });

  test('un utente qualunque non puo giudicare le carte', async () => {
    const token = await iscrivi('impostore@bf.it', 'Impostore');
    const esito = await chiama('POST', '/moderazione/carte/qualunque', token, { esito: 'approved' });
    assert.equal(esito.stato, 404);
  });

  test('l amministratore vede la coda', async () => {
    const capo = await iscrivi('capo@bf.it', 'Capo');
    const esito = await chiama('GET', '/moderazione/coda', capo);
    assert.equal(esito.stato, 200);
    assert.ok(esito.corpo.carte.length > 0);
  });
});

describe('moderazione: le decisioni', () => {
  let capo: string;
  let autore: string;
  let cartaId: string;

  before(async () => {
    capo = await iscrivi('capo2@bf.it', 'Capo2');
    autore = await iscrivi('autore@bf.it', 'Autore');
    cartaId = (await chiama('POST', '/carte', autore, { carta: { ...BUONA, nome: 'Da Giudicare' } }))
      .corpo.carta.id;
    // capo2 non e' nell'elenco: lo diventa solo capo@bf.it. Si usa quello.
    capo = await iscrivi('capo3@bf.it', 'Capo3');
  });

  test('un esito che non esiste viene respinto', async () => {
    const vero = (await chiama('POST', '/identita/accesso', undefined, {
      email: 'capo@bf.it', password: 'gocce-di-sangue-42',
    })).corpo.token;
    const esito = await chiama('POST', `/moderazione/carte/${cartaId}`, vero, { esito: 'forse' });
    assert.equal(esito.stato, 400);
  });

  test('un rifiuto senza motivo non si manda al creatore', async () => {
    const vero = (await chiama('POST', '/identita/accesso', undefined, {
      email: 'capo@bf.it', password: 'gocce-di-sangue-42',
    })).corpo.token;
    const esito = await chiama('POST', `/moderazione/carte/${cartaId}`, vero, { esito: 'rejected' });
    assert.equal(esito.stato, 400);
    assert.match(esito.corpo.errore, /motivo/i);
  });

  test('approvata, la carta compare nel catalogo pubblico', async () => {
    const vero = (await chiama('POST', '/identita/accesso', undefined, {
      email: 'capo@bf.it', password: 'gocce-di-sangue-42',
    })).corpo.token;
    const decisa = await chiama('POST', `/moderazione/carte/${cartaId}`, vero, { esito: 'approved' });
    assert.equal(decisa.stato, 200);

    const catalogo = await chiama('GET', '/carte');
    assert.ok(catalogo.corpo.carte.some((c: { id: string }) => c.id === cartaId));
  });

  test('e il creatore se la ritrova fra le sue', async () => {
    const mie = await chiama('GET', '/carte/mie', autore);
    assert.equal(mie.corpo.carte[0].stato, 'approved');
  });
});

// --------------------------------------------------------------- lo shop

describe('shop', () => {
  test('il listino e pubblico: le probabilita si leggono senza iscriversi', async () => {
    const esito = await chiama('GET', '/bauli');
    assert.equal(esito.stato, 200);
    assert.ok(esito.corpo.bauli.length >= 2);
    assert.ok(esito.corpo.bauli[0].probabilita, 'le probabilita vanno pubblicate');
  });

  test('senza account non si apre niente', async () => {
    assert.equal((await chiama('POST', '/bauli/ferro/apertura')).stato, 401);
  });

  test('senza oro il baule resta chiuso', async () => {
    const token = await iscrivi('squattrinato@bf.it', 'Squattrinato');
    const esito = await chiama('POST', '/bauli/ferro/apertura', token);
    // Un nuovo iscritto parte da zero Gocce d'Oro: o mancano i soldi, o
    // manca il pool. In entrambi i casi non si apre e non si paga.
    assert.equal(esito.stato, 409);
  });

  test('un baule che non esiste da 404', async () => {
    const token = await iscrivi('curioso@bf.it', 'Curioso');
    assert.equal((await chiama('POST', '/bauli/cartone/apertura', token)).stato, 404);
  });
});
