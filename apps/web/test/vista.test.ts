import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARTE_BASE,
  applicaAzione,
  casella,
  creaPartita,
  mazzoBaseCompleto,
  type CartaInCampo,
  type StatoPartitaConCatalogo,
} from '@bloodyfights/motore';
import { mossaBot } from '@bloodyfights/bot';
import { caselleBersagliabili, descriviVoce, disegna, inattivaInSecondaLinea, type Schermata } from '../src/vista.ts';

function schermata(parziale: Partial<Schermata> = {}): Schermata {
  const stato =
    parziale.stato ??
    creaPartita({
      idGiocatori: ['Tu', 'Bot'],
      mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()],
      carte: CARTE_BASE,
      seme: 4242,
      primoGiocatore: 0,
    });

  return {
    stato,
    io: 0,
    selezione: null,
    messaggio: '',
    turnoDelBot: false,
    animazione: null,
    dettaglio: null,
    urlSprite: (cartaId) => `sprite:${cartaId}`,
    ...parziale,
  };
}

function metti(stato: StatoPartitaConCatalogo, g: 0 | 1, slot: number, carta: Partial<CartaInCampo>): CartaInCampo {
  const istanza: CartaInCampo = {
    uid: `u${slot}`,
    cartaId: 'base-01',
    nome: 'Prova',
    tipo: 'mischia',
    elemento: 'sangue',
    vita: 5,
    vitaMax: 5,
    attacco: 3,
    costo: 1,
    fresca: false,
    haAgito: false,
    ...carta,
  };
  stato.giocatori[g].tabellone[slot] = istanza;
  return istanza;
}

