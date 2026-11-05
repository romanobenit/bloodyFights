/**
 * COMPILATORE MINIMO, ZERO DIPENDENZE.
 *
 * Lo stack delle specifiche (React + Vite + Tailwind) non e' installabile su
 * questa macchina: il registry npm risponde 403. Invece di fermarsi, questo
 * script fa l'unica cosa che serve davvero per avere il tabellone in un
 * browser: toglie i tipi dal TypeScript e riscrive gli import.
 *
 * Non e' un bundler e non vuole esserlo. I browser caricano i moduli ES da
 * soli: un bundler serve a ridurre il numero di richieste, non a far
 * funzionare il codice. Per un playtest in locale la differenza non si vede.
 *
 * Lo spoglia-tipi e' quello integrato in Node (node:module), lo stesso che
 * esegue i .ts dei test: nessun pacchetto da scaricare.
 */
import * as moduloNode from 'node:module';

/**
 * Import come namespace e non come { stripTypeScriptTypes }: la seconda forma
 * fa fallire il file in fase di collegamento, prima che una riga venga
 * eseguita, con un SyntaxError che non dice cosa fare. Cosi' invece si puo'
 * controllare e spiegare.
 */
const spogliaTipi = moduloNode.stripTypeScriptTypes;

export const VERSIONE_RICHIESTA = '22.13.0';

export function compilatoreDisponibile() {
  // Interruttore di prova: permette di verificare il comportamento su un Node
  // vecchio senza doverne installare uno.
  if (process.env.BF_SIMULA_NODE_VECCHIO === '1') return false;
  return typeof spogliaTipi === 'function';
}

export class NodeTroppoVecchio extends Error {
  constructor() {
    super(
      `Per compilare serve Node ${VERSIONE_RICHIESTA} o superiore (hai ${process.version}): ` +
        "l'API che toglie i tipi dal TypeScript e' arrivata in quella versione. " +
        'Aggiorna Node da https://nodejs.org, oppure usa la cartella dist gia compilata.',
    );
    this.name = 'NodeTroppoVecchio';
  }
}
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const APP = resolve(QUI, '..');
const RADICE = resolve(APP, '../..');
const USCITA = join(APP, 'dist');

/** Dove finisce ogni sorgente dentro dist/, e come si chiamano i pacchetti. */
const SORGENTI = [
  { da: join(APP, 'src'), a: join(USCITA, 'web') },
  { da: join(RADICE, 'packages/motore/src'), a: join(USCITA, 'motore') },
  { da: join(RADICE, 'packages/pixel/src'), a: join(USCITA, 'pixel') },
  { da: join(RADICE, 'packages/bot/src'), a: join(USCITA, 'bot') },
];

const PACCHETTI = {
  '@bloodyfights/motore': 'motore/index.js',
  '@bloodyfights/pixel': 'pixel/index.js',
  '@bloodyfights/bot': 'bot/index.js',
};

async function* fileTypeScript(cartella) {
  for (const voce of await readdir(cartella, { withFileTypes: true })) {
    const percorso = join(cartella, voce.name);
    if (voce.isDirectory()) yield* fileTypeScript(percorso);
    else if (extname(voce.name) === '.ts') yield percorso;
  }
}

/**
 * Riscrive gli specificatori: './x.ts' diventa './x.js' e il nome di un
 * pacchetto diventa il percorso relativo del suo file compilato. I browser
 * non hanno la risoluzione dei moduli di Node: gli serve un percorso vero.
 */
function riscriviImport(codice, cartellaUscita) {
  return codice.replace(/(from\s*|import\s*)(['"])([^'"]+)\2/g, (intero, prefisso, apice, specificatore) => {
    let nuovo = specificatore;

    if (specificatore in PACCHETTI) {
      const assoluto = join(USCITA, PACCHETTI[specificatore]);
      nuovo = relative(cartellaUscita, assoluto).replaceAll('\\', '/');
      if (!nuovo.startsWith('.')) nuovo = './' + nuovo;
    } else if (specificatore.endsWith('.ts')) {
      nuovo = specificatore.slice(0, -3) + '.js';
    }

    return `${prefisso}${apice}${nuovo}${apice}`;
  });
}

/**
 * Copia sovrascrivendo invece di sostituire il file. `cp` cancella il file di
 * destinazione prima di riscriverlo, e in una cartella condivisa col sistema
 * del disco dell'utente la cancellazione puo' essere negata: una scrittura
 * sopra il file esistente funziona sempre.
 */
async function copia(da, a) {
  await mkdir(dirname(a), { recursive: true });
  await writeFile(a, await readFile(da));
}

async function copiaCartella(da, a) {
  let voci;
  try {
    voci = await readdir(da, { withFileTypes: true });
  } catch {
    return;
  }
  for (const voce of voci) {
    const sorgente = join(da, voce.name);
    const destinazione = join(a, voce.name);
    if (voce.isDirectory()) await copiaCartella(sorgente, destinazione);
    else await copia(sorgente, destinazione);
  }
}

export async function compila() {
  if (!compilatoreDisponibile()) throw new NodeTroppoVecchio();

  let contati = 0;

  for (const { da, a } of SORGENTI) {
    for await (const percorso of fileTypeScript(da)) {
      const codice = await readFile(percorso, 'utf8');
      const senzaTipi = spogliaTipi(codice, { mode: 'strip' });
      const destinazione = join(a, relative(da, percorso)).replace(/\.ts$/, '.js');
      await mkdir(dirname(destinazione), { recursive: true });
      await writeFile(destinazione, riscriviImport(senzaTipi, dirname(destinazione)));
      contati++;
    }
  }

  // index.html e il foglio di stile non passano dallo spoglia-tipi: qui si
  // riscrivono solo i riferimenti a /src/ verso i file compilati.
  //
  // Una regola sola invece di due sostituzioni letterali: con quelle, un
  // nome che non combacia non solleva niente, scrive un index.html che
  // punta a un file inesistente e il browser mostra una pagina vuota. Il
  // controllo in fondo e' li' per quello: meglio una build che fallisce di
  // una pagina nera.
  const html = (await readFile(join(APP, 'index.html'), 'utf8')).replace(
    /(["'])\/src\/([^"']+)\1/g,
    (_, apice, file) => `${apice}./web/${file.replace(/\.tsx?$/, '.js')}${apice}`,
  );

  if (html.includes('/src/')) {
    throw new Error(
      "index.html contiene ancora un riferimento a /src/ dopo la riscrittura: " +
        'il file compilato non esisterebbe e la pagina resterebbe vuota.',
    );
  }

  await writeFile(join(USCITA, 'index.html'), html);
  await copia(join(APP, 'src/stile.css'), join(USCITA, 'web/stile.css'));
  await copiaCartella(join(APP, 'public'), USCITA);

  return contati;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const quanti = await compila();
    console.log(`Compilati ${quanti} moduli in apps/web/dist`);
  } catch (errore) {
    console.error(errore instanceof NodeTroppoVecchio ? errore.message : errore);
    process.exitCode = 1;
  }
}
