import { interoCasuale, type CartaCompleta } from '@bloodyfights/motore';
import { DIMENSIONE_TELA, INDICE_ELEMENTO } from './palette.ts';
import { codifica, telaVuota, type Tela } from './codifica.ts';

/**
 * SEGNAPOSTO, NON ARTE DEFINITIVA.
 *
 * Le 20 carte base non hanno illustrazione: e' l'unico contenuto delle
 * specifiche che richiede lavoro grafico manuale. Finche' non arriva, questo
 * generatore disegna una creatura deterministica partendo dall'id della
 * carta, con il tono del suo elemento e un segno diverso per tipo.
 *
 * Usa la stessa tela 32x32 e la stessa palette dell'editor, quindi quando
 * arrivera' il disegno vero basta sostituire la stringa base64 in una colonna
 * del database: nessun codice cambia.
 *
 * La luce viene da sinistra in alto, sempre: e' quello che tiene insieme venti
 * creature disegnate dallo stesso codice e le fa sembrare dello stesso mondo.
 */

const N = DIMENSIONE_TELA;
const FONDO = 0;
const CONTORNO = 7; // rosso bruno
const OMBRA = 14;
const LUCE = 15;
const OCCHIO = 5; // rosso vivo
const PUPILLA = 1; // grigio carbone: NON l'indice del fondo, o il contorno se la mangia
const LATTE = 8;

function punto(t: Tela, x: number, y: number, i: number): void {
  if (x < 0 || x >= N || y < 0 || y >= N) return;
  t[y * N + x] = i;
}

function leggi(t: Tela, x: number, y: number): number {
  if (x < 0 || x >= N || y < 0 || y >= N) return FONDO;
  return t[y * N + x];
}

/** Ellisse piena: la forma di base di ogni creatura. */
function ellisse(t: Tela, cx: number, cy: number, rx: number, ry: number, indice: number): void {
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.02) punto(t, x, y, indice);
    }
  }
}

function rettangolo(t: Tela, x0: number, y0: number, larghezza: number, altezza: number, indice: number): void {
  for (let y = y0; y < y0 + altezza; y++) {
    for (let x = x0; x < x0 + larghezza; x++) punto(t, x, y, indice);
  }
}

/** Semina il generatore dal testo dell'id: stesso id, stesso disegno. */
function semeDaTesto(testo: string): number {
  let h = 2166136261;
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Sposta il disegno in verticale finche' il suo ingombro e' al centro. */
function centraVerticalmente(t: Tela): void {
  let alto = N;
  let basso = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (t[y * N + x] !== FONDO) {
        if (y < alto) alto = y;
        if (y > basso) basso = y;
        break;
      }
    }
  }
  if (basso < 0) return;

  const margine = Math.floor((N - (basso - alto + 1)) / 2);
  const scarto = Math.max(1 - alto, Math.min(margine - alto, N - 2 - basso));
  if (scarto === 0) return;

  const copia = Uint8Array.from(t);
  t.fill(FONDO);
  for (let y = alto; y <= basso; y++) {
    const destinazione = y + scarto;
    if (destinazione < 0 || destinazione >= N) continue;
    for (let x = 0; x < N; x++) t[destinazione * N + x] = copia[y * N + x];
  }
}

