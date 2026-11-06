import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CARTE_BASE, creaPartita, mazzoBaseCompleto, occulta } from '@bloodyfights/motore';
import { paginaOnline, riassuntoEsito, secondiAlTurno, type ContestoOnline } from '../src/online.ts';
import { disegna, type Schermata } from '../src/vista.ts';
import type { PartitaRemota } from '../src/cliente.ts';

function contesto(parziale: Partial<ContestoOnline> = {}): ContestoOnline {
  return {
    statoOnline: { tipo: 'fermo' },
    attesaMs: 0,
    erroriMazzo: [],
    nickname: 'Benito',
    mmr: 1000,
    vittorie: 3,
    sconfitte: 1,
    messaggio: '',
    ...parziale,
  };
}

describe('pagina online', () => {
  test('senza server lo dice, e non mostra il pulsante di ricerca', () => {
    const html = paginaOnline(contesto({ statoOnline: { tipo: 'senzaServer' } }));
    assert.match(html, /Online non disponibile/);
    assert.doesNotMatch(html, /data-azione="cerca-partita"/);
  });

  test('senza conto manda all accesso', () => {
    const html = paginaOnline(contesto({ statoOnline: { tipo: 'senzaConto' } }));
    assert.match(html, /data-pagina="accesso"/);
    assert.doesNotMatch(html, /data-azione="cerca-partita"/);
  });

  test('da fermi si puo cercare una partita', () => {
    const html = paginaOnline(contesto());
    assert.match(html, /data-azione="cerca-partita"/);
    assert.doesNotMatch(html, /disabled/);
  });

  test('con un mazzo invalido il pulsante e spento e gli errori si leggono', () => {
    const html = paginaOnline(contesto({ erroriMazzo: ['Il mazzo deve contenere 20 carte'] }));
    assert.match(html, /data-azione="cerca-partita"[^>]*disabled/);
    assert.match(html, /20 carte/);
  });

  test('il punteggio e il bilancio si vedono', () => {
    const html = paginaOnline(contesto());
    assert.match(html, /1000/);
    assert.match(html, /3 vinte/);
    assert.match(html, /75%/, 'tre su quattro');
  });

  test('senza partite giocate non si divide per zero', () => {
    const html = paginaOnline(contesto({ vittorie: 0, sconfitte: 0 }));
    assert.doesNotMatch(html, /NaN|Infinity/);
  });

  test('in coda mostra il tempo e il modo di annullare', () => {
    const html = paginaOnline(contesto({ statoOnline: { tipo: 'inCoda', da: 0 }, attesaMs: 95_000 }));
    assert.match(html, /1m 35s/);
    assert.match(html, /data-azione="esci-coda"/);
    assert.doesNotMatch(html, /data-azione="cerca-partita"/);
  });

  test('in coda i secondi sotto il minuto si scrivono da soli', () => {
    const html = paginaOnline(contesto({ statoOnline: { tipo: 'inCoda', da: 0 }, attesaMs: 7_400 }));
    assert.match(html, /7s/);
    assert.doesNotMatch(html, /0m/);
  });

  test('un errore si mostra con il modo di riprovare', () => {
    const html = paginaOnline(contesto({ statoOnline: { tipo: 'errore', messaggio: 'Coda piena' } }));
    assert.match(html, /Coda piena/);
    assert.match(html, /data-azione="cerca-partita"/);
  });

  test('il nickname viene fuggito: non si inietta HTML nella pagina', () => {
    const html = paginaOnline(contesto({ nickname: '<img src=x onerror=1>' }));
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img/);
  });

  test('un nome vuoto non lascia un buco', () => {
    assert.match(paginaOnline(contesto({ nickname: '' })), /Senza nome/);
  });
});

function partitaFinta(parziale: Partial<PartitaRemota> = {}): PartitaRemota {
  return {
    partitaId: 'p1', io: 0, avversario: 'b', stato: {}, scadeIl: 60_000, esito: null, ...parziale,
  };
}

describe('contasecondi', () => {
  test('senza partita non c e nulla da contare', () => {
    assert.equal(secondiAlTurno(null, 0), null);
  });

  test('conta i secondi che restano', () => {
    assert.equal(secondiAlTurno(partitaFinta(), 10_000), 50);
  });

  test('non scende sotto zero', () => {
    assert.equal(secondiAlTurno(partitaFinta(), 90_000), 0);
  });

  test('a partita finita il cronometro si spegne', () => {
    const finita = partitaFinta({ esito: { vincitoreId: 'a', motivo: 'regole', mmr: {} } });
    assert.equal(secondiAlTurno(finita, 0), null);
  });
});

