import { DIMENSIONE_TELA } from './palette.ts';
import { telaVuota, type Tela } from './codifica.ts';

/**
 * MOTORE DI DISEGNO.
 *
 * Stessa disciplina del motore di gioco: funzioni pure. Ricevono una tela e ne
 * restituiscono una nuova, senza toccare quella ricevuta e senza sapere niente
 * di canvas, mouse o DOM. Il browser serve a mostrare il risultato e a dire
 * dove ha premuto il dito; il secchiello e la linea di Bresenham si provano
 * qui, in Node, con la stessa comodita' con cui si prova il ciclo elementale.
 */

const N = DIMENSIONE_TELA;

export type Strumento = 'matita' | 'gomma' | 'secchiello' | 'contagocce' | 'linea' | 'rettangolo';

export const STRUMENTI: { id: Strumento; nome: string; suggerimento: string }[] = [
  { id: 'matita', nome: 'Matita', suggerimento: 'Dipinge un pixel alla volta' },
  { id: 'gomma', nome: 'Gomma', suggerimento: 'Riporta al fondo' },
  { id: 'secchiello', nome: 'Secchiello', suggerimento: 'Riempie l area contigua dello stesso colore' },
  { id: 'contagocce', nome: 'Contagocce', suggerimento: 'Preleva il colore di un pixel' },
  { id: 'linea', nome: 'Linea', suggerimento: 'Trascina da un punto all altro' },
  { id: 'rettangolo', nome: 'Rettangolo', suggerimento: 'Trascina per il contorno' },
];

/** Indice della palette usato come fondo: la gomma riporta qui. */
export const FONDO = 0;

export interface Punto {
  x: number;
  y: number;
}

export function dentro(p: Punto): boolean {
  return p.x >= 0 && p.x < N && p.y >= 0 && p.y < N;
}

export function colorePixel(tela: Tela, p: Punto): number {
  return dentro(p) ? tela[p.y * N + p.x] : FONDO;
}

// --------------------------------------------------------------- strumenti

export function disegnaPixel(tela: Tela, p: Punto, colore: number): Tela {
  if (!dentro(p)) return tela;
  const nuova = Uint8Array.from(tela);
  nuova[p.y * N + p.x] = colore;
  return nuova;
}

/**
 * Linea di Bresenham: solo somme e confronti fra interi, nessuna divisione.
 * Su una griglia a 32 pixel conta: un'interpolazione con i numeri a virgola
 * mobile lascia buchi e scalini irregolari.
 */
export function disegnaLinea(tela: Tela, da: Punto, a: Punto, colore: number): Tela {
  // Estremi normalizzati prima di tracciare. Bresenham non e' simmetrico: sui
  // pareggi dell'errore sceglie il pixel in base al verso di percorrenza, e
  // la stessa linea tirata da destra a sinistra verrebbe diversa. In uno
  // strumento di disegno il verso del trascinamento non deve contare.
  const [inizio, fine] =
    da.x < a.x || (da.x === a.x && da.y <= a.y) ? [da, a] : [a, da];

  const nuova = Uint8Array.from(tela);
  let { x, y } = inizio;
  const dx = Math.abs(fine.x - inizio.x);
  const dy = -Math.abs(fine.y - inizio.y);
  const passoX = inizio.x < fine.x ? 1 : -1;
  const passoY = inizio.y < fine.y ? 1 : -1;
  let errore = dx + dy;

  for (;;) {
    if (dentro({ x, y })) nuova[y * N + x] = colore;
    if (x === fine.x && y === fine.y) break;
    const doppio = 2 * errore;
    if (doppio >= dy) {
      errore += dy;
      x += passoX;
    }
    if (doppio <= dx) {
      errore += dx;
      y += passoY;
    }
  }
  return nuova;
}

