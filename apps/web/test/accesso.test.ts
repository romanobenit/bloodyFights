import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ErroreServer, creaCliente, type UtenteRemoto } from '../src/cliente.ts';
import {
  etichettaAccesso, moduloVuoto, paginaAccesso, type ContestoAccesso,
} from '../src/accesso.ts';

const UTENTE: UtenteRemoto = {
  id: 'u1', nickname: 'Benito', bio: '', oro: 120, mmr: 1040,
  vittorie: 3, sconfitte: 1, cartaCreataId: null, creatoIl: '2026-11-06T10:00:00.000Z',
};

/** Finto `fetch`: registra le chiamate e risponde quello che gli si dice. */
function recuperoFinto(risposte: { stato: number; corpo?: unknown }[]) {
  const chiamate: { url: string; opzioni: RequestInit }[] = [];
  let i = 0;
  const recupera = async (url: string | URL | Request, opzioni: RequestInit = {}) => {
    chiamate.push({ url: String(url), opzioni });
    const r = risposte[Math.min(i++, risposte.length - 1)];
    // null e non '': una risposta 204 non puo avere corpo, e Response rifiuta
    // anche una stringa vuota.
    return new Response(r.corpo === undefined ? null : JSON.stringify(r.corpo), {
      status: r.stato,
    });
  };
  return { recupera: recupera as unknown as typeof globalThis.fetch, chiamate };
}

describe('cliente', () => {
  test('manda la registrazione dove e come deve', async () => {
    const finto = recuperoFinto([{ stato: 201, corpo: { token: 'abc', utente: UTENTE } }]);
    const cliente = creaCliente('http://localhost:4000/', finto.recupera);

    const esito = await cliente.registrazione('a@b.it', 'password-lunga', 'Benito');
    assert.equal(esito.token, 'abc');
    assert.equal(esito.utente.nickname, 'Benito');

    const chiamata = finto.chiamate[0];
    assert.equal(chiamata.url, 'http://localhost:4000/identita/registrazione', 'barra finale tolta');
    assert.equal(chiamata.opzioni.method, 'POST');
    assert.deepEqual(JSON.parse(String(chiamata.opzioni.body)), {
      email: 'a@b.it', password: 'password-lunga', nickname: 'Benito',
    });
  });

  test('il token viaggia nell intestazione, non nell indirizzo', async () => {
    const finto = recuperoFinto([{ stato: 200, corpo: { utente: UTENTE } }]);
    const cliente = creaCliente('http://localhost:4000', finto.recupera);
    await cliente.io('segretissimo');

    const chiamata = finto.chiamate[0];
    assert.doesNotMatch(chiamata.url, /segretissimo/, 'mai nell indirizzo: finirebbe nei log');
    const intestazioni = chiamata.opzioni.headers as Record<string, string>;
    assert.equal(intestazioni.Authorization, 'Bearer segretissimo');
  });

  test('un errore del server diventa un messaggio leggibile, con il suo stato', async () => {
    const finto = recuperoFinto([{ stato: 401, corpo: { errore: 'Indirizzo o password non corretti' } }]);
    const cliente = creaCliente('http://localhost:4000', finto.recupera);

    const errore = await cliente.accesso('a@b.it', 'x').catch((e) => e as ErroreServer);
    assert.ok(errore instanceof ErroreServer);
    assert.equal(errore.stato, 401);
    assert.equal(errore.message, 'Indirizzo o password non corretti');
    assert.equal(errore.irraggiungibile, false);
  });

  test('un server spento si riconosce da un errore dedicato', async () => {
    const recupera = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof globalThis.fetch;
    const cliente = creaCliente('http://localhost:4000', recupera);

    const errore = await cliente.io('abc').catch((e) => e as ErroreServer);
    assert.equal(errore.irraggiungibile, true);
    assert.match(errore.message, /non raggiungibile/);
  });

  test('salute risponde falso invece di sollevare', async () => {
    const recupera = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof globalThis.fetch;
    assert.equal(await creaCliente('http://x', recupera).salute(), false);
  });

  test('una risposta 204 non viene interpretata come JSON vuoto', async () => {
    const finto = recuperoFinto([{ stato: 204 }]);
    const cliente = creaCliente('http://localhost:4000', finto.recupera);
    await assert.doesNotReject(() => cliente.uscita('abc'));
  });

  test('una risposta illeggibile non passa per buona', async () => {
    const recupera = (async () => new Response('non sono json', { status: 200 })) as unknown as typeof globalThis.fetch;
    const errore = await creaCliente('http://x', recupera).io('abc').catch((e) => e as ErroreServer);
    assert.match(errore.message, /illeggibile/);
  });
});

