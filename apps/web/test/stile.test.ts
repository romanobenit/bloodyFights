import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CONTROLLI SUL FOGLIO DI STILE.
 *
 * Nascono da un difetto vero: `#radice` dichiarava `display: flex` senza
 * direzione, cosi' la barra di navigazione finiva ACCANTO al tabellone invece
 * che sopra. Tutti i test passavano, perche' nessuno guardava il CSS.
 *
 * Non si puo' provare in Node che una pagina sia bella. Si puo' pero' provare
 * che rispetti le regole grafiche dichiarate nel cap. 2 delle specifiche, che
 * sono tutte verificabili leggendo il testo: niente angoli arrotondati,
 * ombre solide senza sfocatura, animazioni a scatti, e la tavolozza dichiarata.
 */
const QUI = dirname(fileURLToPath(import.meta.url));
let css = '';

before(async () => {
  const grezzo = await readFile(join(QUI, '../src/stile.css'), 'utf8');
  // I commenti vengono tolti: questi test leggono DICHIARAZIONI, non prosa.
  // Un commento che spiega perche' non si usa max-width conteneva la parola
  // "max-width", e faceva fallire il controllo che la cercava.
  css = grezzo.replace(/\/\*[\s\S]*?\*\//g, '');
});

/** Il corpo di una regola, dato il suo selettore. */
function regola(selettore: string): string {
  const trovata = css.match(new RegExp(`(^|\\n)\\s*${selettore.replace('#', '#')}\\s*\\{([^}]*)\\}`));
  assert.ok(trovata, `regola ${selettore} non trovata`);
  return trovata[2];
}

function dichiarazioni(proprieta: string): string[] {
  return [...css.matchAll(new RegExp(`${proprieta}\\s*:\\s*([^;}]+)`, 'g'))].map((m) => m[1].trim());
}

describe('impaginazione', () => {
  test('ogni contenitore flex dichiara la propria direzione', () => {
    // Senza direzione il browser impila in riga: e' il difetto che ha messo
    // il menu a fianco del campo invece che sopra.
    const corpo = regola('#radice');
    assert.match(corpo, /display:\s*flex/);
    assert.match(corpo, /flex-direction:\s*column/);
  });

  test('i figli della radice occupano la colonna e hanno un tetto di larghezza', () => {
    const corpo = regola('#radice > \\*:not\\(\\.esito\\)');
    assert.match(corpo, /width:\s*100%/);
    assert.match(corpo, /max-width:\s*1100px/);
  });

  test('la navigazione non si ricentra da sola: ci pensa la radice', () => {
    assert.doesNotMatch(regola('\\.navigazione'), /margin:\s*0 auto/);
  });
});

describe('regole grafiche del cap. 2', () => {
  test('nessun angolo arrotondato', () => {
    for (const valore of dichiarazioni('border-radius')) {
      assert.match(valore, /^0( !important)?$/, `border-radius non nullo: ${valore}`);
    }
  });

  test('le ombre sono blocchi solidi: raggio di sfocatura sempre zero', () => {
    for (const valore of dichiarazioni('box-shadow')) {
      if (valore === 'none' || valore.startsWith('var(')) continue;
      for (const strato of valore.split(/,(?![^(]*\))/)) {
        const lunghezze = strato.trim().replace('inset', '').trim().split(/\s+/);
        const sfocatura = lunghezze[2];
        assert.ok(
          sfocatura === undefined || /^0(px)?$/.test(sfocatura),
          `ombra sfocata in "${strato.trim()}"`,
        );
      }
    }
    assert.doesNotMatch(css, /filter:\s*blur/);
  });

  test('le animazioni sono a scatti, mai interpolate', () => {
    for (const valore of dichiarazioni('animation')) {
      assert.match(valore, /steps\(/, `animazione senza steps(): ${valore}`);
      assert.doesNotMatch(valore, /\bease|\blinear\b|cubic-bezier/, `animazione interpolata: ${valore}`);
    }
  });

  test('i fotogrammi stanno fra 1 e 8', () => {
    for (const passo of [...css.matchAll(/steps\((\d+)/g)].map((m) => Number(m[1]))) {
      assert.ok(passo >= 1 && passo <= 8, `steps(${passo}) fuori dall intervallo 1-8`);
    }
  });

  test('le immagini sono mostrate a pixel netti', () => {
    assert.match(css, /image-rendering:\s*pixelated/);
  });
});

describe('tavolozza', () => {
  /** Palette del cap. 2 piu' i neutri scuri usati per i fondi e i bordi. */
  const AMMESSI = new Set(
    [
      '#0a0a0a', '#151515', '#d81e2c', '#ff3b47', '#6e0d15', '#e9e5df', '#8e8882',
      '#f2efe4', '#6fa82a', '#2e6fa8', '#e8701a', '#2b2440', '#8e1220',
      '#1c1c1c', '#121212', '#2a2a2a', '#0d0d0d', '#111', '#1f1f1f', '#242424',
      '#170406', '#1d0407', '#3a3a3a',
    ].map((c) => c.toLowerCase()),
  );

  test('nessun colore fuori dalla tavolozza dichiarata', () => {
    const usati = new Set([...css.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0].toLowerCase()));
    const estranei = [...usati].filter((c) => !AMMESSI.has(c));
    assert.deepEqual(estranei, [], `colori non dichiarati: ${estranei.join(', ')}`);
  });

  test('i colori dell identita sono definiti una volta sola, come variabili', () => {
    for (const nome of ['--fondo', '--pannello', '--accento', '--accento-chiaro', '--accento-scuro', '--testo']) {
      assert.equal(
        (css.match(new RegExp(`${nome}:`, 'g')) ?? []).length,
        1,
        `${nome} definita piu di una volta`,
      );
    }
  });
});

describe('accessibilita', () => {
  test('chi ha chiesto meno movimento lo ottiene', () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('sovrapposizioni a schermo intero', () => {
  test('la schermata di fine partita copre tutta la finestra', () => {
    // Difetto vero: la regola della colonna imponeva max-width: 1100px a tutti
    // i figli della radice, compresa questa, che e' position: fixed. Su uno
    // schermo largo copriva circa meta pagina.
    const corpo = regola('\\.esito');
    assert.match(corpo, /position:\s*fixed/);
    assert.match(corpo, /inset:\s*0/);
    assert.match(corpo, /max-width:\s*none/, 'deve rinunciare al tetto di larghezza');
  });

  test('il tetto di larghezza della colonna esclude le sovrapposizioni', () => {
    assert.match(css, /#radice > \*:not\(\.esito\)/);
  });
});

describe('font', () => {
  test('ogni testo usa un font pixel: nessun sans-serif di sistema', () => {
    const famiglie = dichiarazioni('font-family');
    assert.ok(famiglie.length > 0);
    for (const valore of famiglie) {
      if (valore.startsWith('var(')) continue;
      assert.match(
        valore,
        /Press Start 2P|Silkscreen|monospace/,
        `font non pixel in uso: ${valore}`,
      );
      assert.doesNotMatch(valore, /system-ui|ui-sans-serif|Segoe UI|sans-serif/, valore);
    }
  });

  test('le due variabili puntano a font pixel diversi, per usi diversi', () => {
    const radice = regola(':root');
    assert.match(radice, /--pixel:\s*'Press Start 2P'/);
    assert.match(radice, /--prosa:\s*'Silkscreen'/);
  });

  test('i pixel delle lettere non vengono arrotondati', () => {
    assert.match(css, /-webkit-font-smoothing:\s*none/);
  });

  test('i testi lunghi hanno interlinea e righe corte', () => {
    const prosa = regola('\\.prosa');
    assert.match(prosa, /line-height:\s*2(\.\d+)?/, 'un font pixel ha bisogno di respiro');
    const paragrafo = regola('\\.prosa p');
    assert.match(paragrafo, /max-width:\s*5\dch/, 'righe piu corte del solito');
  });
});

describe('schermi stretti', () => {
  test('ci sono soglie per telefono', () => {
    assert.match(css, /@media \(max-width: 700px\)/);
    assert.match(css, /@media \(max-width: 480px\)/);
  });

  test('la tela resta a multipli INTERI di 32 a ogni soglia', () => {
    // E' la regola che tiene in piedi tutto lo stile: a 3,5x i pixel si
    // sfocano. Nessuna scala puo essere frazionaria.
    const scale = [...css.matchAll(/--scala:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    assert.ok(scale.length >= 3, `trovate solo ${scale.length} scale`);
    for (const scala of scale) {
      assert.ok(Number.isInteger(scala), `scala frazionaria: ${scala}`);
      assert.ok(scala >= 6 && scala <= 16, `scala fuori scala: ${scala}`);
    }
  });

  test('la tela non viene mai dimensionata in percentuale', () => {
    const tela = regola('\\.tela');
    assert.match(tela, /width:\s*calc\(32px \* var\(--scala\)\)/);
    // Il confine iniziale serve: "max-width" contiene "width".
    assert.doesNotMatch(tela, /(^|[\s;{])width:\s*\d+%/);
    assert.doesNotMatch(tela, /max-width/, 'un tetto in percentuale romperebbe la scala intera');
  });

  test('il tabellone sta in 360px: quattro colonne piu i vuoti', () => {
    const stretto = css.slice(css.indexOf('@media (max-width: 480px)'));
    const larghezza = Number(stretto.match(/--slot-larghezza:\s*(\d+)px/)?.[1]);
    assert.ok(larghezza > 0, 'la soglia stretta ridefinisce la larghezza');
    // 4 caselle + 3 spazi + i margini della pagina e del pannello.
    assert.ok(4 * larghezza + 3 * 5 + 36 <= 360, `servirebbero ${4 * larghezza + 51}px`);
  });

  test('le proporzioni della carta restano quelle delle carte da gioco', () => {
    for (const blocco of css.split('@media').slice(0)) {
      const l = Number(blocco.match(/--slot-larghezza:\s*(\d+)px/)?.[1]);
      const a = Number(blocco.match(/--slot-altezza:\s*(\d+)px/)?.[1]);
      if (!l || !a) continue;
      const rapporto = l / a;
      assert.ok(Math.abs(rapporto - 0.714) < 0.03, `rapporto ${rapporto.toFixed(3)} su ${l}x${a}`);
    }
  });

  test('niente scorre in orizzontale per caso: solo menu e mano, apposta', () => {
    const scorrimenti = [...css.matchAll(/overflow-x:\s*auto/g)];
    assert.ok(scorrimenti.length >= 2 && scorrimenti.length <= 4, 'scorrimenti orizzontali inattesi');
  });

  test('i bersagli da toccare sono abbastanza grandi', () => {
    const stretto = css.slice(css.indexOf('@media (max-width: 480px)'));
    assert.match(stretto, /min-height:\s*3[0-9]px/, 'un dito non ha la precisione del puntatore');
  });
});
