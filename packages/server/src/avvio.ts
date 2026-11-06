/**
 * Avvio del server.
 *
 *   node --experimental-strip-types src/avvio.ts
 *
 * PORTA e ARCHIVIO si possono cambiare dall'ambiente. ORIGINI elenca i siti
 * ammessi a chiamare le rotte dal browser.
 */
import { archivioSuFile } from './archivio.ts';
import { creaServer } from './http.ts';
import { rotte } from './rotte.ts';

const PORTA = Number(process.env.PORTA ?? 4000);
const PERCORSO = process.env.ARCHIVIO ?? './dati/archivio.json';
const ORIGINI = (process.env.ORIGINI ?? 'http://localhost:5173').split(',').map((o) => o.trim());

const archivio = archivioSuFile(PERCORSO);

creaServer({ rotte: rotte(archivio), origini: ORIGINI }).listen(PORTA, () => {
  console.log(`Server BloodyFights in ascolto su http://localhost:${PORTA}`);
  console.log(`Archivio: ${PERCORSO}`);
  console.log(`Origini ammesse: ${ORIGINI.join(', ')}`);
});
