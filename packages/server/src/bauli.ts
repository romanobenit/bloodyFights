import { randomInt } from 'node:crypto';
import {
  CONFIG, type CartaCompleta, type Rarita, copieConcesse,
} from '@bloodyfights/motore';
import type { Archivio } from './archivio.ts';
import { catalogoApprovato, comeCartaCompleta } from './carte.ts';
import { ErroreCarta } from './carte.ts';

/**
 * I BAULI (cap. 8.2).
 *
 * L'estrazione avviene QUI, sul server, e viene registrata nell'archivio
 * prima di essere mostrata. L'animazione di apertura nel browser e' teatro:
 * le carte sono gia' decise, e nessun ricaricamento della pagina le cambia.
 *
 * Il sorteggio usa `randomInt` di node:crypto e non `Math.random`. Non e'
 * pignoleria: Math.random in V8 e' un generatore veloce il cui stato interno
 * si puo' ricostruire osservando abbastanza uscite, e un giocatore che sa
 * prevedere le estrazioni compra solo i bauli buoni.
 *
 * COSA C'E' DENTRO: le carte approvate della community, non le venti di base.
 * Un nuovo iscritto le ha gia' tutte al numero massimo di copie, quindi un
 * baule di carte base sarebbe tre duplicati da 25 GO l'uno pagati 300.
 */

export interface Baule {
  id: string;
  nome: string;
  /** Prezzo in Gocce d'Oro. null = non si compra con la valuta di gioco. */
  prezzoOro: number | null;
  /** Prezzo in denaro reale, per la fase 6. */
  prezzoEuro: number | null;
  quanteCarte: number;
  /** Probabilita' per singola carta, in percentuale. Devono fare 100. */
  probabilita: Partial<Record<Rarita, number>>;
  /** Almeno una carta di questa rarita' e' garantita. */
  garantita?: Rarita;
}

export const BAULI: readonly Baule[] = [
  {
    id: 'ferro',
    nome: 'Baule di Ferro',
    prezzoOro: 300,
    prezzoEuro: null,
    quanteCarte: 3,
    probabilita: { comune: 80, raro: 18, epico: 2 },
  },
  {
    id: 'sangue',
    nome: 'Baule di Sangue',
    prezzoOro: 800,
    prezzoEuro: null,
    quanteCarte: 5,
    probabilita: { comune: 50, raro: 35, epico: 13, leggendario: 2 },
  },
  {
    // Fase 6. Resta elencato ma non comprabile finche' Stripe non c'e': il
    // documento chiede termini, privacy e inquadramento fiscale prima.
    id: 'petrolio',
    nome: 'Baule di Petrolio',
    prezzoOro: null,
    prezzoEuro: 4.99,
    quanteCarte: 5,
    probabilita: { comune: 50, raro: 35, epico: 13, leggendario: 2 },
    garantita: 'epico',
  },
];

export function bauleDa(id: string): Baule | null {
  return BAULI.find((b) => b.id === id) ?? null;
}

/** Dalla piu' comune alla piu' rara: serve al ripiego quando il pool e' magro. */
const SCALA: readonly Rarita[] = ['comune', 'raro', 'epico', 'leggendario'];

/** Un'estrazione singola: o una carta, o le Gocce d'Oro del duplicato. */
export interface CartaEstratta {
  cartaId: string;
  nome: string;
  rarita: Rarita;
  /** Vero se la carta era gia' al massimo delle copie: diventa oro. */
  duplicata: boolean;
  /** Gocce d'Oro rimborsate quando duplicata, 0 altrimenti. */
  oro: number;
}

/** Quanti 10.000esimi: si sorteggia su interi, senza virgola mobile. */
const PRECISIONE = 10_000;

/**
 * Sceglie una rarita' secondo le probabilita' del baule.
 *
 * `casuale(n)` deve restituire un intero fra 0 e n-1. Viene iniettata per
 * poter provare esattamente i bordi delle fasce invece di sperare che
 * escano.
 */
export function sorteggiaRarita(baule: Baule, casuale: (max: number) => number): Rarita {
  const voci = SCALA.filter((r) => (baule.probabilita[r] ?? 0) > 0);
  const totale = voci.reduce((somma, r) => somma + (baule.probabilita[r] ?? 0), 0);

  const tiro = casuale(PRECISIONE);
  let accumulato = 0;
  for (const rarita of voci) {
    accumulato += ((baule.probabilita[rarita] ?? 0) / totale) * PRECISIONE;
    if (tiro < accumulato) return rarita;
  }
  // L'arrotondamento puo' lasciare scoperto l'ultimo decimillesimo.
  return voci[voci.length - 1];
}

/**
 * Sceglie una carta della rarita' voluta.
 *
 * Se il pool non ne ha nessuna di quella rarita' si ripiega: prima verso il
 * basso (una comune invece di una leggendaria), poi verso l'alto. All'inizio
 * la community avra' tre carte in tutto, e un baule che non consegna niente
 * perche' nessuno ha ancora disegnato un leggendario sarebbe solo un furto.
 */
