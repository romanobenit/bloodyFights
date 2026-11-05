import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CARTE_BASE, casella, creaPartita, mazzoBaseCompleto, type CartaInCampo } from '@bloodyfights/motore';
import { DURATE, disegna, type Animazione, type Schermata } from '../src/vista.ts';

function schermata(animazione: Animazione | null, io: 0 | 1 = 0): Schermata {
  return {
    stato: creaPartita({
      idGiocatori: ['Tu', 'Bot'],
      mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()],
      carte: CARTE_BASE,
      seme: 31337,
      primoGiocatore: 0,
    }),
    io,
    selezione: null,
    messaggio: '',
    turnoDelBot: false,
    animazione,
    dettaglio: null,
    urlSprite: (id) => `sprite:${id}`,
  };
}

function cartaFinta(parziale: Partial<CartaInCampo> = {}): CartaInCampo {
  return {
    uid: 'x', cartaId: 'base-01', nome: 'Caduta', tipo: 'mischia', elemento: 'sangue',
    vita: 0, vitaMax: 5, attacco: 3, costo: 1, fresca: false, haAgito: false, ...parziale,
  };
}

/** Estrae l'apertura del bottone di una casella: classi e stile inline. */
function tagCasella(html: string, giocatore: number, slot: number): string {
  const trovato = html.match(
    new RegExp(`<button[^>]*data-giocatore="${giocatore}" data-casella="${slot}"[^>]*>`),
  );
  assert.ok(trovato, `casella ${giocatore}-${slot} non trovata`);
  return trovato[0];
}

