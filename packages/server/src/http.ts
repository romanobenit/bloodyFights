import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * STRATO HTTP MINIMO.
 *
 * Il documento propone Fastify. Qui non e' installabile, e quello che serve
 * davvero - instradamento, corpo JSON, errori, intestazioni - sta in poche
 * decine di righe sopra il server integrato di Node. Le rotte sono scritte
 * come funzioni che ricevono una richiesta e restituiscono una risposta:
 * cambiare framework vorra' dire riscrivere QUESTO file, non le rotte.
 */

export interface Richiesta {
  metodo: string;
  percorso: string;
  /** Parametri presi dal percorso, es. /partite/:id. */
  parametri: Record<string, string>;
  query: URLSearchParams;
  corpo: unknown;
  /** Il token di sessione, letto dall'intestazione Authorization. */
  token: string | null;
  origine: string | null;
}

/**
 * Un flusso di eventi (SSE): la risposta non si chiude, il server continua a
 * scriverci dentro. Il documento prevede WebSocket; qui serve il tempo reale
 * in una direzione sola - server verso client - e per quello basta HTTP
 * normale, che passa dai proxy senza cerimonie e si riapre da solo.
 *
 * `avvia` riceve la funzione per mandare un evento e quella per chiudere, e
 * restituisce la pulizia da eseguire quando il client se ne va.
 */
export interface Flusso {
  avvia(
    invia: (evento: string, dati: unknown) => void,
    chiudi: () => void,
  ): () => void;
}

export interface Risposta {
  stato: number;
  corpo?: unknown;
  intestazioni?: Record<string, string>;
  /** Se c'e', la risposta resta aperta e il corpo viene ignorato. */
  flusso?: Flusso;
}

export type Gestore = (richiesta: Richiesta) => Promise<Risposta> | Risposta;

export interface Rotta {
  metodo: string;
  /** Es. '/partite/:id'. */
  schema: string;
  gestore: Gestore;
}

/** Corpo massimo accettato: oltre, la richiesta viene chiusa. */
const CORPO_MASSIMO = 1024 * 1024;

export class ErroreHttp extends Error {
  stato: number;

  constructor(message: string, stato = 400) {
    super(message);
    this.name = 'ErroreHttp';
    this.stato = stato;
  }
}

/** Confronta un percorso con uno schema e ne estrae i parametri. */
export function combacia(schema: string, percorso: string): Record<string, string> | null {
  const pezziSchema = schema.split('/').filter(Boolean);
  const pezziPercorso = percorso.split('/').filter(Boolean);
  if (pezziSchema.length !== pezziPercorso.length) return null;

  const parametri: Record<string, string> = {};
  for (const [i, pezzo] of pezziSchema.entries()) {
    if (pezzo.startsWith(':')) parametri[pezzo.slice(1)] = decodeURIComponent(pezziPercorso[i]);
    else if (pezzo !== pezziPercorso[i]) return null;
  }
  return parametri;
}

export function tokenDaIntestazione(valore: string | undefined): string | null {
  if (!valore) return null;
  const [tipo, token] = valore.split(' ');
  return tipo?.toLowerCase() === 'bearer' && token ? token : null;
}

async function leggiCorpo(richiesta: IncomingMessage): Promise<unknown> {
  const pezzi: Buffer[] = [];
  let quanto = 0;

  for await (const pezzo of richiesta) {
    quanto += (pezzo as Buffer).length;
    // Il limite si controlla mentre arriva, non dopo: altrimenti bastano
    // pochi megabyte per riempire la memoria del server.
    if (quanto > CORPO_MASSIMO) throw new ErroreHttp('Richiesta troppo grande', 413);
    pezzi.push(pezzo as Buffer);
  }

  if (pezzi.length === 0) return undefined;
  const testo = Buffer.concat(pezzi).toString('utf8');
  try {
    return JSON.parse(testo);
  } catch {
    throw new ErroreHttp('Corpo JSON non valido', 400);
  }
}