describe('disegno del tabellone', () => {
  test('quattro linee e sedici caselle in tutto', () => {
    const html = disegna(schermata());
    assert.equal((html.match(/class="linea"/g) ?? []).length, 4);
    assert.equal((html.match(/data-casella="/g) ?? []).length, 16);
  });

  test('le colonne avversarie sono numerate a specchio', () => {
    // La prima casella della mia 1a linea e' p11; quella che le sta davanti,
    // nello schieramento avversario, e' k14 (cap. 4.1).
    const html = disegna(schermata());
    assert.match(html, /title="p11"/);
    assert.match(html, /title="k14"/);
    assert.match(html, /title="k21"/);
    // Nessuna coordinata inesistente.
    assert.doesNotMatch(html, /title="k10"/);
    assert.doesNotMatch(html, /title="p15"/);
  });

  test('ogni carta in campo mostra vita su vita massima', () => {
    const s = schermata();
    metti(s.stato, 0, casella(0, 0), { nome: 'Ferita', vita: 2, vitaMax: 9 });
    assert.match(disegna(s), /2\/9/);
  });

  test('una carta fresca e una mischia in 2a linea sono segnalate', () => {
    const s = schermata();
    metti(s.stato, 0, casella(0, 1), { fresca: true });
    metti(s.stato, 0, casella(1, 2), { tipo: 'mischia' });
    const html = disegna(s);
    assert.match(html, /FRESCA/);
    assert.match(html, /NON ATTACCA/);
  });

  test('una carta a distanza in 2a linea non e segnalata come inattiva', () => {
    const distanza = metti(schermata().stato, 0, casella(1, 0), { tipo: 'distanza' });
    assert.equal(inattivaInSecondaLinea(distanza, casella(1, 0)), false);
    const mischia = metti(schermata().stato, 0, casella(1, 0), { tipo: 'mischia' });
    assert.equal(inattivaInSecondaLinea(mischia, casella(1, 0)), true);
  });

  test('il nome delle carte viene reso innocuo', () => {
    const s = schermata();
    metti(s.stato, 0, casella(0, 0), { nome: '<script>cattivo()</script>' });
    const html = disegna(s);
    assert.doesNotMatch(html, /<script>cattivo/);
    assert.match(html, /&lt;script&gt;/);
  });

  test('la schermata di esito appare solo a partita finita', () => {
    const s = schermata();
    assert.doesNotMatch(disegna(s), /class="esito"/);
    s.stato.fase = 'finita';
    s.stato.vincitore = 0;
    assert.match(disegna(s), /VITTORIA/);
    s.stato.vincitore = 1;
    assert.match(disegna(s), /SCONFITTA/);
  });
});

describe('caselle accese dalla selezione', () => {
  test('una carta pagabile accende tutte le caselle libere', () => {
    const s = schermata({ selezione: { tipo: 'mano', indice: 0 } });
    s.stato.giocatori[0].gocce = 10;
    assert.equal(caselleBersagliabili(s).size, 8);
    metti(s.stato, 0, 0, {});
    assert.equal(caselleBersagliabili(s).size, 7);
  });

  test('una carta non pagabile non accende nulla', () => {
    const s = schermata({ selezione: { tipo: 'mano', indice: 0 } });
    s.stato.giocatori[0].gocce = 0;
    s.stato.giocatori[0].mano = ['base-19']; // costo 5
    assert.equal(caselleBersagliabili(s).size, 0);
  });

  test('in fase support si accendono solo gli alleati feriti', () => {
    const s = schermata({ selezione: { tipo: 'support', casella: 0 } });
    s.stato.fase = 'support';
    metti(s.stato, 0, 0, { tipo: 'support' });
    metti(s.stato, 0, 1, { vita: 5, vitaMax: 5 });
    metti(s.stato, 0, 2, { vita: 2, vitaMax: 9 });
    const accese = caselleBersagliabili(s);
    assert.deepEqual([...accese], [2]);
  });

  test('niente si accende quando non e il mio turno', () => {
    const s = schermata({ selezione: { tipo: 'mano', indice: 0 } });
    s.stato.turnoDi = 1;
    assert.equal(caselleBersagliabili(s).size, 0);
  });

  test('il riposizionamento gia usato non accende nulla', () => {
    const s = schermata({ selezione: { tipo: 'carta', casella: 0 } });
    s.stato.fase = 'riposizionamento';
    metti(s.stato, 0, 0, {});
    assert.equal(caselleBersagliabili(s).size, 7);
    s.stato.giocatori[0].riposizionamentoUsato = true;
    assert.equal(caselleBersagliabili(s).size, 0);
  });
});

describe('registro', () => {
  test('ogni tipo di voce prodotta da una partita vera e descrivibile', () => {
    // Si gioca una partita intera fra due bot e si pretende che il registro
    // sappia raccontare tutto cio' che il motore ha scritto. Far solo passare
    // le fasi non basta: a tabelloni vuoti non si combatte e non si muore.
    let stato = schermata().stato;
    let guardia = 0;
    const visti = new Set<string>();

    while (stato.fase !== 'finita' && guardia < 2000) {
      stato = applicaAzione(stato, mossaBot(stato));
      guardia++;
    }
    assert.equal(stato.fase, 'finita', 'la partita simulata deve chiudersi');

    const vista = schermata({ stato });
    for (const voce of stato.log) {
      visti.add(voce.tipo);
      assert.doesNotThrow(() => descriviVoce(voce, vista), `voce ${voce.tipo}`);
    }
    assert.ok(visti.size >= 6, `tipi di voce incontrati: ${[...visti].join(', ')}`);
    assert.ok(visti.has('colpo'));
    assert.ok(visti.has('vittoria'));
  });

  test('cambioFase e fineTurno non finiscono nel registro', () => {
    const s = schermata();
    assert.equal(descriviVoce({ tipo: 'fineTurno', giocatore: 0 }, s), null);
    assert.equal(descriviVoce({ tipo: 'cambioFase', giocatore: 0, fase: 'support' }, s), null);
  });

  test('il colpo diretto al giocatore e segnalato con rilievo', () => {
    const s = schermata();
    const descrizione = descriviVoce(
      { tipo: 'colpo', giocatore: 0, da: 0, bersaglio: { genere: 'giocatore' }, danno: 4, moltiplicatore: 1 },
      s,
    );
    assert.ok(descrizione);
    assert.equal(descrizione.rilievo, true);
    assert.match(descrizione.testo, /direttamente per 4/);
  });

  test('il moltiplicatore elementale appare solo quando c e', () => {
    const s = schermata();
    const con = descriviVoce(
      { tipo: 'colpo', giocatore: 0, da: 0, bersaglio: { genere: 'carta', casella: 0 }, danno: 6, moltiplicatore: 1.5 },
      s,
    );
    const senza = descriviVoce(
      { tipo: 'colpo', giocatore: 0, da: 0, bersaglio: { genere: 'carta', casella: 0 }, danno: 4, moltiplicatore: 1 },
      s,
    );
    assert.match(con!.testo, /x1\.5 elementale/);
    assert.doesNotMatch(senza!.testo, /elementale/);
  });
});

describe('indicatori di vita e gocce', () => {
  test('la vita e una barra larga quanto la quota rimasta', () => {
    const s = schermata();
    s.stato.giocatori[0].vita = 5; // un quarto di 20
    assert.match(disegna(s), /class="barra-vita" title="5 su 20"><span style="width: 25%"/);
  });

  test('sotto un quarto di vita l indicatore entra in agonia', () => {
    const s = schermata();
    s.stato.giocatori[0].vita = 20;
    assert.doesNotMatch(disegna(s), /misura-vita agonia/);
    s.stato.giocatori[0].vita = 5;
    assert.match(disegna(s), /misura-vita agonia/);
  });

  test('la vita a zero non produce una barra negativa', () => {
    const s = schermata();
    s.stato.giocatori[1].vita = -3;
    assert.match(disegna(s), /width: 0%/);
    assert.doesNotMatch(disegna(s), /width: -/);
  });

  test('le gocce sono dieci pastiglie, piene fino al valore corrente', () => {
    const s = schermata();
    s.stato.giocatori[0].gocce = 3;
    const html = disegna(s);
    assert.equal((html.match(/class="pastiglia /g) ?? []).length, 20, 'dieci per giocatore');
    assert.equal((html.match(/class="pastiglia piena"/g) ?? []).length, 3 + s.stato.giocatori[1].gocce);
  });

  test('chi e di turno e segnalato, e solo lui', () => {
    const html = disegna(schermata());
    assert.equal((html.match(/marca-turno/g) ?? []).length, 1);
    assert.equal((html.match(/class="testata[^"]*di-turno/g) ?? []).length, 1);
  });

  test('a partita finita nessuno e di turno', () => {
    const s = schermata();
    s.stato.fase = 'finita';
    assert.doesNotMatch(disegna(s), /marca-turno/);
  });
});

describe('carte oggetto nella mano', () => {
  function conOggetto(fase: 'evocazione' | 'support' = 'evocazione') {
    const s = schermata();
    s.stato.giocatori[0].mano = ['base-21', 'base-01'];
    s.stato.fase = fase;
    return s;
  }

  test('si giocano con un attributo proprio: non chiedono una casella', () => {
    const html = disegna(conOggetto());
    assert.match(html, /data-gioca-oggetto="0"/);
    assert.match(html, /data-mano="1"/, 'la creatura resta una carta da schierare');
  });

  test('restano giocabili anche fuori dalla fase di evocazione', () => {
    const html = disegna(conOggetto('support'));
    assert.doesNotMatch(html, /data-gioca-oggetto="0"\s+disabled/);
    assert.match(html, /data-mano="1"\s+disabled/, 'la creatura invece no');
  });

  test('mostrano GIOCA al posto di vita e attacco', () => {
    const html = disegna(conOggetto());
    assert.match(html, /class="usa">GIOCA</);
  });

  test('non si possono giocare nel turno dell avversario', () => {
    const s = conOggetto();
    s.stato.turnoDi = 1;
    assert.match(disegna(s), /data-gioca-oggetto="0"\s+disabled/);
  });

  test('la descrizione compare nel suggerimento', () => {
    assert.match(disegna(conOggetto()), /title="Goccia di Sangue - Una goccia/);
  });

  test('il registro racconta la carta giocata', () => {
    const s = schermata();
    const descrizione = descriviVoce(
      { tipo: 'oggetto', giocatore: 0, cartaId: 'base-21', effetto: 'goccia' },
      s,
    );
    assert.match(descrizione!.testo, /Goccia di Sangue.*\+1 goccia/);
  });
});

describe('descrizioni', () => {
  test('il pannello di dettaglio mostra la descrizione della carta', () => {
    const s = schermata();
    s.dettaglio = {
      uid: 'x', cartaId: 'base-01', nome: 'Topo di Fogna', tipo: 'mischia', elemento: 'sangue',
      vita: 2, vitaMax: 2, attacco: 2, costo: 1, descrizione: 'Morde prima di guardare.',
      fresca: false, haAgito: false,
    };
    assert.match(disegna(s), /class="descrizione">Morde prima di guardare\./);
  });

  test('una carta senza descrizione non lascia un riquadro vuoto', () => {
    const s = schermata();
    s.dettaglio = {
      uid: 'x', cartaId: 'base-01', nome: 'Senza', tipo: 'mischia', elemento: 'sangue',
      vita: 2, vitaMax: 2, attacco: 2, costo: 1, descrizione: '',
      fresca: false, haAgito: false,
    };
    assert.doesNotMatch(disegna(s), /class="descrizione"/);
  });
});
