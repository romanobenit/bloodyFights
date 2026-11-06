import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { archivioInMemoria, datiVuoti } from '../src/archivio.ts';
import {
  ErroreIdentita, PASSWORD_MINIMA, TENTATIVI_MASSIMI, accedi, creaImpronta, esci,
  improntaCorrisponde, improntaToken, normalizzaEmail, nuovoToken, registra, utenteDalToken,
  utentePubblico, validaRegistrazione,
} from '../src/identita.ts';

const PASSWORD = 'gocce-di-sangue-42';

describe('password', () => {
  test('la password non si puo ricavare dall impronta', async () => {
    const { impronta, sale } = await creaImpronta(PASSWORD);
    assert.doesNotMatch(impronta, /sangue/);
    assert.notEqual(impronta, PASSWORD);
    assert.ok(impronta.length >= 64);
    assert.ok(sale.length >= 16);
  });

  test('la stessa password da impronte diverse a utenti diversi', async () => {
    const a = await creaImpronta(PASSWORD);
    const b = await creaImpronta(PASSWORD);
    assert.notEqual(a.sale, b.sale, 'sale diverso');
    assert.notEqual(a.impronta, b.impronta, 'quindi impronta diversa');
  });

  test('riconosce la password giusta e rifiuta quella sbagliata', async () => {
    const { impronta, sale } = await creaImpronta(PASSWORD);
    assert.equal(await improntaCorrisponde(PASSWORD, impronta, sale), true);
    assert.equal(await improntaCorrisponde('gocce-di-sangue-43', impronta, sale), false);
    assert.equal(await improntaCorrisponde('', impronta, sale), false);
  });

  test('un sale sbagliato non apre niente', async () => {
    const { impronta } = await creaImpronta(PASSWORD);
    assert.equal(await improntaCorrisponde(PASSWORD, impronta, 'altro-sale'), false);
  });
});

describe('token di sessione', () => {
  test('ogni token e diverso e abbastanza lungo', () => {
    const token = new Set(Array.from({ length: 200 }, nuovoToken));
    assert.equal(token.size, 200);
    assert.ok([...token][0].length >= 32);
  });

  test('nell archivio finisce l impronta, non il token', () => {
    const token = nuovoToken();
    const impronta = improntaToken(token);
    assert.notEqual(impronta, token);
    assert.equal(improntaToken(token), impronta, 'stabile');
  });
});

describe('validazione', () => {
  test('una password corta viene rifiutata', () => {
    const errori = validaRegistrazione('a@b.it', 'corta', 'Benito');
    assert.match(errori.join(' '), new RegExp(String(PASSWORD_MINIMA)));
  });

  test('un indirizzo senza chiocciola o senza dominio viene rifiutato', () => {
    for (const email of ['benito', 'benito@', '@b.it', 'b@c', 'a b@c.it']) {
      assert.ok(validaRegistrazione(email, PASSWORD, 'Benito').length > 0, email);
    }
  });

  test('un indirizzo normale passa', () => {
    assert.deepEqual(validaRegistrazione('romanobenit@gmail.com', PASSWORD, 'Benito'), []);
  });

  test('l indirizzo si normalizza: maiuscole e spazi non creano doppioni', () => {
    assert.equal(normalizzaEmail('  Benito@Gmail.COM '), 'benito@gmail.com');
  });
});

describe('registrazione', () => {
  test('crea l utente con i valori di partenza del documento', async () => {
    const archivio = archivioInMemoria();
    const { token, utente } = await registra(archivio, 'a@b.it', PASSWORD, 'Benito');
    assert.equal(utente.mmr, 1000, 'Elo semplice, partenza a 1000');
    assert.equal(utente.oro, 0);
    assert.equal(utente.vittorie, 0);
    assert.ok(token.length > 20);
  });

  test('la password non viene mai scritta in chiaro', async () => {
    const archivio = archivioInMemoria();
    await registra(archivio, 'a@b.it', PASSWORD, 'Benito');
    const testo = JSON.stringify(await archivio.leggi());
    assert.doesNotMatch(testo, new RegExp(PASSWORD));
  });

  test('due account con lo stesso indirizzo non si possono creare', async () => {
    const archivio = archivioInMemoria();
    await registra(archivio, 'a@b.it', PASSWORD, 'Benito');
    await assert.rejects(() => registra(archivio, 'A@B.it', PASSWORD, 'Altro'), /gia un account/);
  });

  test('una registrazione rifiutata non lascia tracce', async () => {
    const archivio = archivioInMemoria();
    await assert.rejects(() => registra(archivio, 'non-valido', PASSWORD, 'Benito'));
    assert.deepEqual(await archivio.leggi(), datiVuoti());
  });
});

