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

/** Esito di una partita online, come lo manda il server. */
export interface EsitoRemoto {
  vincitoreId: string | null;
  motivo: 'regole' | 'tempo' | 'abbandono';
  mmr: Record<string, number>;
}

/**
 * La partita vista da un giocatore. Lo `stato` ha la forma di quello del
 * motore, ma le carte che non si devono vedere sono segnaposto: il server le
 * copre prima di spedirlo.
 */
export interface PartitaRemota {
  partitaId: string;
  io: 0 | 1;
  avversario: string;
  stato: unknown;
  scadeIl: number;
  esito: EsitoRemoto | null;
}

export interface StatoCoda {
  utenteId: string;
  mmr: number;
  da: number;
}

/** Un evento che arriva dal flusso. */
export interface AvvisoRemoto {
  tipo: 'inCoda' | 'partitaTrovata' | 'stato' | 'finita';
  partita: PartitaRemota | null;
}

export interface Cliente {
  base: string;
  salute(): Promise<boolean>;
  registrazione(email: string, password: string, nickname: string): Promise<EsitoAccesso>;
  accesso(email: string, password: string): Promise<EsitoAccesso>;
  uscita(token: string): Promise<void>;
  io(token: string): Promise<UtenteRemoto>;

  entraInCoda(token: string, mazzo: readonly string[]): Promise<{ inCoda: boolean; partita: PartitaRemota | null }>;
  esciDallaCoda(token: string): Promise<void>;
  leggiPartita(token: string): Promise<{ partita: PartitaRemota | null; inCoda: StatoCoda | null }>;
  agisci(token: string, azione: unknown): Promise<PartitaRemota>;
  abbandona(token: string): Promise<PartitaRemota | null>;
  /**
   * Apre il flusso degli eventi e chiama `quando` a ogni novita'.
   * Restituisce la funzione per chiuderlo.
   */
  apriFlusso(token: string, quando: (avviso: AvvisoRemoto) => void): () => void;
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

    entraInCoda: (token, mazzo) =>
      chiama('/online/coda', { metodo: 'POST', token, corpo: { mazzo: [...mazzo] } }),

    esciDallaCoda: (token) => chiama<void>('/online/coda', { metodo: 'DELETE', token }),

    leggiPartita: (token) => chiama('/online/partita', { token }),

    agisci: (token, azione) =>
      chiama<{ partita: PartitaRemota }>('/online/partita/azione', {
        metodo: 'POST', token, corpo: { azione },
      }).then((r) => r.partita),

    abbandona: (token) =>
      chiama<{ partita: PartitaRemota | null }>('/online/partita/abbandono', {
        metodo: 'POST', token,
      }).then((r) => r.partita),

    apriFlusso(token, quando) {
      // Non si usa EventSource: non sa mandare intestazioni, e il token
      // finirebbe nell'indirizzo - quindi nei registri dei proxy e nella
      // cronologia. Con fetch il token resta dov'e' giusto che stia, e il
      // corpo si legge a pezzi mentre arriva.
      const annulla = new AbortController();
      let vivo = true;
      let riprova: ReturnType<typeof setTimeout> | null = null;

      const leggi = async () => {
        const risposta = await recupera(indirizzo + '/online/flusso', {
          headers: { Authorization: `Bearer ${token}` },
          signal: annulla.signal,
        });
        if (!risposta.ok || !risposta.body) throw new ErroreServer('Flusso rifiutato', risposta.status);

        const lettore = risposta.body.getReader();
        const decodifica = new TextDecoder();
        let avanzo = '';

        for (;;) {
          const { done, value } = await lettore.read();
          if (done) break;
          avanzo += decodifica.decode(value, { stream: true });
          // Gli eventi SSE sono separati da una riga vuota. L'ultimo pezzo
          // puo' essere a meta': resta nell'avanzo e aspetta il resto.
          const pezzi = avanzo.split('\n\n');
          avanzo = pezzi.pop() ?? '';
          for (const pezzo of pezzi) {
            const dati = /^data: (.+)$/m.exec(pezzo)?.[1];
            if (!dati) continue;
            try {
              const letto = JSON.parse(dati) as { avviso?: { tipo?: string }; partita?: PartitaRemota | null };
              const tipo = letto.avviso?.tipo;
              if (tipo) quando({ tipo: tipo as AvvisoRemoto['tipo'], partita: letto.partita ?? null });
            } catch {
              // Un evento illeggibile si salta: il prossimo porta lo stato
              // aggiornato comunque.
            }
          }
        }
      };

      const insisti = () => {
        if (!vivo) return;
        leggi()
          .catch(() => undefined)
          .then(() => {
            // Il flusso cade sempre, prima o poi: proxy, sospensione del
            // portatile, rete che salta. Si riapre, con una pausa per non
            // martellare un server spento.
            if (vivo) riprova = setTimeout(insisti, 2000);
          });
      };
      insisti();

      return () => {
        vivo = false;
        if (riprova) clearTimeout(riprova);
        annulla.abort();
      };
    },
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
