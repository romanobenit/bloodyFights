import type { Archivio } from './archivio.ts';
import {
  ErroreIdentita, accedi, esci, registra, utenteDalToken, utentePubblico,
} from './identita.ts';
import { ErroreHttp, type Richiesta, type Risposta, type Rotta } from './http.ts';

/**
 * LE ROTTE.
 *
 * Non sanno niente di Node: ricevono una Richiesta e restituiscono una
 * Risposta. Si provano chiamandole come funzioni, e si provano anche su HTTP
 * vero avviando il server - le due cose non si escludono.
 */

function campo(corpo: unknown, nome: string): string {
  const valore = (corpo as Record<string, unknown> | undefined)?.[nome];
  if (typeof valore !== 'string') throw new ErroreHttp(`Campo mancante: ${nome}`, 400);
  return valore;
}

async function esigiUtente(archivio: Archivio, richiesta: Richiesta) {
  const utente = await utenteDalToken(archivio, richiesta.token);
  if (!utente) throw new ErroreHttp('Devi accedere', 401);
  return utente;
}

/** Traduce gli errori dell'identita' in errori HTTP, conservandone lo stato. */
async function conErroriTradotti(azione: () => Promise<Risposta>): Promise<Risposta> {
  try {
    return await azione();
  } catch (errore) {
    if (errore instanceof ErroreIdentita) throw new ErroreHttp(errore.message, errore.stato);
    throw errore;
  }
}

export function rotte(archivio: Archivio): Rotta[] {
  return [
    {
      metodo: 'GET',
      schema: '/salute',
      gestore: () => ({ stato: 200, corpo: { stato: 'vivo' } }),
    },

    {
      metodo: 'POST',
      schema: '/identita/registrazione',
      gestore: (richiesta) =>
        conErroriTradotti(async () => {
          const esito = await registra(
            archivio,
            campo(richiesta.corpo, 'email'),
            campo(richiesta.corpo, 'password'),
            campo(richiesta.corpo, 'nickname'),
          );
          return { stato: 201, corpo: { token: esito.token, utente: utentePubblico(esito.utente) } };
        }),
    },

    {
      metodo: 'POST',
      schema: '/identita/accesso',
      gestore: (richiesta) =>
        conErroriTradotti(async () => {
          const esito = await accedi(
            archivio,
            campo(richiesta.corpo, 'email'),
            campo(richiesta.corpo, 'password'),
          );
          return { stato: 200, corpo: { token: esito.token, utente: utentePubblico(esito.utente) } };
        }),
    },

    {
      metodo: 'POST',
      schema: '/identita/uscita',
      gestore: async (richiesta) => {
        await esci(archivio, richiesta.token);
        // 204 anche con un token gia' scaduto: uscire deve riuscire sempre.
        return { stato: 204 };
      },
    },

    {
      metodo: 'GET',
      schema: '/identita/io',
      gestore: async (richiesta) => {
        const utente = await esigiUtente(archivio, richiesta);
        return { stato: 200, corpo: { utente: utentePubblico(utente) } };
      },
    },
  ];
}
