import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { archivioInMemoria, creaServer, rotte } from '@bloodyfights/server';
import { ErroreServer, creaCliente, type Cliente } from '../src/cliente.ts';

/**
 * CLIENT CONTRO SERVER VERO.
 *
 * I test del cliente usano un `fetch` finto, quelli del server chiamano le
 * sue rotte: ognuno dei due puo' passare mentre il confine fra loro e'
 * rotto. Qui si avvia il server vero e gli si parla con il cliente vero, cosi'
 * un disaccordo sui nomi dei campi o sui codici di stato viene a galla.
 */
describe('il client parla con il server', () => {
  let server: Server;
  let cliente: Cliente;

  before(async () => {
    server = creaServer({ rotte: rotte(archivioInMemoria()), origini: ['http://localhost:5173'] });
    await new Promise<void>((pronto) => server.listen(0, '127.0.0.1', pronto));
    cliente = creaCliente(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  });

  after(() => new Promise((chiuso) => server.close(chiuso)));

  test('il server risponde di essere vivo', async () => {
    assert.equal(await cliente.salute(), true);
  });

  test('registrazione: il client riceve token e utente con i campi che si aspetta', async () => {
    const esito = await cliente.registrazione('benito@esempio.it', 'gocce-di-sangue-42', 'Benito');
    assert.ok(esito.token.length > 20);
    assert.equal(esito.utente.nickname, 'Benito');
    assert.equal(esito.utente.mmr, 1000);
    assert.equal(typeof esito.utente.oro, 'number');
    assert.equal(typeof esito.utente.creatoIl, 'string');
    // Il tipo dichiarato nel client non deve promettere campi che non arrivano.
    for (const campo of ['id', 'nickname', 'bio', 'oro', 'mmr', 'vittorie', 'sconfitte', 'cartaCreataId', 'creatoIl']) {
      assert.ok(campo in esito.utente, `manca ${campo}`);
    }
  });

  test('il token ottenuto apre davvero la rotta privata', async () => {
    const { token } = await cliente.accesso('benito@esempio.it', 'gocce-di-sangue-42');
    const utente = await cliente.io(token);
    assert.equal(utente.nickname, 'Benito');
  });

  test('una password sbagliata arriva al client come 401 con il suo messaggio', async () => {
    const errore = await cliente
      .accesso('benito@esempio.it', 'sbagliatissima')
      .catch((e) => e as ErroreServer);
    assert.equal(errore.stato, 401);
    assert.equal(errore.irraggiungibile, false);
    assert.match(errore.message, /non corretti/);
  });

  test('un indirizzo gia preso arriva come 409', async () => {
    const errore = await cliente
      .registrazione('benito@esempio.it', 'gocce-di-sangue-42', 'Altro')
      .catch((e) => e as ErroreServer);
    assert.equal(errore.stato, 409);
  });

  test('una password corta viene rifiutata con 400 e spiegata', async () => {
    const errore = await cliente
      .registrazione('nuovo@esempio.it', 'corta', 'Nuovo')
      .catch((e) => e as ErroreServer);
    assert.equal(errore.stato, 400);
    assert.match(errore.message, /10 caratteri/);
  });

  test('uscire revoca il token: la rotta privata smette di rispondere', async () => {
    const { token } = await cliente.accesso('benito@esempio.it', 'gocce-di-sangue-42');
    await cliente.uscita(token);
    const errore = await cliente.io(token).catch((e) => e as ErroreServer);
    assert.equal(errore.stato, 401);
  });

  test('un server spento si riconosce, e non viene scambiato per un rifiuto', async () => {
    const spento = creaCliente('http://127.0.0.1:1');
    assert.equal(await spento.salute(), false);
    const errore = await spento.io('abc').catch((e) => e as ErroreServer);
    assert.equal(errore.irraggiungibile, true);
  });
});
