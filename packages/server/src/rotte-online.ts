import { MossaIllegale, type Azione } from '@bloodyfights/motore';
import type { Archivio } from './archivio.ts';
import type { Arena } from './arena.ts';
import { utenteDalToken } from './identita.ts';
import { ErroreHttp, type Richiesta, type Rotta } from './http.ts';

/**
 * LE ROTTE DELLE PARTITE ONLINE.
 *
 * Il client manda mosse e legge stati. Non calcola: se un client modificato
 * si inventa una goccia di sangue, il server risponde "mossa illegale",
 * perche' chi applica le regole e' lui.
 *
 * Il tempo reale passa da /online/flusso, che resta aperto. Il token viaggia
 * nell'intestazione Authorization come per tutte le altre rotte - non nella
 * query - perche' gli indirizzi finiscono nei registri dei proxy e un token
 * nei registri e' un token regalato. Per questo il client non usa
 * EventSource, che non sa mandare intestazioni, ma fetch con la lettura a
 * pezzi del corpo.
 */

async function esigiUtente(archivio: Archivio, richiesta: Richiesta) {
  const utente = await utenteDalToken(archivio, richiesta.token);
  if (!utente) throw new ErroreHttp('Devi accedere', 401);
  return utente;
}

/** Una mossa illegale e' colpa di chi la manda: 409, non 500. */
function tradotto<T>(azione: () => T): T {
  try {
    return azione();
  } catch (errore) {
    if (errore instanceof MossaIllegale) throw new ErroreHttp(errore.message, 409);
    throw errore;
  }
}

function azioneDalCorpo(corpo: unknown): Azione {
  const azione = (corpo as { azione?: unknown } | undefined)?.azione;
  const tipo = (azione as { tipo?: unknown } | undefined)?.tipo;
  if (typeof tipo !== 'string') throw new ErroreHttp('Azione mancante', 400);
  return azione as Azione;
}

function mazzoDalCorpo(corpo: unknown): string[] {
  const mazzo = (corpo as { mazzo?: unknown } | undefined)?.mazzo;
  if (!Array.isArray(mazzo) || mazzo.some((x) => typeof x !== 'string'))
    throw new ErroreHttp('Mazzo mancante', 400);
  return mazzo as string[];
}

export interface OpzioniOnline {
  archivio: Archivio;
  arena: Arena;
  /** Orologio iniettabile: i test non aspettano davvero un minuto. */
  adesso?: () => number;
}

export function rotteOnline(opzioni: OpzioniOnline): Rotta[] {
  const { archivio, arena } = opzioni;
  const adesso = opzioni.adesso ?? (() => Date.now());

  return [
    {
      metodo: 'POST',
      schema: '/online/coda',
      gestore: async (richiesta) => {
        const utente = await esigiUtente(archivio, richiesta);
        const ora = adesso();
        tradotto(() => arena.entra(utente.id, utente.mmr, mazzoDalCorpo(richiesta.corpo), ora));
        // Un giro di accoppiamento subito: se c'e' gia' qualcuno in attesa,
        // la partita parte senza aspettare il battito del secondo.
        arena.passaIlTempo(ora);
        return { stato: 200, corpo: { inCoda: arena.inCoda(utente.id) !== null, partita: arena.vista(utente.id) } };
      },
    },

    {
      metodo: 'DELETE',
      schema: '/online/coda',
      gestore: async (richiesta) => {
        const utente = await esigiUtente(archivio, richiesta);
        arena.esci(utente.id);
        return { stato: 204 };
      },
    },

    {
      metodo: 'GET',
      schema: '/online/partita',
      gestore: async (richiesta) => {
        const utente = await esigiUtente(archivio, richiesta);
        return {
          stato: 200,
          corpo: { partita: arena.vista(utente.id), inCoda: arena.inCoda(utente.id) },
        };
      },
    },

    {
      metodo: 'POST',
      schema: '/online/partita/azione',
      gestore: async (richiesta) => {
        const utente = await esigiUtente(archivio, richiesta);
        const vista = tradotto(() =>
          arena.agisci(utente.id, azioneDalCorpo(richiesta.corpo), adesso()),
        );
        return { stato: 200, corpo: { partita: vista } };
      },
    },

    {
      metodo: 'POST',
      schema: '/online/partita/abbandono',
      gestore: async (richiesta) => {
        const utente = await esigiUtente(archivio, richiesta);
        arena.abbandona(utente.id);
        return { stato: 200, corpo: { partita: arena.vista(utente.id) } };
      },
    },

    {
      metodo: 'GET',
      schema: '/online/flusso',
      gestore: async (richiesta) => {
        const utente = await esigiUtente(archivio, richiesta);
        return {
          stato: 200,
          flusso: {
            avvia(invia) {
              // Il flusso aperto E' la presenza: finche' regge, il giocatore
              // e' al tavolo. Quando cade, parte il conto dei trenta secondi.
              arena.presente(utente.id, adesso());
              const stacca = arena.ascolta(utente.id, (avviso) => {
                invia(avviso.tipo, { avviso, partita: arena.vista(utente.id) });
              });
              // Primo evento subito: il client non deve chiedere due volte.
              invia('stato', { avviso: { tipo: 'stato' }, partita: arena.vista(utente.id) });

              return () => {
                stacca();
                arena.assente(utente.id, adesso());
              };
            },
          },
        };
      },
    },
  ];
}