export interface OpzioniServer {
  rotte: Rotta[];
  /** Origini ammesse per le richieste dal browser. */
  origini: string[];
}

export function creaServer(opzioni: OpzioniServer): Server {
  return createServer(async (richiestaNode, risposta) => {
    const origine = richiestaNode.headers.origin ?? null;
    const ammessa = origine !== null && opzioni.origini.includes(origine);

    const intestazioniBase: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      // Elenco chiuso di origini: con "*" qualunque sito potrebbe chiamare
      // queste rotte dal browser di un utente connesso.
      ...(ammessa
        ? {
            'Access-Control-Allow-Origin': origine,
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            Vary: 'Origin',
          }
        : {}),
    };

    if (richiestaNode.method === 'OPTIONS') {
      risposta.writeHead(ammessa ? 204 : 403, intestazioniBase).end();
      return;
    }

    try {
      const indirizzo = new URL(richiestaNode.url ?? '/', 'http://locale');
      const rotta = opzioni.rotte
        .map((r) => ({ r, parametri: combacia(r.schema, indirizzo.pathname) }))
        .find((x) => x.parametri !== null && x.r.metodo === richiestaNode.method);

      if (!rotta) {
        risposta.writeHead(404, intestazioniBase).end(JSON.stringify({ errore: 'Rotta non trovata' }));
        return;
      }

      const esito = await rotta.r.gestore({
        metodo: richiestaNode.method ?? 'GET',
        percorso: indirizzo.pathname,
        parametri: rotta.parametri!,
        query: indirizzo.searchParams,
        corpo: await leggiCorpo(richiestaNode),
        token: tokenDaIntestazione(richiestaNode.headers.authorization),
        origine,
      });

      if (esito.flusso) {
        apriFlusso(risposta, esito.flusso, intestazioniBase, esito.intestazioni);
        return;
      }

      risposta
        .writeHead(esito.stato, { ...intestazioniBase, ...esito.intestazioni })
        .end(esito.corpo === undefined ? '' : JSON.stringify(esito.corpo));
    } catch (errore) {
      const stato = errore instanceof Error && 'stato' in errore ? Number(errore.stato) : 500;
      // Verso il client va il messaggio solo per gli errori previsti: un 500
      // potrebbe portarsi dietro dettagli interni.
      const messaggio =
        stato >= 500 || !(errore instanceof Error) ? 'Errore interno' : errore.message;
      if (stato >= 500) console.error('Errore non previsto:', errore);
      risposta.writeHead(stato, intestazioniBase).end(JSON.stringify({ errore: messaggio }));
    }
  });
}


/** Tiene aperta la risposta e ci scrive eventi finche' il client resta. */
function apriFlusso(
  risposta: ServerResponse,
  flusso: Flusso,
  intestazioniBase: Record<string, string>,
  extra: Record<string, string> | undefined,
): void {
  risposta.writeHead(200, {
    ...intestazioniBase,
    ...extra,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Alcuni proxy accumulano le risposte: cosi' gli eventi partono subito.
    'X-Accel-Buffering': 'no',
  });

  let aperto = true;
  let pulisci: (() => void) | null = null;

  const chiudi = () => {
    if (!aperto) return;
    aperto = false;
    // Prima la pulizia, poi la chiusura: altrimenti l'arena resta con un
    // ascoltatore che scrive su una risposta morta.
    try {
      pulisci?.();
    } finally {
      risposta.end();
    }
  };

  const invia = (evento: string, dati: unknown) => {
    if (!aperto) return;
    risposta.write(`event: ${evento}\ndata: ${JSON.stringify(dati)}\n\n`);
  };

  risposta.on('close', () => {
    aperto = false;
    pulisci?.();
  });

  pulisci = flusso.avvia(invia, chiudi);
  // Un commento ogni venti secondi: tiene vivo il collegamento quando non
  // succede niente, e fa accorgere il server se il client e' sparito.
  const battito = setInterval(() => {
    if (aperto) risposta.write(': battito\n\n');
  }, 20_000);
  battito.unref?.();
  risposta.on('close', () => clearInterval(battito));
}
