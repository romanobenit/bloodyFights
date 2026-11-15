import { randomUUID } from 'node:crypto';
import {
  CONFIG, type CartaCompleta, type Elemento, type TipoCarta,
  statisticheDerivate, validaCarta,
} from '@bloodyfights/motore';
import { telaValida } from '@bloodyfights/pixel';
import type { Archivio, Dati } from './archivio.ts';

/**
 * LE CARTE CREATE DAGLI UTENTI, SUL SERVER.
 *
 * Fino alla fase 3 una carta creata viveva nel localStorage di chi l'aveva
 * disegnata, e anche la revisione era locale. Andava bene per provare
 * l'editor, non per un gioco: nessun altro poteva vederla, e la validazione
 * della potenza la faceva il browser.
 *
 * Qui le carte diventano patrimonio comune: si inviano al server, una persona
 * le giudica, e quelle approvate formano il pool da cui pescano i bauli.
 *
 * COSA NON SI SALVA: potenza, costo e rarita'. Si ricalcolano ogni volta
 * dalla formula del cap. 5, come per le venti carte base. Se un giorno si
 * ritarano i pesi, tutte le carte della community si ribilanciano da sole
 * invece di restare ferme su un numero scritto in un campo.
 */

/** Quante carte puo' avere in circolazione un singolo utente (cap. 9). */
export const CARTE_PER_UTENTE = 1;

export type StatoCarta = 'pending' | 'approved' | 'rejected';

export interface CartaArchiviata {
  id: string;
  nome: string;
  descrizione: string;
  tipo: TipoCarta;
  elemento: Elemento;
  vita: number;
  attacco: number;
  /** La tela 32x32 in base64: 512 byte, 4 bit per pixel. */
  pixels: string;
  creatoreId: string;
  /** Copiato all'invio: il nome sulla carta non cambia se il creatore si rinomina. */
  creatoreNickname: string;
  stato: StatoCarta;
  motivoRifiuto?: string;
  inviataIl: string;
  decisaIl?: string;
}

export class ErroreCarta extends Error {
  // Dichiarato per esteso: una proprieta' nel costruttore genera codice, e
  // Node si limita a togliere i tipi.
  stato: number;

  constructor(message: string, stato = 400) {
    super(message);
    this.name = 'ErroreCarta';
    this.stato = stato;
  }
}

/** Quello che arriva dal client. Niente di piu': il resto lo decide il server. */
export interface BozzaInviata {
  nome: string;
  descrizione: string;
  tipo: TipoCarta;
  elemento: Elemento;
  vita: number;
  attacco: number;
  pixels: string;
}

function carteDi(dati: Dati): CartaArchiviata[] {
  return dati.carte as unknown as CartaArchiviata[];
}

/**
 * Controlla una bozza arrivata dal filo.
 *
 * Il client fa gli stessi controlli, ma quelli servono a dare un messaggio
 * mentre si disegna. Questi servono a tenere fuori una carta da 40 punti
 * potenza costruita con `fetch` dalla console.
 */
export function verificaBozza(bozza: unknown): BozzaInviata {
  const b = bozza as Partial<BozzaInviata> | undefined;
  if (!b || typeof b !== 'object') throw new ErroreCarta('Carta mancante');

  for (const campo of ['nome', 'descrizione', 'tipo', 'elemento', 'pixels'] as const) {
    if (typeof b[campo] !== 'string') throw new ErroreCarta(`Campo mancante o non valido: ${campo}`);
  }
  for (const campo of ['vita', 'attacco'] as const) {
    if (typeof b[campo] !== 'number') throw new ErroreCarta(`Campo mancante o non valido: ${campo}`);
  }

  const pulita: BozzaInviata = {
    nome: b.nome!.trim(),
    descrizione: b.descrizione!.trim(),
    tipo: b.tipo as TipoCarta,
    elemento: b.elemento as Elemento,
    vita: b.vita!,
    attacco: b.attacco!,
    pixels: b.pixels!,
  };

  const esito = validaCarta(pulita);
  if (!esito.valida) throw new ErroreCarta(esito.errori.join('; '));

  if (pulita.descrizione.length > CONFIG.carte.descrizioneMaxCaratteri)
    throw new ErroreCarta(`La descrizione supera i ${CONFIG.carte.descrizioneMaxCaratteri} caratteri`);

  // La tela si decodifica davvero: 684 caratteri che non sono 512 byte di
  // indici di palette non sono un disegno, sono qualcosa d'altro.
  if (!telaValida(pulita.pixels)) throw new ErroreCarta('Il disegno non e leggibile');

  return pulita;
}

