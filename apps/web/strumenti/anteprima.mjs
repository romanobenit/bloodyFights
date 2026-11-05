/**
 * ANTEPRIMA STATICA.
 *
 * Costruisce una pagina HTML sola, senza JavaScript, con il CSS incorporato e
 * gli sprite come SVG inline: si apre con un doppio clic, anche da file://,
 * dove i moduli ES non si caricano. Serve a guardare l'aspetto del tabellone
 * senza avviare un server, e come riferimento visivo da confrontare dopo una
 * modifica allo stile.
 *
 *   node strumenti/anteprima.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CARTE_BASE, applicaAzione, creaPartita, mazzoBaseCompleto } from '@bloodyfights/motore';
import { mossaBot } from '@bloodyfights/bot';
import { DIMENSIONE_TELA, PALETTE, decodifica, segnapostoBase64 } from '@bloodyfights/pixel';

const QUI = dirname(fileURLToPath(import.meta.url));
const APP = resolve(QUI, '..');
const { disegna } = await import(resolve(APP, 'src/vista.ts'));

/**
 * Sprite come SVG invece che PNG: in Node non c'e' un canvas, e un rettangolo
 * per ogni tratto di pixel contigui dello stesso colore resta piccolo.
 * shape-rendering crispEdges tiene i bordi netti come image-rendering pixelated.
 */
function svgDaTela(tela) {
  const rettangoli = [];
  for (let y = 0; y < DIMENSIONE_TELA; y++) {
    let x = 0;
    while (x < DIMENSIONE_TELA) {
      const indice = tela[y * DIMENSIONE_TELA + x];
      let fine = x;
      while (fine < DIMENSIONE_TELA && tela[y * DIMENSIONE_TELA + fine] === indice) fine++;
      if (indice !== 0) {
        rettangoli.push(
          `<rect x="${x}" y="${y}" width="${fine - x}" height="1" fill="${PALETTE[indice]}"/>`,
        );
      }
      x = fine;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DIMENSIONE_TELA} ${DIMENSIONE_TELA}" shape-rendering="crispEdges">${rettangoli.join('')}</svg>`;
}

const cache = new Map();
function urlSprite(cartaId) {
  if (cache.has(cartaId)) return cache.get(cartaId);
  const carta = CARTE_BASE.find((c) => c.id === cartaId);
  if (!carta) return '';
  const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgDaTela(decodifica(segnapostoBase64(carta))));
  cache.set(cartaId, url);
  return url;
}

// Una partita portata avanti dai bot fino ad avere tabelloni popolati: una
// schermata vuota non dice niente su come si legge il gioco.
let stato = creaPartita({
  idGiocatori: ['Tu', 'Bot'],
  mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()],
  carte: CARTE_BASE,
  seme: 20261105,
  primoGiocatore: 0,
});

const TURNO_DA_MOSTRARE = 11;
while (stato.turno < TURNO_DA_MOSTRARE && stato.fase !== 'finita') {
  stato = applicaAzione(stato, mossaBot(stato));
}
// Si ferma all'inizio del mio turno, in fase di evocazione, con una carta
// della mano scelta: e' lo stato in cui il giocatore vede le caselle accese.
while (stato.turnoDi !== 0 && stato.fase !== 'finita') {
  stato = applicaAzione(stato, mossaBot(stato));
}

const schermata = {
  stato,
  io: 0,
  selezione: { tipo: 'mano', indice: 0 },
  messaggio: 'Fase 1: scegli una carta dalla mano, poi la casella dove schierarla.',
  turnoDelBot: false,
  colpite: new Set([`1-${0}`]),
  dettaglio: stato.giocatori[0].tabellone.find((c) => c !== null) ?? null,
  urlSprite,
};

const stile = await readFile(resolve(APP, 'src/stile.css'), 'utf8');
const pagina = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>BloodyFights - anteprima del tabellone</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Silkscreen:wght@400;700&display=swap" rel="stylesheet" />
<style>${stile}</style>
</head>
<body><div id="radice">${disegna(schermata)}</div></body>
</html>`;

await mkdir(resolve(APP, 'dist'), { recursive: true });
await writeFile(resolve(APP, 'dist/anteprima.html'), pagina);
console.log(`Anteprima scritta: apps/web/dist/anteprima.html (turno ${stato.turno}, fase ${stato.fase})`);
