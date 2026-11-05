/**
 * Simulatore di playtest: fa giocare due bot elementari e misura la durata
 * delle partite. Serve a verificare numericamente le domande aperte del
 * cap. 12 prima di avere un'interfaccia.
 *
 *   node --experimental-strip-types scripts/simula.ts 500
 */
import { CARTE_BASE, mazzoBaseCompleto } from '../src/carte-base.ts';
import { applicaAzione, creaPartita, type StatoPartitaConCatalogo } from '../src/motore.ts';
import type { IndiceGiocatore } from '../src/types.ts';
import { mossaBot } from '@bloodyfights/bot';

const partite = Number(process.argv[2] ?? 200);
const LIMITE_TURNI = 300;

const durate: number[] = [];
const vittoriePrimo = { si: 0, no: 0 };
let stalli = 0;
let turniConDannoDiretto = 0;
let turniTotali = 0;

for (let n = 0; n < partite; n++) {
  let s = creaPartita({
    idGiocatori: ['bot-A', 'bot-B'],
    mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()],
    carte: CARTE_BASE,
    seme: n * 7919 + 13,
    primoGiocatore: (n % 2) as IndiceGiocatore,
  });

  while (s.fase !== 'finita' && s.turno < LIMITE_TURNI) {
    s = applicaAzione(s, mossaBot(s));
  }

  if (s.fase !== 'finita') {
    stalli++;
    continue;
  }
  durate.push(s.turno);
  if (s.vincitore === s.primoGiocatore) vittoriePrimo.si++;
  else vittoriePrimo.no++;

  turniTotali += s.turno;
  turniConDannoDiretto += s.log.filter(
    (v) => v.tipo === 'colpo' && v.bersaglio.genere === 'giocatore',
  ).length;
}

durate.sort((a, b) => a - b);
const media = durate.reduce((a, b) => a + b, 0) / durate.length;
const mediana = durate[Math.floor(durate.length / 2)];

console.log(`Partite simulate: ${partite} (stalli oltre ${LIMITE_TURNI} turni: ${stalli})`);
console.log(`Durata in turni  -> media ${media.toFixed(1)}  mediana ${mediana}  min ${durate[0]}  max ${durate[durate.length - 1]}`);
console.log(`Turni di gioco per giocatore -> ~${(media / 2).toFixed(1)}`);
console.log(`Vittorie di chi inizia: ${((vittoriePrimo.si / durate.length) * 100).toFixed(1)}%`);
console.log(`Colpi diretti al giocatore per partita: ${(turniConDannoDiretto / durate.length).toFixed(1)}`);
