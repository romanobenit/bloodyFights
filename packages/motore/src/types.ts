export type Elemento = 'latte' | 'veleno' | 'acqua' | 'fuoco' | 'petrolio' | 'sangue';
export type TipoCarta = 'mischia' | 'distanza' | 'support';
export type Rarita = 'comune' | 'raro' | 'epico' | 'leggendario';

/** Indice del giocatore nello stato. 0 e 1, niente altro. */
export type IndiceGiocatore = 0 | 1;

/**
 * Le quattro fasi del turno, nell'ordine. 'finita' e' lo stato terminale
 * della partita, non una fase giocabile.
 */
export type Fase = 'evocazione' | 'riposizionamento' | 'support' | 'attacco' | 'finita';

export const ORDINE_FASI: readonly Fase[] = ['evocazione', 'riposizionamento', 'support', 'attacco'];

/** Definizione immutabile di una carta nel pool: cio' che sta nel database. */
export interface DefinizioneCarta {
  id: string;
  nome: string;
  tipo: TipoCarta;
  elemento: Elemento;
  vita: number;
  /** Per i support e' il valore di cura. */
  attacco: number;
  /** null = carta base del gioco, altrimenti id dell'utente che l'ha creata. */
  creatoreId: string | null;
}

/** Statistiche derivate dalla formula del costo. Mai scritte a mano. */
export interface StatisticheDerivate {
  potenza: number;
  costo: number;
  rarita: Rarita;
}

export type CartaCompleta = DefinizioneCarta & StatisticheDerivate;

/** Un'istanza di carta sul tabellone: ha vita corrente e uno stato suo. */
export interface CartaInCampo {
  /** Identificatore univoco dell'istanza, non della definizione. */
  uid: string;
  cartaId: string;
  nome: string;
  tipo: TipoCarta;
  elemento: Elemento;
  vita: number;
  vitaMax: number;
  attacco: number;
  costo: number;
  /** Evocata in questo turno: non attacca e non cura. */
  fresca: boolean;
  /** Per i support: ha gia' scelto cura o goccia in questo turno. */
  haAgito: boolean;
}

/**
 * Le 8 caselle di un giocatore sono un array piatto: indice = linea * 4 + colonna.
 * Indici 0-3 = prima linea, 4-7 = seconda linea.
 * Le colonne sono memorizzate SEMPRE allineate (0-3) per entrambi i giocatori:
 * l'inversione a specchio del cap. 4.1 avviene solo nel disegno del tabellone,
 * mai nella logica di combattimento.
 */
export type Tabellone = (CartaInCampo | null)[];

export interface StatoGiocatore {
  id: string;
  mazzo: string[];
  mano: string[];
  tabellone: Tabellone;
  cimitero: string[];
  vita: number;
  gocce: number;
  /** L'unica azione di riposizionamento del turno e' stata usata. */
  riposizionamentoUsato: boolean;
  turniGiocati: number;
}

export type VoceLog =
  | { tipo: 'inizioTurno'; giocatore: IndiceGiocatore; turno: number; gocce: number }
  | { tipo: 'pescata'; giocatore: IndiceGiocatore; cartaId: string }
  | { tipo: 'pescataScartata'; giocatore: IndiceGiocatore; cartaId: string; motivo: 'manoPiena' }
  | { tipo: 'mazzoEsaurito'; giocatore: IndiceGiocatore }
  | { tipo: 'evocazione'; giocatore: IndiceGiocatore; cartaId: string; casella: number; costo: number }
  | { tipo: 'riposizionamento'; giocatore: IndiceGiocatore; da: number; a: number; scambio: boolean }
  | { tipo: 'cura'; giocatore: IndiceGiocatore; curatore: number; bersaglio: number; punti: number }
  | { tipo: 'gocciaProdotta'; giocatore: IndiceGiocatore; casella: number }
  | { tipo: 'cambioFase'; giocatore: IndiceGiocatore; fase: Fase }
  | { tipo: 'attaccoSaltato'; giocatore: IndiceGiocatore; motivo: 'compensazionePrimoGiocatore' }
  | {
      tipo: 'colpo';
      giocatore: IndiceGiocatore;
      da: number;
      bersaglio: { genere: 'carta'; casella: number } | { genere: 'giocatore' };
      danno: number;
      moltiplicatore: number;
    }
  | { tipo: 'morte'; giocatore: IndiceGiocatore; casella: number; cartaId: string }
  | { tipo: 'fineTurno'; giocatore: IndiceGiocatore }
  | { tipo: 'vittoria'; vincitore: IndiceGiocatore | null };

export interface StatoPartita {
  giocatori: [StatoGiocatore, StatoGiocatore];
  /** Di chi e' il turno. */
  turnoDi: IndiceGiocatore;
  primoGiocatore: IndiceGiocatore;
  /** Numero di turni giocati in totale, da 1. */
  turno: number;
  fase: Fase;
  /** null a partita in corso; null anche a pareggio, con fase 'finita'. */
  vincitore: IndiceGiocatore | null;
  /** Seme del generatore pseudocasuale: vive nello stato perche' il motore e' puro. */
  seme: number;
  contatoreUid: number;
  log: VoceLog[];
}

export type Azione =
  | { tipo: 'evoca'; indiceMano: number; casella: number }
  | { tipo: 'riposiziona'; da: number; a: number }
  | { tipo: 'supportCura'; casella: number; bersaglio: number }
  | { tipo: 'supportGoccia'; casella: number }
  | { tipo: 'passaFase' };

/** Errore di mossa illegale: il server lo cattura e risponde al client. */
export class MossaIllegale extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MossaIllegale';
  }
}
