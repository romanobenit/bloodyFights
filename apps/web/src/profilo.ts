import { CONFIG, copieMassime, validaMazzo, type CartaCompleta } from '@bloodyfights/motore';
import type { CartaCreata } from './editor.ts';
import type { Decisione } from './moderazione.ts';

/**
 * PROFILO, COLLEZIONE E MAZZI.
 *
 * Tutte funzioni pure: ricevono un profilo e ne restituiscono uno nuovo, senza
 * toccare quello ricevuto. Stesso principio del motore, e per lo stesso
 * motivo: si provano in Node, e quando arrivera' il server queste regole non
 * cambiano: cambia solo chi conserva il risultato.
 */

export interface Mazzo {
  id: string;
  nome: string;
  /** cartaId -> quante copie nel mazzo. */
  carte: Record<string, number>;
}

export interface Profilo {
  nickname: string;
  bio: string;
  /** cartaId -> quante copie possedute. */
  collezione: Record<string, number>;
  mazzi: Mazzo[];
  mazzoAttivoId: string;
  vittorie: number;
  sconfitte: number;
  /** Per la fase 3: ogni account puo' creare una sola carta. */
  cartaCreata: CartaCreata | null;
  /** Registro delle revisioni, per poter tornare indietro su un rifiuto. */
  decisioni: Decisione[];
}

/** Fino a 3 mazzi, uno attivo (proposta del cap. 12). */
export const MAZZI_MASSIMI = 3;

/**
 * COPIE CONCESSE A UN NUOVO PROFILO.
 *
 * Il cap. 12 propone "tutte e 20, cosi' un nuovo iscritto puo' comporre subito
 * un mazzo legale". Con una copia sola pero' esiste UN SOLO mazzo legale
 * possibile - venti carte diverse, nessuna scelta - e l'editor del mazzo non
 * avrebbe niente da fare.
 *
 * Quante copie dipende dalla carta: tante quante se ne possono mettere nel
 * mazzo, cosi' la collezione non promette copie inutilizzabili. Le carte
 * oggetto fanno eccezione e si concedono a mani basse: costano 0 e servono a
 * sperimentare. Da confermare: incide sull'economia dei bauli della fase 5.
 */
export const COPIE_OGGETTO = 10;

export function copieConcesse(carta: CartaCompleta): number {
  if (carta.tipo === 'oggetto') return COPIE_OGGETTO;
  return copieMassime(carta.costo);
}

export function profiloIniziale(carte: readonly CartaCompleta[], nickname = 'Ospite'): Profilo {
  const collezione: Record<string, number> = {};
  for (const carta of carte) collezione[carta.id] = copieConcesse(carta);

  // Un primo mazzo gia' legale: una copia di ciascuna delle 20 creature.
  // Le carte oggetto restano fuori, o il mazzo sforerebbe le 20 carte.
  const carteMazzo: Record<string, number> = {};
  for (const carta of carte.filter((c) => c.tipo !== 'oggetto').slice(0, CONFIG.mazzo.carteNelMazzo))
    carteMazzo[carta.id] = 1;

  return {
    nickname,
    bio: '',
    collezione,
    mazzi: [{ id: 'mazzo-1', nome: 'Mazzo base', carte: carteMazzo }],
    mazzoAttivoId: 'mazzo-1',
    vittorie: 0,
    sconfitte: 0,
    cartaCreata: null,
    decisioni: [],
  };
}

// ------------------------------------------------------------------ letture

export function mazzoAttivo(profilo: Profilo): Mazzo | undefined {
  return profilo.mazzi.find((m) => m.id === profilo.mazzoAttivoId) ?? profilo.mazzi[0];
}

export function carteNelMazzo(mazzo: Mazzo): number {
  return Object.values(mazzo.carte).reduce((somma, n) => somma + n, 0);
}

export function possedute(profilo: Profilo, cartaId: string): number {
  return profilo.collezione[cartaId] ?? 0;
}

export function nelMazzo(mazzo: Mazzo, cartaId: string): number {
  return mazzo.carte[cartaId] ?? 0;
}

/** Copie ancora disponibili nella collezione per questa carta. */
export function disponibili(profilo: Profilo, mazzo: Mazzo, cartaId: string): number {
  return Math.max(0, possedute(profilo, cartaId) - nelMazzo(mazzo, cartaId));
}