describe('pagina di accesso', () => {
  const contesto = (parziale: Partial<ContestoAccesso> = {}): ContestoAccesso => ({
    statoServer: 'presente', utente: null, modulo: moduloVuoto(), errore: '', inCorso: false, ...parziale,
  });

  test('col server presente mostra il modulo di accesso', () => {
    const html = paginaAccesso(contesto());
    assert.match(html, /data-campo="email-accesso"/);
    assert.match(html, /data-campo="password-accesso"/);
    assert.match(html, /type="password"/);
    assert.doesNotMatch(html, /data-campo="nickname-accesso"/, 'il nickname serve solo registrandosi');
  });

  test('passando a registrazione compare il nickname', () => {
    const html = paginaAccesso(contesto({ modulo: { ...moduloVuoto(), modo: 'registrazione' } }));
    assert.match(html, /data-campo="nickname-accesso"/);
    assert.match(html, /almeno 10 caratteri/);
  });

  test('la password non viene mai ristampata nel campo', () => {
    const html = paginaAccesso(
      contesto({ modulo: { ...moduloVuoto(), password: 'gocce-di-sangue-42' } }),
    );
    assert.doesNotMatch(html, /gocce-di-sangue-42/);
  });

  test('l errore del server viene mostrato', () => {
    const html = paginaAccesso(contesto({ errore: 'Indirizzo o password non corretti' }));
    assert.match(html, /non corretti/);
  });

  test('mentre la richiesta e in corso il pulsante e bloccato', () => {
    assert.match(paginaAccesso(contesto({ inCorso: true })), /data-azione="invia-accesso"\s+disabled/);
  });

  test('connesso: statistiche dell account e uscita, niente moduli', () => {
    const html = paginaAccesso(contesto({ utente: UTENTE }));
    assert.match(html, /Benito/);
    assert.match(html, /MMR<\/dt><dd class="costo">1040/);
    assert.match(html, /75%/);
    assert.match(html, /data-azione="esci"/);
    assert.doesNotMatch(html, /data-campo="password-accesso"/);
  });

  test('senza server lo spiega invece di mostrare un modulo inutile', () => {
    const html = paginaAccesso(contesto({ statoServer: 'assente' }));
    assert.match(html, /Nessun server in ascolto/);
    assert.match(html, /npm run server/);
    assert.doesNotMatch(html, /data-azione="invia-accesso"/);
    assert.match(html, /continua a funzionare/, 'dice che il gioco resta usabile');
  });

  test('la voce di menu dice a colpo d occhio come stai messo', () => {
    assert.equal(etichettaAccesso({ utente: UTENTE, statoServer: 'presente' }), 'Benito');
    assert.equal(etichettaAccesso({ utente: null, statoServer: 'presente' }), 'Accedi');
    assert.equal(etichettaAccesso({ utente: null, statoServer: 'assente' }), 'Account');
  });

  test('un nickname ostile viene reso innocuo', () => {
    const utente = { ...UTENTE, nickname: '<script>x()</script>' };
    assert.doesNotMatch(paginaAccesso(contesto({ utente })), /<script>x\(\)/);
  });
});
