/**
 * CLIENTE HTTP VERSO IL SERVER.
 *
 * Non importa niente dal pacchetto del server, nemmeno i tipi: quel codice usa
 * node:crypto e il filesystem, e non deve finire in un browser. I tipi delle
 * risposte sono ridichiarati qui. E' una piccola duplicazione, ed e' il prezzo
 * giusto per non far attraversare al codice del server un confine che non deve
 * attraversare.
 */

/** Come il client vede un utente: quello che `utentePubblico` lascia uscire. */
export interface UtenteRemoto {
  id: string;
  nickname: string;
  bio: string;
  oro: number;
  mmr: number;
  vittorie: number;
  sconfitte: number;
  cartaCreataId: string | null;
  creatoIl: string;
}

export interface EsitoAccesso {
  token: string;
  utente: UtenteRemoto;
}

export class ErroreServer extends Error {
  stato: number;

  constructor(message: string, stato: number) {
    super(message);
    this.name = 'ErroreServer';
    this.stato = stato;
  }

  /** stato 0 = non siamo mai arrivati al server. */
  get irraggiungibile(): boolean {
    return this.stato === 0;
  }
}

export interface Cliente {
  base: string;
  salute(): Promise<boolean>;
  registrazione(email: string, password: string, nickname: string): Promise<EsitoAccesso>;
  accesso(email: string, password: string): Promise<EsitoAccesso>;
  uscita(token: string): Promise<void>;
  io(token: string): Promise<UtenteRemoto>;
}

/** Oltre questo tempo si considera il server assente invece di restare appesi. */
const SCADENZA_MS = 6000;
const SCADENZA_SALUTE_MS = 2000;

type Recupero = typeof globalThis.fetch;

export function creaCliente(base: string, recupera: Recupero = globalThis.fetch): Cliente {
  const indirizzo = base.replace(/\/$/, '');

  async function chiama<T>(
    percorso: string,
    opzioni: { metodo?: string; corpo?: unknown; token?: string; scadenza?: number } = {},
  ): Promise<T> {
    const intestazioni: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opzioni.token) intestazioni.Authorization = `Bearer ${opzioni.token}`;

    let risposta: Response;
    try {
      risposta = await recupera(indirizzo + percorso, {
        method: opzioni.metodo ?? 'GET',
        headers: intestazioni,
        body: opzioni.corpo === undefined ? undefined : JSON.stringify(opzioni.corpo),
        signal: AbortSignal.timeout(opzioni.scadenza ?? SCADENZA_MS),
      });
    } catch {
      // Rete assente, server spento, scadenza: dal punto di vista di chi usa
      // l'app sono la stessa cosa, e il messaggio deve dirlo in chiaro.
      throw new ErroreServer('Server non raggiungibile', 0);
    }

    if (risposta.status === 204) return undefined as T;

    const testo = await risposta.text();
    let dati: unknown;
    try {
      dati = testo ? JSON.parse(testo) : undefined;
    } catch {
      throw new ErroreServer('Risposta del server illeggibile', risposta.status);
    }

    if (!risposta.ok) {
      const messaggio = (dati as { errore?: string } | undefined)?.errore ?? 'Richiesta rifiutata';
      throw new ErroreServer(messaggio, risposta.status);
    }
    return dati as T;
  }

  return {
    base: indirizzo,

    async salute() {
      try {
        await chiama<{ stato: string }>('/salute', { scadenza: SCADENZA_SALUTE_MS });
        return true;
      } catch {
        return false;
      }
    },

    registrazione: (email, password, nickname) =>
      chiama<EsitoAccesso>('/identita/registrazione', {
        metodo: 'POST',
        corpo: { email, password, nickname },
      }),

    accesso: (email, password) =>
      chiama<EsitoAccesso>('/identita/accesso', { metodo: 'POST', corpo: { email, password } }),

    uscita: (token) => chiama<void>('/identita/uscita', { metodo: 'POST', token }),

    io: (token) => chiama<{ utente: UtenteRemoto }>('/identita/io', { token }).then((r) => r.utente),
  };
}

/**
 * Indirizzo del server.
 *
 * In locale si sviluppa con il client su 5173 e il server su 4000. Pubblicato
 * su un sito statico il server non c'e' affatto, e l'app resta in modalita'
 * locale: e' il motivo per cui ogni chiamata puo' fallire con "irraggiungibile"
 * senza che nulla si rompa.
 */
export function indirizzoServerPredefinito(): string {
  const posizione = globalThis.location;
  if (posizione && posizione.hostname === 'localhost') return 'http://localhost:4000';
  return '';
}
