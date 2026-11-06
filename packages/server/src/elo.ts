/**
 * PUNTEGGIO E ACCOPPIAMENTO (cap. 7 del documento).
 *
 * Due funzioni pure, nessuno stato, nessun tempo preso dall'orologio: il
 * tempo si passa come argomento. Cosi' le regole del matchmaking si provano
 * senza aspettare davvero dieci secondi.
 */

/** Quanto sposta al massimo una partita. Alto = classifica nervosa. */
export const K = 32;
export const MMR_INIZIALE = 1000;
export const MMR_MINIMO = 100;

/** Tolleranza di partenza: si cercano avversari entro +/- 100 punti. */
export const TOLLERANZA_INIZIALE = 100;
/** Ogni 10 secondi di attesa la forbice si allarga di 50 punti. */
export const PASSO_TOLLERANZA = 50;
export const INTERVALLO_ALLARGAMENTO_MS = 10_000;
export const TOLLERANZA_MASSIMA = 1_000;

/**
 * Probabilita' attesa di vittoria secondo Elo: se i due hanno lo stesso
 * punteggio e' 0.5; 400 punti di vantaggio valgono circa il 91%.
 */
export function probabilitaAttesa(mio: number, suo: number): number {
  return 1 / (1 + 10 ** ((suo - mio) / 400));
}

/**
 * Il punteggio nuovo. Battere un favorito sposta molto, battere un
 * fanalino quasi niente: e' il senso dell'Elo.
 */
export function nuovoMmr(mio: number, suo: number, haVinto: boolean): number {
  const atteso = probabilitaAttesa(mio, suo);
  const grezzo = mio + K * ((haVinto ? 1 : 0) - atteso);
  return Math.max(MMR_MINIMO, Math.round(grezzo));
}

/** La forbice concessa a chi aspetta da `attesaMs`. */
export function tolleranza(attesaMs: number): number {
  const passi = Math.floor(Math.max(0, attesaMs) / INTERVALLO_ALLARGAMENTO_MS);
  return Math.min(TOLLERANZA_MASSIMA, TOLLERANZA_INIZIALE + passi * PASSO_TOLLERANZA);
}

export interface InAttesa {
  utenteId: string;
  mmr: number;
  /** Quando si e' messo in coda. */
  da: number;
}

export interface Accoppiamento {
  primo: InAttesa;
  secondo: InAttesa;
  differenza: number;
}

/**
 * Accoppia chi aspetta. Due persone si incontrano solo se la differenza di
 * punteggio sta nella tolleranza di TUTTE E DUE: a chi e' appena arrivato
 * non si rifila un avversario molto piu' forte solo perche' l'altro aspetta
 * da un minuto.
 *
 * Fra gli accoppiamenti possibili si prendono prima i piu' equilibrati, e
 * ognuno gioca una partita sola per giro.
 */
export function accoppia(coda: readonly InAttesa[], adesso: number): Accoppiamento[] {
  const possibili: Accoppiamento[] = [];

  for (let i = 0; i < coda.length; i++) {
    for (let j = i + 1; j < coda.length; j++) {
      const a = coda[i];
      const b = coda[j];
      const differenza = Math.abs(a.mmr - b.mmr);
      const limite = Math.min(tolleranza(adesso - a.da), tolleranza(adesso - b.da));
      if (differenza <= limite) possibili.push({ primo: a, secondo: b, differenza });
    }
  }

  // A pari differenza vince chi aspetta da piu' tempo: nessuno resta fuori
  // a lungo solo perche' ha un punteggio scomodo.
  possibili.sort((x, y) => {
    if (x.differenza !== y.differenza) return x.differenza - y.differenza;
    return Math.min(x.primo.da, x.secondo.da) - Math.min(y.primo.da, y.secondo.da);
  });

  const presi = new Set<string>();
  const esito: Accoppiamento[] = [];
  for (const c of possibili) {
    if (presi.has(c.primo.utenteId) || presi.has(c.secondo.utenteId)) continue;
    presi.add(c.primo.utenteId);
    presi.add(c.secondo.utenteId);
    esito.push(c);
  }
  return esito;
}
