import {
  CONFIG,
  casella,
  lineaDi,
  type Azione,
  type StatoPartitaConCatalogo,
} from '@bloodyfights/motore';

/**
 * BOT AVIDO. Serve a due cose insieme: l'avversario della partita in locale
 * della fase 1 e il motore del simulatore di playtest. Lo stesso file in
 * entrambi i posti, cosi' le misure del simulatore descrivono l'avversario
 * che il giocatore incontra davvero.
 *
 * Non e' intelligente: non guarda gli elementi, che sono meta' del gioco, e
 * non ragiona su cosa fara' l'avversario. Spende tutte le gocce che puo',
 * mette la mischia davanti e la distanza dietro, e fa curare i support solo
 * quando qualcuno e' ferito seriamente.
 */
export function mossaBot(s: StatoPartitaConCatalogo): Azione {
  const g = s.giocatori[s.turnoDi];

  if (s.fase === 'evocazione') {
    // La carta piu' cara giocabile: non lascia gocce ferme sul tavolo.
    const giocabili = g.mano
      .map((id, indiceMano) => ({ def: s.catalogo[id], indiceMano }))
      .filter((x) => x.def !== undefined && x.def.costo <= g.gocce)
      .sort((a, b) => b.def.costo - a.def.costo);

    for (const { def, indiceMano } of giocabili) {
      // La mischia in seconda linea non attacca: va davanti. La distanza
      // colpisce scavalcando, quindi sta meglio al riparo, dietro.
      const linee = def.tipo === 'mischia' ? [0, 1] : [1, 0];
      for (const linea of linee) {
        for (let colonna = 0; colonna < CONFIG.tabellone.colonne; colonna++) {
          const slot = casella(linea, colonna);
          if (g.tabellone[slot] === null) return { tipo: 'evoca', indiceMano, casella: slot };
        }
      }
    }
    return { tipo: 'passaFase' };
  }

  if (s.fase === 'riposizionamento' && !g.riposizionamentoUsato) {
    for (let da = 0; da < g.tabellone.length; da++) {
      const carta = g.tabellone[da];
      if (!carta || carta.tipo !== 'mischia' || lineaDi(da) !== 1) continue;
      for (let colonna = 0; colonna < CONFIG.tabellone.colonne; colonna++) {
        const davanti = casella(0, colonna);
        if (g.tabellone[davanti] === null) return { tipo: 'riposiziona', da, a: davanti };
      }
    }
    return { tipo: 'passaFase' };
  }

  if (s.fase === 'support') {
    for (let slot = 0; slot < g.tabellone.length; slot++) {
      const carta = g.tabellone[slot];
      if (!carta || carta.tipo !== 'support' || carta.fresca || carta.haAgito) continue;

      let peggiore = -1;
      let mancante = 0;
      for (let b = 0; b < g.tabellone.length; b++) {
        const bersaglio = g.tabellone[b];
        if (bersaglio && bersaglio.vitaMax - bersaglio.vita > mancante) {
          mancante = bersaglio.vitaMax - bersaglio.vita;
          peggiore = b;
        }
      }
      // Cura solo se c'e' un ferito grave: altrimenti la goccia vale di piu'.
      if (peggiore >= 0 && mancante >= SOGLIA_CURA)
        return { tipo: 'supportCura', casella: slot, bersaglio: peggiore };
      return { tipo: 'supportGoccia', casella: slot };
    }
    return { tipo: 'passaFase' };
  }

  return { tipo: 'passaFase' };
}

/** Punti di vita mancanti oltre i quali il bot preferisce curare. */
const SOGLIA_CURA = 3;

/**
 * Gioca il turno del bot fino alla fine, restituendo tutti gli stati
 * intermedi: la UI li mostra uno dopo l'altro per far vedere cosa fa.
 */
export function turnoBot(iniziale: StatoPartitaConCatalogo, applica: (s: StatoPartitaConCatalogo, a: Azione) => StatoPartitaConCatalogo): StatoPartitaConCatalogo[] {
  const passi: StatoPartitaConCatalogo[] = [];
  let s = iniziale;
  const giocatore = s.turnoDi;
  let guardia = 0;

  while (s.fase !== 'finita' && s.turnoDi === giocatore && guardia < 60) {
    s = applica(s, mossaBot(s));
    passi.push(s);
    guardia++;
  }
  return passi;
}
