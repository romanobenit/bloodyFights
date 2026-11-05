/**
 * Generatore pseudocasuale deterministico (mulberry32).
 * Il seme vive nello stato della partita, non in una variabile globale:
 * e' cosi' che il motore resta una funzione pura e una partita si puo'
 * rigiocare dalla sequenza delle azioni.
 */
export function prossimoCasuale(seme: number): { valore: number; seme: number } {
  let s = (seme + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const valore = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { valore, seme: s };
}

/** Intero in [0, limite). */
export function interoCasuale(seme: number, limite: number): { valore: number; seme: number } {
  const r = prossimoCasuale(seme);
  return { valore: Math.floor(r.valore * limite), seme: r.seme };
}

/** Fisher-Yates deterministico: non muta l'array ricevuto. */
export function mischia<T>(array: readonly T[], seme: number): { risultato: T[]; seme: number } {
  const risultato = [...array];
  let s = seme;
  for (let i = risultato.length - 1; i > 0; i--) {
    const r = interoCasuale(s, i + 1);
    s = r.seme;
    const j = r.valore;
    [risultato[i], risultato[j]] = [risultato[j], risultato[i]];
  }
  return { risultato, seme: s };
}