export function generaSegnaposto(carta: CartaCompleta): Tela {
  const t = telaVuota(FONDO);
  const corpo = INDICE_ELEMENTO[carta.elemento];
  let seme = semeDaTesto(carta.id + carta.nome);

  const dado = (limite: number): number => {
    const r = interoCasuale(seme, limite);
    seme = r.seme;
    return r.valore;
  };

  const cx = 15.5;

  // --- proporzioni ---------------------------------------------------------
  // La stazza viene dalla VITA e l'ornamento dall'ATTACCO: un Colosso da 10
  // vita deve sembrare un colosso accanto a un Topo da 2, e due carte dello
  // stesso tipo e dello stesso elemento non possono piu' uscire identiche.
  const formaTesta = dado(3); // 0 tonda, 1 larga, 2 allungata
  const ryTesta = [4, 3, 5][formaTesta];
  const altezzaOrnamento = 2 + Math.round(carta.attacco / 4); // 2..5

  let ryCorpo = 4 + carta.vita * 0.3; // 4,3 .. 7
  let rxCorpo = 4 + carta.vita * 0.45; // 4,45 .. 8,5
  const rxTesta = Math.min(rxCorpo - 0.5, [3.5, 5, 3][formaTesta] + dado(2) * 0.5);

  // Impaginazione dall'alto, poi si restringe il corpo se sfonda il bordo
  // basso: la tela e' 32x32 e il contorno ha bisogno di una riga sua.
  const cyTesta = 3 + altezzaOrnamento + ryTesta;
  let cyCorpo = cyTesta + ryTesta + ryCorpo - 3;
  const sfondamento = cyCorpo + ryCorpo + 2 - 29;
  if (sfondamento > 0) {
    ryCorpo = Math.max(3.5, ryCorpo - sfondamento);
    cyCorpo = cyTesta + ryTesta + ryCorpo - 3;
  }

  // --- corpo, testa, zampe ------------------------------------------------
  ellisse(t, cx, cyCorpo, rxCorpo, ryCorpo, corpo);

  const yZampe = Math.min(N - 2, Math.round(cyCorpo + ryCorpo) - 1);
  const larghezzaZampa = 2 + dado(2);
  rettangolo(t, Math.round(cx - rxCorpo * 0.55), yZampe, larghezzaZampa, 2, OMBRA);
  rettangolo(t, Math.round(cx + rxCorpo * 0.55) - larghezzaZampa + 1, yZampe, larghezzaZampa, 2, OMBRA);

  ellisse(t, cx, cyTesta, rxTesta, ryTesta, corpo);

  // --- segno del tipo ------------------------------------------------------
  if (carta.tipo === 'mischia') {
    // Corna: due triangoli che salgono dai lati della testa.
    const altezza = altezzaOrnamento;
    for (let i = 0; i < altezza; i++) {
      const larghezza = altezza - i;
      const y = Math.round(cyTesta - ryTesta) - i;
      for (let d = 0; d < larghezza; d++) {
        punto(t, Math.round(cx - rxTesta + 1) - d + larghezza - 1, y, i === 0 ? corpo : LUCE);
        punto(t, Math.round(cx + rxTesta - 1) + d - larghezza + 1, y, i === 0 ? corpo : LUCE);
      }
    }
  } else if (carta.tipo === 'distanza') {
    // Arco teso: due archi concentrici e la corda, staccati dal corpo.
    const xArco = Math.round(cx + rxCorpo) + 2;
    const yArco = Math.round(cyCorpo) - 2;
    for (let i = -5; i <= 5; i++) {
      const rientro = Math.round((25 - i * i) / 9);
      punto(t, xArco - rientro, yArco + i, LUCE);
      if (Math.abs(i) < 5) punto(t, xArco - rientro + 1, yArco + i, OMBRA);
    }
    for (let i = -4; i <= 4; i++) punto(t, xArco + 1, yArco + i, LATTE);
  } else {
    // Aureola: un anello pieno sopra la testa. Pieno e non a tratti: a
    // 32x32 i tratti alternati, una volta contornati, diventano puntini.
    const yAureola = Math.round(cyTesta - ryTesta) - 2;
    const raggio = Math.round(rxTesta);
    for (let d = -raggio; d <= raggio; d++) punto(t, Math.round(cx) + d, yAureola, LATTE);
    punto(t, Math.round(cx) - raggio - 1, yAureola + 1, OMBRA);
    punto(t, Math.round(cx) + raggio + 1, yAureola + 1, OMBRA);
  }

  // --- motivo sul corpo ----------------------------------------------------
  const motivo = dado(4);
  if (motivo === 1) {
    // Petto piu' chiaro.
    ellisse(t, cx, cyCorpo + 1, rxCorpo * 0.5, ryCorpo * 0.55, LUCE);
  } else if (motivo === 2) {
    // Fasce orizzontali.
    for (let y = Math.round(cyCorpo - ryCorpo) + 2; y < cyCorpo + ryCorpo; y += 3) {
      for (let x = 0; x < N; x++) if (leggi(t, x, y) === corpo) punto(t, x, y, OMBRA);
    }
  } else if (motivo === 3) {
    // Macchie.
    for (let n = 0; n < 4; n++) {
      const x = Math.round(cx - rxCorpo + 2 + dado(Math.max(1, Math.round(rxCorpo * 2 - 3))));
      const y = Math.round(cyCorpo - ryCorpo + 2 + dado(Math.max(1, Math.round(ryCorpo * 2 - 3))));
      if (leggi(t, x, y) === corpo) {
        punto(t, x, y, OMBRA);
        if (leggi(t, x + 1, y) === corpo) punto(t, x + 1, y, OMBRA);
      }
    }
  }

  // --- luce da sinistra in alto, ombra dal lato opposto --------------------
  const prima = Uint8Array.from(t);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const qui = prima[y * N + x];
      if (qui !== corpo) continue;
      if (prima[(y - 1) * N + (x - 1)] === FONDO || leggi(prima, x - 1, y - 1) === FONDO)
        punto(t, x, y, LUCE);
      else if (leggi(prima, x + 1, y + 1) === FONDO) punto(t, x, y, OMBRA);
    }
  }

  // --- occhi: iride rossa con pupilla nera ---------------------------------
  const yOcchi = Math.round(cyTesta);
  const scarto = Math.max(1, Math.round(rxTesta) - 2);
  for (const segno of [-1, 1]) {
    const x = Math.round(cx) + segno * scarto - (segno < 0 ? 1 : 0);
    punto(t, x, yOcchi - 1, OCCHIO); // iride sopra
    punto(t, x, yOcchi, PUPILLA);    // pupilla sotto
  }

  // --- centratura verticale ------------------------------------------------
  // Disegnata dall'alto, la creatura siede alta sulla tela. Si centra alla
  // fine invece di impaginarla al pixel: cosi' venti sprite di stazza diversa
  // stanno tutti al centro della propria carta.
  centraVerticalmente(t);

  // --- contorno: ogni pixel di fondo che confina con la creatura -----------
  const dopo = Uint8Array.from(t);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (dopo[y * N + x] !== FONDO) continue;
      const confina =
        leggi(dopo, x - 1, y) !== FONDO ||
        leggi(dopo, x + 1, y) !== FONDO ||
        leggi(dopo, x, y - 1) !== FONDO ||
        leggi(dopo, x, y + 1) !== FONDO;
      if (confina) punto(t, x, y, CONTORNO);
    }
  }

  return t;
}

export function segnapostoBase64(carta: CartaCompleta): string {
  return codifica(generaSegnaposto(carta));
}

/** Mappa id della carta -> stringa base64, pronta da passare alla UI. */
export function segnapostiPerCarte(carte: readonly CartaCompleta[]): Record<string, string> {
  const mappa: Record<string, string> = {};
  for (const carta of carte) mappa[carta.id] = segnapostoBase64(carta);
  return mappa;
}