describe('nessuna animazione', () => {
  test('senza animazione nessuna casella porta classi di movimento', () => {
    const html = disegna(schermata(null));
    for (const classe of ['appare', 'arriva', 'attacca', 'impatto', 'muore', 'ferito']) {
      assert.doesNotMatch(html, new RegExp(`\\b${classe}\\b`), `classe ${classe} di troppo`);
    }
    assert.doesNotMatch(html, /class="danno/);
  });
});

describe('evocazione', () => {
  test('solo la casella evocata si materializza', () => {
    const html = disegna(schermata({ tipo: 'evocazione', giocatore: 0, casella: 2 }));
    assert.match(tagCasella(html, 0, 2), /\bappare\b/);
    assert.doesNotMatch(tagCasella(html, 0, 3), /\bappare\b/);
    assert.doesNotMatch(tagCasella(html, 1, 2), /\bappare\b/, 'non sul lato avversario');
  });
});

describe('spostamento', () => {
  test('la casella di arrivo parte da dove era la carta', () => {
    // Da 1a linea colonna 0 a 1a linea colonna 2: arriva da due colonne a sinistra.
    const html = disegna(
      disegnaSpostamento({ da: casella(0, 0), a: casella(0, 2), scambio: false }),
    );
    const tag = tagCasella(html, 0, casella(0, 2));
    assert.match(tag, /\barriva\b/);
    assert.match(tag, /--dcol: -2/);
    assert.match(tag, /--driga: 0/);
  });

  test('salire dalla 2a alla 1a linea fa partire la carta dal basso', () => {
    const html = disegna(
      disegnaSpostamento({ da: casella(1, 1), a: casella(0, 1), scambio: false }),
    );
    const tag = tagCasella(html, 0, casella(0, 1));
    assert.match(tag, /--driga: 1/, 'la 2a linea e disegnata sotto la 1a');
    assert.match(tag, /--dcol: 0/);
  });

  test('sul lato avversario le righe sono capovolte, e il verso si inverte', () => {
    // Le linee avversarie sono disegnate 2a sopra 1a: lo stesso spostamento
    // sullo schermo va nella direzione opposta.
    const html = disegna(
      disegnaSpostamento({ da: casella(1, 1), a: casella(0, 1), scambio: false }, 1),
    );
    assert.match(tagCasella(html, 1, casella(0, 1)), /--driga: -1/);
  });

  test('uno scambio muove tutte e due le carte, in senso opposto', () => {
    const html = disegna(
      disegnaSpostamento({ da: casella(0, 0), a: casella(0, 3), scambio: true }),
    );
    assert.match(tagCasella(html, 0, casella(0, 3)), /--dcol: -3/);
    assert.match(tagCasella(html, 0, casella(0, 0)), /--dcol: 3/);
  });

  test('senza scambio la casella di partenza non si anima', () => {
    const html = disegna(
      disegnaSpostamento({ da: casella(0, 0), a: casella(0, 3), scambio: false }),
    );
    assert.doesNotMatch(tagCasella(html, 0, casella(0, 0)), /\barriva\b/);
  });
});

function disegnaSpostamento(
  mossa: { da: number; a: number; scambio: boolean },
  giocatore: 0 | 1 = 0,
): Schermata {
  return schermata({ tipo: 'spostamento', giocatore, ...mossa });
}

describe('attacco', () => {
  const colpo = {
    giocatore: 0 as const,
    da: casella(0, 1),
    bersaglio: { genere: 'carta' as const, casella: casella(0, 1) },
    danno: 4,
    moltiplicatore: 1,
  };

  test('chi colpisce si slancia verso l avversario', () => {
    const html = disegna(schermata({ tipo: 'attacco', colpi: [colpo], morti: [] }));
    const tag = tagCasella(html, 0, casella(0, 1));
    assert.match(tag, /\battacca\b/);
    assert.match(tag, /--verso: 1/, 'il mio schieramento colpisce verso l alto');
  });

  test('le carte del bot si slanciano nel verso opposto', () => {
    const suo = { ...colpo, giocatore: 1 as const };
    const html = disegna(schermata({ tipo: 'attacco', colpi: [suo], morti: [] }));
    assert.match(tagCasella(html, 1, casella(0, 1)), /--verso: -1/);
  });

  test('chi lo subisce lampeggia e mostra il danno', () => {
    const html = disegna(schermata({ tipo: 'attacco', colpi: [colpo], morti: [] }));
    assert.match(tagCasella(html, 1, casella(0, 1)), /\bimpatto\b/, 'il bersaglio e del difensore');
    assert.match(html, /class="danno[^"]*">-4</);
  });

  test('due colpi sulla stessa casella mostrano un numero solo, sommato', () => {
    const secondo = { ...colpo, da: casella(1, 1), danno: 3 };
    const html = disegna(schermata({ tipo: 'attacco', colpi: [colpo, secondo], morti: [] }));
    assert.match(html, />-7</);
    assert.equal((html.match(/class="danno/g) ?? []).length, 1);
  });

  test('il vantaggio elementale si vede: il numero diventa critico', () => {
    const forte = { ...colpo, danno: 6, moltiplicatore: 1.5 };
    const html = disegna(schermata({ tipo: 'attacco', colpi: [forte], morti: [] }));
    assert.match(html, /class="danno critico">-6</);
  });

  test('la carta morta resta a schermo come fantasma che si sfalda', () => {
    const morta = { giocatore: 1 as const, casella: casella(0, 2), carta: cartaFinta() };
    const html = disegna(schermata({ tipo: 'attacco', colpi: [], morti: [morta] }));
    assert.match(html, /class="carta muore/);
    assert.match(html, /Caduta/, 'si vede quale carta e caduta');
    assert.match(tagCasella(html, 1, casella(0, 2)), /\bimpatto\b/);
  });

  test('il colpo diretto scuote la testata del giocatore colpito', () => {
    const diretto = { ...colpo, bersaglio: { genere: 'giocatore' as const }, danno: 5 };
    const html = disegna(schermata({ tipo: 'attacco', colpi: [diretto], morti: [] }));
    assert.match(html, /class="testata[^"]*ferito/);
    assert.match(html, /class="danno critico">-5</);
    // La mia testata non deve scuotersi: il colpo l'ho tirato io.
    const testate = [...html.matchAll(/class="testata([^"]*)"/g)].map((m) => m[1]);
    assert.equal(testate.filter((c) => c.includes('ferito')).length, 1);
  });
});

describe('durate', () => {
  test('ogni tipo di animazione ha una durata dichiarata', () => {
    assert.deepEqual(Object.keys(DURATE).sort(), ['attacco', 'evocazione', 'spostamento']);
    for (const durata of Object.values(DURATE)) {
      assert.ok(durata > 0 && durata < 2000, `durata fuori scala: ${durata}`);
    }
  });
});
