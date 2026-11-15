import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { archivioInMemoria, type Archivio } from '../src/archivio.ts';
import { creaServer } from '../src/http.ts';
import { rotte } from '../src/rotte.ts';
import { MAZZI_MASSIMI, rotteProfilo, verificaMazzi } from '../src/rotte-profilo.ts';

const ORIGINE = 'http://localhost:5173';
let server: Server;
let base: string;
let archivio: Archivio;

before(async () => {
  archivio = archivioInMemoria();
  server = creaServer({ rotte: [...rotte(archivio), ...rotteProfilo(archivio)], origini: [ORIGINE] });
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

async function iscrivi(nome: string) {
  const esito = await chiama('POST', '/identita/registrazione', undefined, {
    email: `${nome}@bf.it`, password: 'gocce-di-sangue-42', nickname: nome,
  });
  assert.equal(esito.stato, 201, JSON.stringify(esito.corpo));
  return esito.corpo.token as string;
}

describe('verifica dei mazzi', () => {
  const collezione = { 'base-01': 3, 'base-10': 2 };

  test('un mazzo con carte possedute passa', () => {
    const esito = verificaMazzi(
      [{ id: 'm1', nome: 'Mio', carte: { 'base-01': 3, 'base-10': 2 } }], collezione,
    );
    assert.equal(esito.length, 1);
    assert.equal(esito[0].carte['base-01'], 3);
  });

  test('carte che non possiedi non entrano', () => {
    assert.throws(
      () => verificaMazzi([{ id: 'm1', nome: 'Furbo', carte: { 'base-19': 2 } }], collezione),
      /ne hai 0/,
    );
  });

  test('piu copie di quante ne hai non entrano', () => {
    assert.throws(
      () => verificaMazzi([{ id: 'm1', nome: 'Furbo', carte: { 'base-01': 9 } }], collezione),
      /ne hai 3/,
    );
  });

  test('un mazzo a meta si salva: si sta ancora costruendo', () => {
    const esito = verificaMazzi([{ id: 'm1', nome: 'Bozza', carte: { 'base-01': 1 } }], collezione);
    assert.equal(esito[0].carte['base-01'], 1);
  });

  test('oltre venti carte no', () => {
    const tante: Record<string, number> = {};
    const grande: Record<string, number> = {};
    for (let i = 1; i <= 21; i++) {
      tante[`c${i}`] = 1;
      grande[`c${i}`] = 1;
    }
    assert.throws(() => verificaMazzi([{ id: 'm1', nome: 'Enorme', carte: grande }], tante), /massimo/);
  });

  test('le quantita a zero si tolgono invece di restare a sporcare', () => {
    const esito = verificaMazzi(
      [{ id: 'm1', nome: 'Pulito', carte: { 'base-01': 2, 'base-10': 0 } }], collezione,
    );
    assert.equal('base-10' in esito[0].carte, false);
  });

  test('quantita negative o decimali vengono respinte', () => {
    assert.throws(() => verificaMazzi([{ id: 'm1', nome: 'X', carte: { 'base-01': -1 } }], collezione), /non valida/);
    assert.throws(() => verificaMazzi([{ id: 'm1', nome: 'X', carte: { 'base-01': 1.5 } }], collezione), /non valida/);
  });

  test('piu di tre mazzi no', () => {
    const troppi = Array.from({ length: MAZZI_MASSIMI + 1 }, (_, i) => ({
      id: `m${i}`, nome: `M${i}`, carte: {},
    }));
    assert.throws(() => verificaMazzi(troppi, collezione), /piu di 3/);
  });

  test('un nome chilometrico viene accorciato, non respinto', () => {
    const esito = verificaMazzi([{ id: 'm1', nome: 'x'.repeat(200), carte: {} }], collezione);
    assert.equal(esito[0].nome.length, 40);
  });

  test('quello che non e un elenco di mazzi viene respinto', () => {
    assert.throws(() => verificaMazzi(undefined, collezione), /mancanti/i);
    assert.throws(() => verificaMazzi([{ nome: 'senza id', carte: {} }], collezione), /id o nome/);
  });
});

describe('rotte del profilo', () => {
  test('senza account non si legge niente', async () => {
    assert.equal((await chiama('GET', '/profilo')).stato, 401);
  });

  test('un nuovo iscritto trova gia collezione e mazzo', async () => {
    const token = await iscrivi('nuovo');
    const esito = await chiama('GET', '/profilo', token);
    assert.equal(esito.stato, 200);
    assert.equal(Object.keys(esito.corpo.profilo.collezione).length, 21, '20 creature piu l oggetto');
    assert.equal(esito.corpo.profilo.mazzi.length, 1);
    assert.equal(esito.corpo.profilo.mazzoAttivoId, 'mazzo-1');
  });

  test('i mazzi si salvano e si rileggono', async () => {
    const token = await iscrivi('deckbuilder');
    const nuovi = [{ id: 'm1', nome: 'Aggro Sangue', carte: { 'base-01': 3, 'base-08': 2 } }];
    const salvato = await chiama('PUT', '/profilo/mazzi', token, { mazzi: nuovi, mazzoAttivoId: 'm1' });
    assert.equal(salvato.stato, 200, JSON.stringify(salvato.corpo));

    const riletto = await chiama('GET', '/profilo', token);
    assert.equal(riletto.corpo.profilo.mazzi[0].nome, 'Aggro Sangue');
    assert.equal(riletto.corpo.profilo.mazzoAttivoId, 'm1');
  });

  test('un mazzo con carte non possedute viene respinto', async () => {
    const token = await iscrivi('baro');
    const esito = await chiama('PUT', '/profilo/mazzi', token, {
      mazzi: [{ id: 'm1', nome: 'Impossibile', carte: { 'carta-inventata': 2 } }],
    });
    assert.equal(esito.stato, 400);
  });

  test('un mazzo attivo che non esiste viene respinto', async () => {
    const token = await iscrivi('distratto');
    const esito = await chiama('PUT', '/profilo/mazzi', token, {
      mazzi: [{ id: 'm1', nome: 'Uno', carte: {} }], mazzoAttivoId: 'm9',
    });
    assert.equal(esito.stato, 400);
  });

  test('LA COLLEZIONE NON SI SCRIVE: non esiste una rotta per farlo', async () => {
    const token = await iscrivi('ingordo');
    for (const metodo of ['PUT', 'POST']) {
      const esito = await chiama(metodo, '/profilo', token, {
        collezione: { 'base-19': 99 }, oro: 999999,
      });
      assert.equal(esito.stato, 404, `${metodo} /profilo non deve esistere`);
    }
    const riletto = await chiama('GET', '/profilo', token);
    assert.notEqual(riletto.corpo.profilo.collezione['base-19'], 99);
    assert.equal(riletto.corpo.profilo.oro, 0);
  });

  test('nemmeno passando collezione e oro insieme ai mazzi', async () => {
    const token = await iscrivi('ingordo2');
    await chiama('PUT', '/profilo/mazzi', token, {
      mazzi: [{ id: 'm1', nome: 'Uno', carte: {} }],
      collezione: { 'base-19': 99 },
      oro: 999999,
    });
    const riletto = await chiama('GET', '/profilo', token);
    assert.notEqual(riletto.corpo.profilo.collezione['base-19'], 99);
    assert.equal(riletto.corpo.profilo.oro, 0);
  });
});
