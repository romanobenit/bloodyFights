import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CONTROLLI SUGLI SCRIPT DI AVVIO.
 *
 * Nasce da un difetto vero: `npm run server` moriva con
 * ERR_UNKNOWN_FILE_EXTENSION su Node 22.12. Da Node 22.18 i file .ts si
 * eseguono senza flag, prima no - e la macchina su cui il progetto e' stato
 * scritto era piu' recente di quella su cui gira. Gli script dei test
 * avevano il flag, quelli di avvio no, e nessuno guardava.
 *
 * La regola e' semplice: ogni script che lancia node porta il flag. Metterlo
 * dove non serve non costa niente; dimenticarlo dove serve rompe il comando.
 */
const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = join(QUI, '../../..');
const FLAG = '--experimental-strip-types';

let script: { file: string; nome: string; comando: string }[] = [];

before(async () => {
  const cartelle = [RADICE];
  for (const gruppo of ['packages', 'apps']) {
    for (const voce of await readdir(join(RADICE, gruppo), { withFileTypes: true })) {
      if (voce.isDirectory()) cartelle.push(join(RADICE, gruppo, voce.name));
    }
  }

  for (const cartella of cartelle) {
    const percorso = join(cartella, 'package.json');
    const contenuto = JSON.parse(await readFile(percorso, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    for (const [nome, comando] of Object.entries(contenuto.scripts ?? {})) {
      script.push({ file: relative(RADICE, percorso), nome, comando });
    }
  }
});

describe('script dei pacchetti', () => {
  test('ce n e almeno uno per pacchetto: il controllo non gira a vuoto', () => {
    assert.ok(script.length >= 10, `trovati solo ${script.length} script`);
  });

  test('ogni script che lancia node porta il flag per i tipi', () => {
    for (const s of script.filter((x) => x.comando.startsWith('node '))) {
      assert.ok(
        s.comando.includes(FLAG),
        `${s.file} -> "${s.nome}" lancia node senza ${FLAG}: fallira su Node precedente alla 22.18`,
      );
    }
  });

  test('nessuno script chiama direttamente un .ts senza passare da node', () => {
    for (const s of script) {
      if (s.comando.includes('.ts') && !s.comando.startsWith('node ') && !s.comando.startsWith('npm ')) {
        assert.fail(`${s.file} -> "${s.nome}" esegue un .ts fuori da node: ${s.comando}`);
      }
    }
  });

  test('gli script che avviano qualcosa esistono tutti', () => {
    const attesi = ['test', 'build', 'dev', 'server', 'simula', 'anteprima'];
    const radice = script.filter((s) => s.file === 'package.json').map((s) => s.nome);
    for (const nome of attesi) assert.ok(radice.includes(nome), `manca lo script "${nome}"`);
  });
});
