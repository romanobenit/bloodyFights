import { CONFIG } from './config.ts';
import type { DefinizioneCarta, Rarita, StatisticheDerivate, TipoCarta, Elemento } from './types.ts';

export interface EsitoValidazione {
  valida: boolean;
  errori: string[];
}

/** Statistiche grezze su cui si calcola la potenza: basta questo, non la carta intera. */
export interface StatistichePerCosto {
  vita: number;
  attacco: number;
  tipo: TipoCarta;
  elemento: Elemento;
}

/**
 * P = Vita + (Attacco x fattore_tipo) + bonus_elemento + bonus_support  (cap. 5.2)
 *
 * Il risultato puo' essere frazionario (una carta a distanza con attacco 3
 * vale 4,5 punti di attacco): le fasce di costo lo gestiscono, non si
 * arrotonda qui perche' arrotondare due volte sposta le carte di fascia.
 */
export function calcolaPotenza(s: StatistichePerCosto): number {
  const pesoAttacco = CONFIG.costo.pesoAttacco[s.tipo];
  const bonusElemento = CONFIG.costo.bonusElemento[s.elemento];
  const bonusSupport = s.tipo === 'support' ? CONFIG.costo.bonusSupport : 0;

  const potenza =
    s.vita * CONFIG.costo.pesoVita + s.attacco * pesoAttacco + bonusElemento + bonusSupport;

  // Normalizza gli errori di virgola mobile (0,5 + 0,5 + ... = 1,0000000000001).
  return Math.round(potenza * 100) / 100;
}

/** Fascia di costo in cui cade la potenza. Oltre il tetto non esiste costo. */
export function calcolaCosto(potenza: number): number {
  for (const fascia of CONFIG.costo.fasce) {
    if (potenza <= fascia.potenzaMax) return fascia.costo;
  }
  throw new Error(
    `Potenza ${potenza} oltre il tetto di ${CONFIG.carte.potenzaMax}: la carta non e' valida`,
  );
}

export function calcolaRarita(potenza: number): Rarita {
  for (const scaglione of CONFIG.rarita) {
    if (potenza <= scaglione.potenzaMax) return scaglione.rarita as Rarita;
  }
  throw new Error(`Potenza ${potenza} oltre il tetto: nessuna rarita' applicabile`);
}

export function statisticheDerivate(s: StatistichePerCosto): StatisticheDerivate {
  const potenza = calcolaPotenza(s);
  return { potenza, costo: calcolaCosto(potenza), rarita: calcolaRarita(potenza) };
}

/**
 * Validazione completa di una carta proposta da un utente.
 * Questa funzione gira sul SERVER: la barra di potenza nel browser serve
 * all'utente, non alla sicurezza (cap. 7.2). Il client propone, il server decide.
 */
export function validaCarta(
  s: StatistichePerCosto & { nome?: string },
): EsitoValidazione {
  const errori: string[] = [];
  const c = CONFIG.carte;

  if (s.nome !== undefined) {
    const nome = s.nome.trim();
    if (nome.length === 0) errori.push('Il nome non puo essere vuoto');
    if (nome.length > c.nomeMaxCaratteri)
      errori.push(`Il nome supera i ${c.nomeMaxCaratteri} caratteri`);
  }

  if (!Number.isInteger(s.vita)) errori.push('La vita deve essere un numero intero');
  if (!Number.isInteger(s.attacco)) errori.push('L attacco deve essere un numero intero');

  if (s.vita < c.vitaMin || s.vita > c.vitaMax)
    errori.push(`La vita deve stare fra ${c.vitaMin} e ${c.vitaMax}`);

  // Le carte latte si fermano a 5 punti vita.
  if (s.elemento === 'latte' && s.vita > c.vitaMaxLatte)
    errori.push(`Le carte di elemento latte non superano ${c.vitaMaxLatte} punti vita`);

  if (s.attacco < c.attaccoMin || s.attacco > c.attaccoMax)
    errori.push(`L attacco deve stare fra ${c.attaccoMin} e ${c.attaccoMax}`);

  const potenza = calcolaPotenza(s);
  if (potenza > c.potenzaMax)
    errori.push(`Potenza ${potenza} oltre il tetto di ${c.potenzaMax}: abbassa una statistica`);

  return { valida: errori.length === 0, errori };
}


/** Una voce del conto della potenza, per il riquadro che lo spiega. */
export interface VocePotenza {
  etichetta: string;
  valore: number;
  /** Come si e' ottenuto, in parole: "6 x 1,5" invece del solo 9. */
  dettaglio?: string;
}

/**
 * Da dove viene P, voce per voce.
 *
 * Serve al riquadro dell'editor: l'utente non deve solo vedere che la sua
 * carta costa 4, deve capire perche'. Chi capisce il sistema impara a
 * progettare dentro il tetto invece di sbattere contro il rifiuto.
 */
export function scomposizionePotenza(s: StatistichePerCosto): {
  voci: VocePotenza[];
  totale: number;
} {
  const voci: VocePotenza[] = [{ etichetta: 'Vita', valore: s.vita }];

  const peso = CONFIG.costo.pesoAttacco[s.tipo];
  voci.push({
    etichetta: s.tipo === 'support' ? 'Cura' : 'Attacco',
    valore: Math.round(s.attacco * peso * 100) / 100,
    dettaglio: peso === 1 ? undefined : `${s.attacco} x ${String(peso).replace('.', ',')}`,
  });

  const bonusElemento = CONFIG.costo.bonusElemento[s.elemento];
  if (bonusElemento !== 0) {
    voci.push({ etichetta: `Elemento ${s.elemento}`, valore: bonusElemento });
  }

  if (s.tipo === 'support') {
    voci.push({
      etichetta: 'Bonus support',
      valore: CONFIG.costo.bonusSupport,
      dettaglio: 'genera risorse',
    });
  }

  return { voci, totale: calcolaPotenza(s) };
}

/** Arricchisce una definizione con potenza, costo e rarita' calcolati. */
export function completaCarta(def: DefinizioneCarta) {
  return { ...def, ...statisticheDerivate(def) };
}