describe('riassunto dell esito', () => {
  const mmr = { io: 1016, altro: 984 };

  test('vittoria ai punti, con il punteggio nuovo', () => {
    const testo = riassuntoEsito(
      partitaFinta({ esito: { vincitoreId: 'io', motivo: 'regole', mmr } }), 'io',
    );
    assert.match(testo, /vinto/);
    assert.match(testo, /1016/);
  });

  test('sconfitta per abbandono', () => {
    const testo = riassuntoEsito(
      partitaFinta({ esito: { vincitoreId: 'altro', motivo: 'abbandono', mmr } }), 'io',
    );
    assert.match(testo, /perso/);
    assert.match(testo, /abbandono/);
  });

  test('pareggio', () => {
    const testo = riassuntoEsito(
      partitaFinta({ esito: { vincitoreId: null, motivo: 'abbandono', mmr: {} } }), 'io',
    );
    assert.match(testo, /Pareggio/);
  });

  test('senza punteggio nuovo non si inventa un numero', () => {
    const testo = riassuntoEsito(
      partitaFinta({ esito: { vincitoreId: 'io', motivo: 'tempo', mmr: {} } }), 'io',
    );
    assert.doesNotMatch(testo, /punteggio/);
    assert.match(testo, /tempo/);
  });
});

// --------------------------------------------- il tabellone di una partita online

function schermataOnline(extra: Partial<Schermata> = {}): Schermata {
  const stato = creaPartita({
    idGiocatori: ['io', 'altro'],
    mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()],
    carte: CARTE_BASE,
    seme: 11,
    primoGiocatore: 0,
  });
  return {
    stato: occulta(stato, 0),
    io: 0,
    selezione: null,
    messaggio: '',
    turnoDelBot: false,
    animazione: null,
    dettaglio: null,
    urlSprite: () => '',
    nomeAvversario: 'Avversario',
    online: true,
    secondiRimasti: 42,
    ...extra,
  };
}

describe('tabellone online', () => {
  test('lo stato occultato si disegna senza rompersi', () => {
    const html = disegna(schermataOnline());
    assert.match(html, /class="partita"/);
    assert.equal((html.match(/data-casella="/g) ?? []).length, 16);
  });

  test('le carte coperte dell avversario non finiscono nella pagina', () => {
    assert.doesNotMatch(disegna(schermataOnline()), /\?\?\?/);
  });

  test('al posto del bot si legge il nome dell avversario', () => {
    const html = disegna(schermataOnline());
    assert.match(html, /Avversario/);
    assert.doesNotMatch(html, />Bot</);
  });

  test('online si abbandona, non si ricomincia', () => {
    const html = disegna(schermataOnline());
    assert.match(html, /data-azione="abbandona"/);
    assert.doesNotMatch(html, /data-azione="nuova"/);
  });

  test('contro il bot invece si ricomincia', () => {
    const html = disegna(schermataOnline({ online: false, secondiRimasti: null, nomeAvversario: undefined }));
    assert.match(html, /data-azione="nuova"/);
    assert.doesNotMatch(html, /data-azione="abbandona"/);
  });

  test('il contasecondi si vede, e sotto i dieci secondi diventa urgente', () => {
    assert.match(disegna(schermataOnline()), /class="contasecondi ">42s/);
    assert.match(disegna(schermataOnline({ secondiRimasti: 6 })), /contasecondi urgente">6s/);
  });

  test('senza limite di tempo non compare nessun numero', () => {
    assert.doesNotMatch(disegna(schermataOnline({ secondiRimasti: null })), /contasecondi/);
  });

  test('a fine partita online si cerca un altra partita', () => {
    const base = schermataOnline();
    const finito: Schermata = {
      ...base,
      stato: { ...base.stato, fase: 'finita', vincitore: 0 },
    };
    const html = disegna(finito);
    assert.match(html, /VITTORIA/);
    assert.match(html, /data-azione="torna-in-coda"/);
  });

  test('il pareggio ha un nome suo, non e una sconfitta', () => {
    const base = schermataOnline();
    const pari: Schermata = {
      ...base,
      stato: { ...base.stato, fase: 'finita', vincitore: null },
    };
    assert.match(disegna(pari), /PAREGGIO/);
  });
});
