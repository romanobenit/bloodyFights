import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { archivioInMemoria } from '../src/archivio.ts';
import { combacia, creaServer, tokenDaIntestazione } from '../src/http.ts';
import { rotte } from '../src/rotte.ts';

const PASSWORD = 'gocce-di-sangue-42';
const ORIGINE = 'http://localhost:5173';

describe('instradamento', () => {
  test('uno schema senza parametri combacia solo con se stesso', () => {
    assert.deepEqual(combacia('/salute', '/salute'), {});
    assert.equal(combacia('/salute', '/salute/extra'), null);
    assert.equal(combacia('/salute', '/altro'), null);
  });

  test('i parametri vengono estratti e decodificati', () => {
    assert.deepEqual(combacia('/partite/:id', '/partite/abc'), { id: 'abc' });
    assert.deepEqual(combacia('/utenti/:nome/carte', '/utenti/Beni%20to/carte'), { nome: 'Beni to' });
  });

  test('le barre finali e doppie non cambiano l esito', () => {
    assert.deepEqual(combacia('/salute', '/salute/'), {});
  });

  test('il token si legge solo da un Authorization fatto bene', () => {
    assert.equal(tokenDaIntestazione('Bearer abc123'), 'abc123');
    assert.equal(tokenDaIntestazione('bearer abc123'), 'abc123');
    assert.equal(tokenDaIntestazione('Basic abc123'), null);
    assert.equal(tokenDaIntestazione('abc123'), null);
    assert.equal(tokenDaIntestazione(undefined), null);
  });
});

describe('il server su HTTP vero', () => {
  let server: Server;
  let base = '';

  before(async () => {
    server = creaServer({ rotte: rotte(archivioInMemoria()), origini: [ORIGINE] });
    await new Promise<void>((pronto) => server.listen(0, '127.0.0.1', pronto));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise((chiuso) => server.close(chiuso)));

  const chiama = (percorso: string, opzioni: RequestInit = {}) =>
    fetch(base + percorso, {
      ...opzioni,
      headers: { 'Content-Type': 'application/json', Origin: ORIGINE, ...opzioni.headers },
    });

  test('risponde di essere vivo', async () => {
    const risposta = await chiama('/salute');
    assert.equal(risposta.status, 200);
    assert.deepEqual(await risposta.json(), { stato: 'vivo' });
  });

  test('una rotta che non esiste da 404 in JSON, non una pagina di errore', async () => {
    const risposta = await chiama('/non-esiste');
    assert.equal(risposta.status, 404);
    assert.match(risposta.headers.get('content-type') ?? '', /application\/json/);
    assert.ok((await risposta.json()).errore);
  });

  test('un corpo che non e JSON viene rifiutato con un messaggio chiaro', async () => {
    const risposta = await chiama('/identita/accesso', { method: 'POST', body: 'non sono json' });
    assert.equal(risposta.status, 400);
    assert.match((await risposta.json()).errore, /JSON/);
  });

  test('un campo mancante viene detto per nome', async () => {
    const risposta = await chiama('/identita/registrazione', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.it' }),
    });
    assert.equal(risposta.status, 400);
    assert.match((await risposta.json()).errore, /password/);
  });

  test('registrazione, accesso e identita funzionano di seguito', async () => {
    const registrazione = await chiama('/identita/registrazione', {
      method: 'POST',
      body: JSON.stringify({ email: 'benito@esempio.it', password: PASSWORD, nickname: 'Benito' }),
    });
    assert.equal(registrazione.status, 201);
    const { token, utente } = await registrazione.json();
    assert.equal(utente.nickname, 'Benito');
    assert.equal(utente.mmr, 1000);
    assert.equal('email' in utente, false, 'l indirizzo non esce');

    const io = await chiama('/identita/io', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(io.status, 200);
    assert.equal((await io.json()).utente.nickname, 'Benito');

    const accesso = await chiama('/identita/accesso', {
      method: 'POST',
      body: JSON.stringify({ email: 'BENITO@esempio.it', password: PASSWORD }),
    });
    assert.equal(accesso.status, 200, 'l indirizzo non e sensibile alle maiuscole');
  });

  test('senza token le rotte private rispondono 401', async () => {
    const risposta = await chiama('/identita/io');
    assert.equal(risposta.status, 401);
    assert.match((await risposta.json()).errore, /accedere/);
  });

  test('con un token inventato rispondono 401', async () => {
    const risposta = await chiama('/identita/io', { headers: { Authorization: 'Bearer falso' } });
    assert.equal(risposta.status, 401);
  });

  test('password sbagliata e indirizzo inesistente danno la stessa risposta', async () => {
    // Il punto non e' che il messaggio taccia le parole "indirizzo" e
    // "password": e' che le due risposte siano INDISTINGUIBILI. Se differissero,
    // chiunque potrebbe scoprire quali indirizzi hanno un account.
    const passwordErrata = await chiama('/identita/accesso', {
      method: 'POST',
      body: JSON.stringify({ email: 'benito@esempio.it', password: 'sbagliatissima' }),
    });
    const utenteInesistente = await chiama('/identita/accesso', {
      method: 'POST',
      body: JSON.stringify({ email: 'nessuno@esempio.it', password: 'sbagliatissima' }),
    });

    assert.equal(passwordErrata.status, 401);
    assert.equal(utenteInesistente.status, passwordErrata.status);
    assert.deepEqual(await utenteInesistente.json(), await passwordErrata.json());
  });

  test('uscire revoca il token', async () => {
    const accesso = await chiama('/identita/accesso', {
      method: 'POST',
      body: JSON.stringify({ email: 'benito@esempio.it', password: PASSWORD }),
    });
    const { token } = await accesso.json();

    const uscita = await chiama('/identita/uscita', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(uscita.status, 204);

    const dopo = await chiama('/identita/io', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(dopo.status, 401);
  });

  test('uscire senza token riesce comunque', async () => {
    assert.equal((await chiama('/identita/uscita', { method: 'POST' })).status, 204);
  });
});

describe('origini ammesse', () => {
  let server: Server;
  let base = '';

  before(async () => {
    server = creaServer({ rotte: rotte(archivioInMemoria()), origini: [ORIGINE] });
    await new Promise<void>((pronto) => server.listen(0, '127.0.0.1', pronto));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise((chiuso) => server.close(chiuso)));

  test('l origine ammessa riceve il permesso', async () => {
    const risposta = await fetch(base + '/salute', { headers: { Origin: ORIGINE } });
    assert.equal(risposta.headers.get('access-control-allow-origin'), ORIGINE);
    assert.equal(risposta.headers.get('vary'), 'Origin');
  });

  test('un sito qualunque non lo riceve: il browser blocchera la risposta', async () => {
    const risposta = await fetch(base + '/salute', { headers: { Origin: 'https://sito-ostile.it' } });
    assert.equal(risposta.headers.get('access-control-allow-origin'), null);
  });

  test('la richiesta preliminare da 403 a un origine non ammessa', async () => {
    const ostile = await fetch(base + '/identita/accesso', {
      method: 'OPTIONS',
      headers: { Origin: 'https://sito-ostile.it' },
    });
    assert.equal(ostile.status, 403);

    const buona = await fetch(base + '/identita/accesso', {
      method: 'OPTIONS',
      headers: { Origin: ORIGINE },
    });
    assert.equal(buona.status, 204);
  });
});