/** Trasforma una carta archiviata in una carta giocabile, con costo e rarita'. */
export function comeCartaCompleta(carta: CartaArchiviata): CartaCompleta {
  return {
    id: carta.id,
    nome: carta.nome,
    tipo: carta.tipo,
    elemento: carta.elemento,
    vita: carta.vita,
    attacco: carta.attacco,
    descrizione: carta.descrizione,
    creatoreId: carta.creatoreId,
    ...statisticheDerivate(carta),
  };
}

// ------------------------------------------------------------------ letture

export async function catalogoApprovato(archivio: Archivio): Promise<CartaArchiviata[]> {
  const dati = await archivio.leggi();
  return carteDi(dati).filter((c) => c.stato === 'approved');
}

export async function codaDiRevisione(archivio: Archivio): Promise<CartaArchiviata[]> {
  const dati = await archivio.leggi();
  // Le piu' vecchie per prime: chi aspetta da di piu' viene giudicato prima.
  return carteDi(dati)
    .filter((c) => c.stato === 'pending')
    .sort((a, b) => a.inviataIl.localeCompare(b.inviataIl));
}

export async function carteDiUtente(archivio: Archivio, utenteId: string): Promise<CartaArchiviata[]> {
  const dati = await archivio.leggi();
  return carteDi(dati).filter((c) => c.creatoreId === utenteId);
}

// ----------------------------------------------------------------- scritture

export async function inviaCarta(
  archivio: Archivio,
  utenteId: string,
  bozza: unknown,
  adesso = () => new Date().toISOString(),
): Promise<CartaArchiviata> {
  const pulita = verificaBozza(bozza);

  return archivio.modifica((dati) => {
    const utente = dati.utenti.find((u) => u.id === utenteId);
    if (!utente) throw new ErroreCarta('Utente sconosciuto', 401);

    const carte = carteDi(dati);
    // Una carta rifiutata non occupa il posto: il senso del rifiuto e'
    // poterne mandare un'altra.
    const vive = carte.filter((c) => c.creatoreId === utenteId && c.stato !== 'rejected');
    if (vive.length >= CARTE_PER_UTENTE)
      throw new ErroreCarta('Hai gia una carta in revisione o approvata', 409);

    const carta: CartaArchiviata = {
      id: `utente-${randomUUID()}`,
      ...pulita,
      creatoreId: utenteId,
      creatoreNickname: utente.nickname,
      stato: 'pending',
      inviataIl: adesso(),
    };
    carte.push(carta);
    utente.cartaCreataId = carta.id;
    return structuredClone(carta);
  });
}

export async function decidiSuCarta(
  archivio: Archivio,
  cartaId: string,
  esito: 'approved' | 'rejected',
  motivo?: string,
  adesso = () => new Date().toISOString(),
): Promise<CartaArchiviata> {
  return archivio.modifica((dati) => {
    const carta = carteDi(dati).find((c) => c.id === cartaId);
    if (!carta) throw new ErroreCarta('Carta non trovata', 404);

    carta.stato = esito;
    carta.decisaIl = adesso();
    if (esito === 'rejected') carta.motivoRifiuto = motivo;
    else delete carta.motivoRifiuto;

    // Approvata: il creatore ne riceve una copia. E' il premio per averla
    // fatta, e senza di questa dovrebbe comprare un baule per avere la
    // propria carta.
    if (esito === 'approved') {
      const creatore = dati.utenti.find((u) => u.id === carta.creatoreId);
      if (creatore) {
        creatore.collezione = creatore.collezione ?? {};
        creatore.collezione[carta.id] = Math.max(1, creatore.collezione[carta.id] ?? 0);
      }
    }
    return structuredClone(carta);
  });
}

/** Torna indietro su una decisione: la carta riapre la coda. */
export async function revocaDecisione(
  archivio: Archivio,
  cartaId: string,
): Promise<CartaArchiviata> {
  return archivio.modifica((dati) => {
    const carta = carteDi(dati).find((c) => c.id === cartaId);
    if (!carta) throw new ErroreCarta('Carta non trovata', 404);
    carta.stato = 'pending';
    delete carta.motivoRifiuto;
    delete carta.decisaIl;
    return structuredClone(carta);
  });
}
