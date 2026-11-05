import { CONFIG } from './config.ts';
import type { Elemento } from './types.ts';

export const ELEMENTI: readonly Elemento[] = ['latte', 'veleno', 'acqua', 'fuoco', 'petrolio', 'sangue'];

/**
 * La catena del cap. 4.6: ogni elemento ha un bersaglio privilegiato.
 * latte -> veleno -> acqua -> fuoco -> petrolio. Il sangue e' fuori dal ciclo.
 */
const BERSAGLIO_FORTE: Partial<Record<Elemento, Elemento>> = {
  latte: 'veleno',
  veleno: 'acqua',
  acqua: 'fuoco',
  fuoco: 'petrolio',
};

/** Il petrolio ha un vantaggio ampio ma debole. Il fuoco ne e' immune. */
const BERSAGLI_PETROLIO: readonly Elemento[] = ['latte', 'veleno', 'acqua'];

/**
 * Moltiplicatore del danno di `attaccante` contro `difensore`.
 * Nella v0.1 il vantaggio agisce solo sul danno inflitto: il difensore
 * in vantaggio non riduce il danno che riceve (vedi CONFIG.elementi).
 */
export function moltiplicatoreElementale(attaccante: Elemento, difensore: Elemento): number {
  let moltiplicatore = 1;

  if (BERSAGLIO_FORTE[attaccante] === difensore) {
    moltiplicatore = CONFIG.elementi.vantaggioForte;
  } else if (attaccante === 'petrolio' && BERSAGLI_PETROLIO.includes(difensore)) {
    moltiplicatore = CONFIG.elementi.vantaggioPetrolio;
  }

  // Se e' il difensore ad avere il vantaggio sull'attaccante, applica la
  // riduzione configurata (1.0 = nessun effetto).
  const difensoreInVantaggio =
    BERSAGLIO_FORTE[difensore] === attaccante ||
    (difensore === 'petrolio' && BERSAGLI_PETROLIO.includes(attaccante));

  if (difensoreInVantaggio) {
    moltiplicatore *= CONFIG.elementi.riduzioneInSvantaggio;
  }

  return moltiplicatore;
}

/**
 * Danno effettivo su una carta: attacco x moltiplicatore, arrotondamento
 * classico (4,5 -> 5). Il danno diretto al giocatore non passa da qui:
 * il giocatore non ha un elemento.
 */
export function dannoSuCarta(attacco: number, attaccante: Elemento, difensore: Elemento): number {
  return Math.round(attacco * moltiplicatoreElementale(attaccante, difensore));
}
