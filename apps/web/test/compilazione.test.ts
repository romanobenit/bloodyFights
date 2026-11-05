import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compila, compilatoreDisponibile } from '../strumenti/compila.mjs';

/**
 * Prova la COMPILAZIONE, non il gioco.
 *
 * Nasce da un difetto vero: il compilatore cercava '/src/main.tsx', residuo
 * dello scaffolding React, mentre index.html diceva '/src/main.ts'. La
 * sostituzione non trovava niente e taceva, cosi' dist/index.html puntava a
 * un file inesistente: il browser prendeva un 404 e mostrava una pagina nera.
 * Tutti i test del gioco passavano lo stesso, perche' nessuno guardava cosa
 * esce dalla build.
 */
const QUI = dirname(fileURLToPath(import.meta.url));
const DIST = join(QUI, '../dist');

const esiste = async (percorso: string): Promise<boolean> => {
  try {
    await access(percorso);
    return true;
  } catch {
    return false;
  }
};

describe('build', { skip: !compilatoreDisponibile() ? 'serve Node 22.13 o superiore' : false }, () => {
  before(async () => {
    await compila();
  });

  test('index.html non punta piu a nessun sorgente', async () => {
    const html = await readFile(join(DIST, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /\/src\//, 'un riferimento a /src/ sopravvissuto = pagina vuota');
    assert.doesNotMatch(html, /\.tsx?["']/, 'il browser non sa eseguire TypeScript');
  });

  test('index.html carica lo script e lo stile compilati', async () => {
    const html = await readFile(join(DIST, 'index.html'), 'utf8');
    assert.match(html, /src="\.\/web\/main\.js"/);
    assert.match(html, /href="\.\/web\/stile\.css"/);
  });

  test('ogni file a cui index.html si riferisce esiste davvero', async () => {
    const html = await readFile(join(DIST, 'index.html'), 'utf8');
    const riferimenti = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(riferimenti.length >= 2);
    for (const riferimento of riferimenti) {
      assert.ok(await esiste(join(DIST, riferimento)), `manca il file ${riferimento}`);
    }
  });

  test('nessun modulo compilato importa ancora un .ts o un nome di pacchetto', async () => {
    const moduli = ['web/main.js', 'web/vista.js', 'motore/index.js', 'pixel/segnaposto.js', 'bot/bot.js'];
    for (const modulo of moduli) {
      const codice = await readFile(join(DIST, modulo), 'utf8');
      assert.doesNotMatch(codice, /from\s*['"][^'"]+\.ts['"]/, `${modulo} importa ancora un .ts`);
      assert.doesNotMatch(codice, /from\s*['"]@bloodyfights\//, `${modulo} importa un pacchetto per nome`);
    }
  });

  test('ogni import relativo dei moduli compilati punta a un file esistente', async () => {
    const moduli = ['web/main.js', 'web/vista.js', 'motore/index.js', 'motore/motore.js', 'pixel/index.js'];
    for (const modulo of moduli) {
      const codice = await readFile(join(DIST, modulo), 'utf8');
      for (const trovato of codice.matchAll(/from\s*['"](\.[^'"]+)['"]/g)) {
        const bersaglio = join(DIST, dirname(modulo), trovato[1]);
        assert.ok(await esiste(bersaglio), `${modulo} importa ${trovato[1]}, che non esiste`);
      }
    }
  });

  test('i tipi sono stati tolti dal codice compilato', async () => {
    const codice = await readFile(join(DIST, 'motore/motore.js'), 'utf8');
    assert.doesNotMatch(codice, /\binterface\s+\w+\s*\{/);
    assert.match(codice, /export function applicaAzione/, 'il codice eseguibile e rimasto');
  });
});