/** Il mazzo come lista piatta, nella forma che il motore si aspetta. */
export function mazzoComeLista(mazzo: Mazzo): string[] {
  const lista: string[] = [];
  for (const [cartaId, quante] of Object.entries(mazzo.carte)) {
    for (let i = 0; i < quante; i++) lista.push(cartaId);
  }
  return lista;
}

// --------------------------------------------------------------- modifiche

export interface EsitoMossa {
  mazzo: Mazzo;
  /** null se e' andata, altrimenti perche' no. */
  rifiuto: string | null;
}

export function aggiungiAlMazzo(
  profilo: Profilo,
  mazzo: Mazzo,
  cartaId: string,
  catalogo: readonly CartaCompleta[],
): EsitoMossa {
  const giaDentro = nelMazzo(mazzo, cartaId);
  const carta = catalogo.find((c) => c.id === cartaId);
  if (!carta) return { mazzo, rifiuto: 'Carta sconosciuta' };

  if (carteNelMazzo(mazzo) >= CONFIG.mazzo.carteNelMazzo)
    return { mazzo, rifiuto: `Il mazzo ha gia' ${CONFIG.mazzo.carteNelMazzo} carte` };

  const massimo = copieMassime(carta.costo);
  if (giaDentro >= massimo)
    return { mazzo, rifiuto: `Massimo ${massimo} copie di ${carta.nome}` };

  // "2 copie, e solo se le possiedi entrambe" (cap. 4.2).
  if (disponibili(profilo, mazzo, cartaId) <= 0)
    return { mazzo, rifiuto: 'Non possiedi altre copie di questa carta' };

  return {
    mazzo: { ...mazzo, carte: { ...mazzo.carte, [cartaId]: giaDentro + 1 } },
    rifiuto: null,
  };
}

export function togliDalMazzo(mazzo: Mazzo, cartaId: string): EsitoMossa {
  const giaDentro = nelMazzo(mazzo, cartaId);
  if (giaDentro <= 0) return { mazzo, rifiuto: 'Questa carta non e nel mazzo' };

  const carte = { ...mazzo.carte };
  if (giaDentro === 1) delete carte[cartaId];
  else carte[cartaId] = giaDentro - 1;

  return { mazzo: { ...mazzo, carte }, rifiuto: null };
}

export function sostituisciMazzo(profilo: Profilo, mazzo: Mazzo): Profilo {
  return { ...profilo, mazzi: profilo.mazzi.map((m) => (m.id === mazzo.id ? mazzo : m)) };
}

export function nuovoMazzo(profilo: Profilo): { profilo: Profilo; rifiuto: string | null } {
  if (profilo.mazzi.length >= MAZZI_MASSIMI)
    return { profilo, rifiuto: `Massimo ${MAZZI_MASSIMI} mazzi` };

  const numeri = profilo.mazzi.map((m) => Number(m.id.replace('mazzo-', '')) || 0);
  const id = `mazzo-${Math.max(0, ...numeri) + 1}`;
  const mazzo: Mazzo = { id, nome: `Mazzo ${profilo.mazzi.length + 1}`, carte: {} };

  return { profilo: { ...profilo, mazzi: [...profilo.mazzi, mazzo], mazzoAttivoId: id }, rifiuto: null };
}

export function registraEsito(profilo: Profilo, vinto: boolean): Profilo {
  return vinto
    ? { ...profilo, vittorie: profilo.vittorie + 1 }
    : { ...profilo, sconfitte: profilo.sconfitte + 1 };
}

// -------------------------------------------------------------- validazione

/**
 * Perche' questo mazzo non e' giocabile. Lista vuota = si puo' giocare.
 * Ripassa da validaMazzo del motore, che e' la stessa funzione che il server
 * usera' per decidere: le regole stanno in un posto solo.
 */
export function erroriMazzo(
  profilo: Profilo,
  mazzo: Mazzo,
  catalogo: readonly CartaCompleta[],
): string[] {
  const errori = validaMazzo(mazzoComeLista(mazzo), catalogo);

  for (const [cartaId, quante] of Object.entries(mazzo.carte)) {
    if (quante > possedute(profilo, cartaId))
      errori.push(`${cartaId}: ne hai ${possedute(profilo, cartaId)} copie, nel mazzo ce ne sono ${quante}`);
  }

  return errori;
}

export function mazzoGiocabile(
  profilo: Profilo,
  mazzo: Mazzo,
  catalogo: readonly CartaCompleta[],
): boolean {
  return erroriMazzo(profilo, mazzo, catalogo).length === 0;
}