describe('accesso', () => {
  async function conUtente() {
    const archivio = archivioInMemoria();
    await registra(archivio, 'a@b.it', PASSWORD, 'Benito');
    return archivio;
  }

  test('con le credenziali giuste restituisce un token nuovo', async () => {
    const archivio = await conUtente();
    const { token, utente } = await accedi(archivio, 'a@b.it', PASSWORD);
    assert.ok(token.length > 20);
    assert.equal(utente.nickname, 'Benito');
  });

  test('il messaggio di errore e lo stesso per indirizzo e password sbagliati', async () => {
    const archivio = await conUtente();
    const inesistente = await accedi(archivio, 'nessuno@b.it', PASSWORD).catch((e) => e as Error);
    const passwordErrata = await accedi(archivio, 'a@b.it', 'sbagliatissima').catch((e) => e as Error);
    assert.equal(inesistente.message, passwordErrata.message);
    assert.match(inesistente.message, /non corretti/);
    assert.equal((inesistente as ErroreIdentita).stato, 401);
  });

  test('dopo troppi tentativi falliti si deve aspettare', async () => {
    const archivio = await conUtente();
    for (let i = 0; i < TENTATIVI_MASSIMI; i++) {
      await accedi(archivio, 'a@b.it', 'sbagliata').catch(() => undefined);
    }
    const bloccato = await accedi(archivio, 'a@b.it', PASSWORD).catch((e) => e as ErroreIdentita);
    assert.equal(bloccato.stato, 429);
    assert.match(bloccato.message, /Troppi tentativi/);
  });

  test('passata l attesa si puo riprovare', async () => {
    const archivio = await conUtente();
    const adesso = Date.now();
    for (let i = 0; i < TENTATIVI_MASSIMI; i++) {
      await accedi(archivio, 'a@b.it', 'sbagliata', adesso).catch(() => undefined);
    }
    const dopo = adesso + 16 * 60 * 1000;
    const esito = await accedi(archivio, 'a@b.it', PASSWORD, dopo);
    assert.ok(esito.token);
  });

  test('un accesso riuscito azzera il contatore dei tentativi', async () => {
    const archivio = await conUtente();
    await accedi(archivio, 'a@b.it', 'sbagliata').catch(() => undefined);
    await accedi(archivio, 'a@b.it', PASSWORD);
    const dati = await archivio.leggi();
    assert.equal(dati.utenti[0].tentativiFalliti, 0);
  });
});

describe('sessioni', () => {
  test('il token riconosce il suo utente', async () => {
    const archivio = archivioInMemoria();
    const { token } = await registra(archivio, 'a@b.it', PASSWORD, 'Benito');
    const utente = await utenteDalToken(archivio, token);
    assert.equal(utente?.nickname, 'Benito');
  });

  test('un token inventato o assente non riconosce nessuno', async () => {
    const archivio = archivioInMemoria();
    await registra(archivio, 'a@b.it', PASSWORD, 'Benito');
    assert.equal(await utenteDalToken(archivio, 'inventato'), null);
    assert.equal(await utenteDalToken(archivio, null), null);
    assert.equal(await utenteDalToken(archivio, ''), null);
  });

  test('un token scaduto non vale piu', async () => {
    const archivio = archivioInMemoria();
    const { token } = await registra(archivio, 'a@b.it', PASSWORD, 'Benito');
    const fraUnAnno = Date.now() + 365 * 24 * 60 * 60 * 1000;
    assert.equal(await utenteDalToken(archivio, token, fraUnAnno), null);
  });

  test('uscire revoca il token, e solo quello', async () => {
    const archivio = archivioInMemoria();
    const { token: primo } = await registra(archivio, 'a@b.it', PASSWORD, 'Benito');
    const { token: secondo } = await accedi(archivio, 'a@b.it', PASSWORD);

    await esci(archivio, primo);
    assert.equal(await utenteDalToken(archivio, primo), null, 'revocato');
    assert.ok(await utenteDalToken(archivio, secondo), 'l altra sessione resta aperta');
  });
});

describe('cosa esce verso il client', () => {
  test('impronta, sale, email e tentativi non escono mai', async () => {
    const archivio = archivioInMemoria();
    const { utente } = await registra(archivio, 'a@b.it', PASSWORD, 'Benito');
    const pubblico = utentePubblico(utente) as Record<string, unknown>;
    for (const campo of ['impronta', 'sale', 'email', 'tentativiFalliti', 'ultimoTentativo']) {
      assert.equal(campo in pubblico, false, `${campo} non deve uscire`);
    }
    assert.equal(pubblico.nickname, 'Benito');
  });
});