/** Contorno del rettangolo definito da due angoli opposti. */
export function disegnaRettangolo(tela: Tela, da: Punto, a: Punto, colore: number, pieno = false): Tela {
  const x0 = Math.min(da.x, a.x);
  const x1 = Math.max(da.x, a.x);
  const y0 = Math.min(da.y, a.y);
  const y1 = Math.max(da.y, a.y);

  const nuova = Uint8Array.from(tela);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const sulBordo = x === x0 || x === x1 || y === y0 || y === y1;
      if ((pieno || sulBordo) && dentro({ x, y })) nuova[y * N + x] = colore;
    }
  }
  return nuova;
}

/**
 * Secchiello: riempie l'area contigua dello stesso colore, a quattro vie.
 *
 * Iterativo con una pila esplicita invece che ricorsivo: su una tela tutta
 * dello stesso colore la ricorsione arriverebbe a 1024 chiamate annidate, e
 * un giorno, su una tela piu' grande, sfonderebbe lo stack.
 */
export function riempi(tela: Tela, partenza: Punto, colore: number): Tela {
  if (!dentro(partenza)) return tela;

  const daSostituire = colorePixel(tela, partenza);
  if (daSostituire === colore) return tela; // niente da fare

  const nuova = Uint8Array.from(tela);
  const pila: Punto[] = [partenza];

  while (pila.length > 0) {
    const p = pila.pop()!;
    if (!dentro(p)) continue;
    const indice = p.y * N + p.x;
    if (nuova[indice] !== daSostituire) continue;

    nuova[indice] = colore;
    pila.push({ x: p.x + 1, y: p.y });
    pila.push({ x: p.x - 1, y: p.y });
    pila.push({ x: p.x, y: p.y + 1 });
    pila.push({ x: p.x, y: p.y - 1 });
  }
  return nuova;
}

/** Specchia in orizzontale: le creature simmetriche si disegnano a meta'. */
export function specchiaOrizzontale(tela: Tela): Tela {
  const nuova = Uint8Array.from(tela);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N / 2; x++) {
      const sinistra = y * N + x;
      const destra = y * N + (N - 1 - x);
      const temporaneo = nuova[sinistra];
      nuova[sinistra] = nuova[destra];
      nuova[destra] = temporaneo;
    }
  }
  return nuova;
}

export function svuota(): Tela {
  return telaVuota(FONDO);
}

export function telaPiena(tela: Tela): boolean {
  return tela.some((indice) => indice !== FONDO);
}

// -------------------------------------------------------------- cronologia

/** Il documento chiede almeno 30 passi di annulla: qui ce ne stanno 40. */
export const PASSI_CRONOLOGIA = 40;

export interface Cronologia {
  passi: Tela[];
  /** Posizione corrente dentro `passi`. */
  indice: number;
}

export function cronologiaIniziale(tela: Tela = svuota()): Cronologia {
  return { passi: [Uint8Array.from(tela)], indice: 0 };
}

export function telaCorrente(c: Cronologia): Tela {
  return c.passi[c.indice];
}

/**
 * Registra un nuovo stato. Se si era tornati indietro, i passi successivi
 * vengono scartati: e' il comportamento che tutti si aspettano da annulla,
 * disegna qualcosa d'altro, e il futuro di prima non c'e' piu'.
 */
export function registra(c: Cronologia, tela: Tela): Cronologia {
  const passi = c.passi.slice(0, c.indice + 1);
  passi.push(Uint8Array.from(tela));

  if (passi.length > PASSI_CRONOLOGIA) passi.splice(0, passi.length - PASSI_CRONOLOGIA);

  return { passi, indice: passi.length - 1 };
}

export function puoAnnullare(c: Cronologia): boolean {
  return c.indice > 0;
}

export function puoRipetere(c: Cronologia): boolean {
  return c.indice < c.passi.length - 1;
}

export function annulla(c: Cronologia): Cronologia {
  return puoAnnullare(c) ? { ...c, indice: c.indice - 1 } : c;
}

export function ripeti(c: Cronologia): Cronologia {
  return puoRipetere(c) ? { ...c, indice: c.indice + 1 } : c;
}
