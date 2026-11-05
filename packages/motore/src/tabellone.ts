import { CONFIG } from './config.ts';

const COLONNE = CONFIG.tabellone.colonne;

/** Indice piatto della casella: linea 0 = prima linea, linea 1 = seconda. */
export function casella(linea: number, colonna: number): number {
  return linea * COLONNE + colonna;
}

export function lineaDi(casella: number): number {
  return Math.floor(casella / COLONNE);
}

export function colonnaDi(casella: number): number {
  return casella % COLONNE;
}

export function casellaValida(c: number): boolean {
  return Number.isInteger(c) && c >= 0 && c < CONFIG.tabellone.caselle;
}

/**
 * Inversione a specchio del cap. 4.1: la colonna 0 di un giocatore sta
 * davanti alla colonna 3 dell'altro. Si usa SOLO nel disegno del tabellone
 * avversario, mai nella logica di combattimento, che lavora su colonne
 * gia' allineate.
 */
export function colonnaSpecchiata(colonna: number): number {
  return COLONNE - 1 - colonna;
}

export function casellaSpecchiata(c: number): number {
  return casella(lineaDi(c), colonnaSpecchiata(colonnaDi(c)));
}

export function tabelloneVuoto(): null[] {
  return new Array(CONFIG.tabellone.caselle).fill(null);
}
