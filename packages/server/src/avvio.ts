/**
 * Avvio del server.
 *
 *   node --experimental-strip-types src/avvio.ts
 *
 * PORTA e ARCHIVIO si possono cambiare dall'ambiente. ORIGINI elenca i siti
 * ammessi a chiamare le rotte dal browser.
 */
import { CARTE_BASE } from '@bloodyfights/motore';
import { archivioSuFile } from './archivio.ts';
import { creaArena } from './arena.ts';
import { creaServer } from './http.ts';
import { rotte } from './rotte.ts';
import { rotteOnline } from './rotte-online.ts';

const PORTA = Number(process.env.PORTA ?? 4000);
const PERCORSO = process.env.ARCHIVIO ?? './dati/archivio.json';
const ORIGINI = (process.env.ORIGINI ?? 'http://localhost:5173').split(',').map((o) => o.trim());
/** Ogni quanto l'arena guarda l'orologio: accoppiamenti, turni, abbandoni. */
const BATTITO_MS = 1_000;

const archivio = archivioSuFile(PERCORSO);
const arena = creaArena({ archivio, carte: CARTE_BASE });

// Un solo battito per tutto il server. Le partite non hanno timer propri:
// cosi' il comportamento nel tempo si prova chiamando passaIlTempo a mano.
const battito = setInterval(() => {
  const adesso = Date.now();
  arena.passaIlTempo(adesso);
  arena.pulisci(adesso);
}, BATTITO_MS);

const server = creaServer({
  rotte: [...rotte(archivio), ...rotteOnline({ archivio, arena })],
  origini: ORIGINI,
});

server.listen(PORTA, () => {
  console.log(`Server BloodyFights in ascolto su http://localhost:${PORTA}`);
  console.log(`Archivio: ${PERCORSO}`);
  console.log(`Origini ammesse: ${ORIGINI.join(', ')}`);
  console.log(`Battito dell'arena: ogni ${BATTITO_MS} ms`);
});

for (const segnale of ['SIGINT', 'SIGTERM'] as const) {
  process.on(segnale, () => {
    console.log('\nChiusura: aspetto che i punteggi siano scritti...');
    clearInterval(battito);
    server.close();
    // I punteggi si scrivono dopo la fine della partita: spegnere senza
    // aspettarli vorrebbe dire perderli.
    void arena.attendiScritture().then(() => process.exit(0));
  });
}
