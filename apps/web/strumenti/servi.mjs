/**
 * Server statico per il playtest in locale. Ricompila a ogni richiesta della
 * pagina, cosi' basta ricaricare il browser dopo una modifica: con quattro
 * cartelle di sorgenti non serve un watcher vero.
 */
import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compila, compilatoreDisponibile } from './compila.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const USCITA = resolve(QUI, '../dist');
const PORTA = Number(process.env.PORTA ?? 5173);
const ricompila = !process.argv.includes('--senza-watch');

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * Ricompila se Node lo permette; altrimenti serve la cartella dist cosi'
 * com'e'. Un server che muore perche' non sa ricompilare e' inutile quando
 * i file compilati sono gia' li': il gioco si puo' giocare lo stesso, solo
 * senza vedere le proprie modifiche.
 */
async function aggiorna(primoAvvio = false) {
  if (!compilatoreDisponibile()) {
    if (primoAvvio) {
      console.warn('');
      console.warn(`  Node ${process.version}: troppo vecchio per ricompilare (serve 22.13 o superiore).`);
      console.warn('  Servo la cartella dist gia compilata. Le modifiche ai sorgenti NON si vedranno');
      console.warn('  finche non aggiorni Node da https://nodejs.org');
      console.warn('');
    }
    return false;
  }
  try {
    await compila();
    return true;
  } catch (errore) {
    console.error('Errore di compilazione:', errore instanceof Error ? errore.message : errore);
    return false;
  }
}

const compilaInServizio = await aggiorna(true);

try {
  await access(join(USCITA, 'index.html'));
} catch {
  console.error('');
  console.error('  Non trovo apps/web/dist/index.html e non posso compilarlo.');
  console.error('  Aggiorna Node a 22.13 o superiore, poi riprova.');
  process.exit(1);
}

createServer(async (richiesta, risposta) => {
  let percorso = decodeURIComponent((richiesta.url ?? '/').split('?')[0]);
  if (percorso === '/') {
    if (ricompila && compilaInServizio) await aggiorna();
    percorso = '/index.html';
  }

  const dentro = join(USCITA, normalize(percorso).replace(/^(\.\.[/\\])+/, ''));
  if (!dentro.startsWith(USCITA)) {
    risposta.writeHead(403).end('Fuori dalla cartella servita');
    return;
  }

  try {
    const contenuto = await readFile(dentro);
    risposta.writeHead(200, { 'Content-Type': TIPI[extname(dentro)] ?? 'application/octet-stream' });
    risposta.end(contenuto);
  } catch {
    risposta.writeHead(404).end('Non trovato');
  }
}).listen(PORTA, () => {
  console.log(`BloodyFights in ascolto su http://localhost:${PORTA}`);
  console.log(
    compilaInServizio
      ? 'Ricarica la pagina dopo una modifica: ricompila da sola.'
      : 'Modalita sola lettura: servo i file gia compilati.',
  );
});