export function scegliCarta(
  pool: readonly CartaCompleta[],
  voluta: Rarita,
  casuale: (max: number) => number,
): CartaCompleta | null {
  const indice = SCALA.indexOf(voluta);
  // Ordine di ripiego: la rarita' voluta, poi le piu' basse, poi le piu' alte.
  const ordine = [
    voluta,
    ...SCALA.slice(0, indice).reverse(),
    ...SCALA.slice(indice + 1),
  ];

  for (const rarita of ordine) {
    const candidate = pool.filter((c) => c.rarita === rarita);
    if (candidate.length > 0) return candidate[casuale(candidate.length)];
  }
  return null;
}

/**
 * Apre un baule: decide tutte le carte in una volta.
 *
 * `possedute` e' la collezione di chi apre, e viene aggiornata man mano:
 * aprendo un baule da cinque carte, la seconda copia di una carta che non
 * avevi conta come posseduta per la terza.
 */
export function estrai(
  pool: readonly CartaCompleta[],
  baule: Baule,
  possedute: Record<string, number>,
  casuale: (max: number) => number,
): CartaEstratta[] {
  if (pool.length === 0) return [];

  const conteggio = { ...possedute };
  const esito: CartaEstratta[] = [];

  for (let i = 0; i < baule.quanteCarte; i++) {
    // L'ultima carta onora la garanzia, se il baule ne ha una.
    const voluta =
      baule.garantita && i === baule.quanteCarte - 1 && !esito.some((e) => e.rarita === baule.garantita)
        ? baule.garantita
        : sorteggiaRarita(baule, casuale);

    const carta = scegliCarta(pool, voluta, casuale);
    if (!carta) break;

    const gia = conteggio[carta.id] ?? 0;
    const tetto = copieConcesse(carta);
    const duplicata = gia >= tetto;

    if (!duplicata) conteggio[carta.id] = gia + 1;

    esito.push({
      cartaId: carta.id,
      nome: carta.nome,
      rarita: carta.rarita,
      duplicata,
      oro: duplicata ? CONFIG.gocceDOro.cartaDuplicata : 0,
    });
  }

  return esito;
}

// --------------------------------------------------------------- sul server

export interface Apertura {
  id: string;
  utenteId: string;
  bauleId: string;
  prezzo: number;
  carte: CartaEstratta[];
  /** Gocce d'Oro rimaste dopo l'acquisto e i rimborsi dei duplicati. */
  oroRimasto: number;
  apertaIl: string;
}

export interface OpzioniApertura {
  archivio: Archivio;
  /** Iniettabile: i test non vogliono il caso, vogliono il bordo esatto. */
  casuale?: (max: number) => number;
  nuovoId?: () => string;
  adesso?: () => string;
}

export async function apriBaule(
  opzioni: OpzioniApertura,
  utenteId: string,
  bauleId: string,
): Promise<Apertura> {
  const casuale = opzioni.casuale ?? ((max: number) => randomInt(max));
  const nuovoId = opzioni.nuovoId ?? (() => crypto.randomUUID());
  const adesso = opzioni.adesso ?? (() => new Date().toISOString());

  const baule = bauleDa(bauleId);
  if (!baule) throw new ErroreCarta('Questo baule non esiste', 404);
  if (baule.prezzoOro === null)
    throw new ErroreCarta('Questo baule non si compra con le Gocce d Oro', 409);

  const pool = (await catalogoApprovato(opzioni.archivio)).map(comeCartaCompleta);
  if (pool.length === 0)
    throw new ErroreCarta(
      'Nessuna carta della community e ancora stata approvata: i bauli sono vuoti',
      409,
    );

  return opzioni.archivio.modifica((dati) => {
    const utente = dati.utenti.find((u) => u.id === utenteId);
    if (!utente) throw new ErroreCarta('Utente sconosciuto', 401);
    if (utente.oro < baule.prezzoOro!)
      throw new ErroreCarta(
        `Servono ${baule.prezzoOro} Gocce d Oro, ne hai ${utente.oro}`, 409,
      );

    const carte = estrai(pool, baule, utente.collezione, casuale);

    // Prima si paga, poi si consegna, e tutto dentro la stessa modifica: o
    // l'archivio registra l'acquisto intero o non registra niente.
    utente.oro -= baule.prezzoOro!;
    for (const estratta of carte) {
      if (estratta.duplicata) utente.oro += estratta.oro;
      else utente.collezione[estratta.cartaId] = (utente.collezione[estratta.cartaId] ?? 0) + 1;
    }

    const apertura: Apertura = {
      id: nuovoId(),
      utenteId,
      bauleId: baule.id,
      prezzo: baule.prezzoOro!,
      carte,
      oroRimasto: utente.oro,
      apertaIl: adesso(),
    };
    dati.aperture.push(apertura as unknown as Record<string, unknown>);
    return structuredClone(apertura);
  });
}
