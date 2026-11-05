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
  css = await readFile(join(QUI, '../src/stile.css'), 'utf8');
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
