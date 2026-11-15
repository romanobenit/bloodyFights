import { CONFIG } from './config.ts';
import { copieMassime } from './motore.ts';
import type { CartaCompleta } from './types.ts';

/**
 * LA DOTAZIONE DI PARTENZA.
 *
 * Cosa possiede un nuovo iscritto, e con che mazzo comincia. Sta nel motore e
 * non nel client perche' dalla fase 5 serve a tutti e due: il browser la usa
 * per chi gioca senza account, il server per chi si registra. Scritta due
 * volte, le due copie divergerebbero al primo ritocco, e un giocatore si
 * troverebbe collezioni diverse a seconda che sia collegato o no.
 *
 * Il cap. 12 propone "tutte e 20, cosi' un nuovo iscritto puo' comporre
 * subito un mazzo legale". Con una copia sola pero' esiste UN SOLO mazzo
 * legale possibile - venti carte diverse, nessuna scelta - e l'editor del
 * mazzo non avrebbe niente da fare. Quindi tante copie quante se ne possono
 * mettere nel mazzo: la collezione non promette copie inutilizzabili.
 */

/**
 * Le carte oggetto si concedono a mani basse: costano 0 e servono a
 * sperimentare. Da riguardare quando i bauli saranno in funzione.
 */
export const COPIE_OGGETTO = 10;

export function copieConcesse(carta: CartaCompleta): number {
  if (carta.tipo === 'oggetto') return COPIE_OGGETTO;
  return copieMassime(carta.costo);
}

export function collezioneIniziale(carte: readonly CartaCompleta[]): Record<string, number> {
  const collezione: Record<string, number> = {};
  for (const carta of carte) collezione[carta.id] = copieConcesse(carta);
  return collezione;
}

/**
 * Un primo mazzo gia' legale: una copia di ciascuna delle venti creature.
 * Le carte oggetto restano fuori, o il mazzo sforerebbe le venti carte.
 */
export function mazzoIniziale(carte: readonly CartaCompleta[]): Record<string, number> {
  const mazzo: Record<string, number> = {};
  for (const carta of carte.filter((c) => c.tipo !== 'oggetto').slice(0, CONFIG.mazzo.carteNelMazzo))
    mazzo[carta.id] = 1;
  return mazzo;
}
