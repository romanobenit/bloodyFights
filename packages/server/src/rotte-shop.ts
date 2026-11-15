import type { Archivio } from './archivio.ts';
import { BAULI, apriBaule } from './bauli.ts';
import { ErroreCarta } from './carte.ts';
import { utenteDalToken } from './identita.ts';
import { ErroreHttp, type Richiesta, type Rotta } from './http.ts';

/**
 * LE ROTTE DELLO SHOP.
 *
 * Il listino e' pubblico: chi non si e' ancora iscritto deve poter vedere
 * cosa costa un baule e che probabilita' ha, senza prima dare un indirizzo
 * email. Le probabilita' pubblicate sono anche un obbligo, per i contenuti a
 * estrazione casuale (cap. 8.2).
 *
 * L'apertura invece passa dall'account, e il risultato lo decide il server.
 */

export interface OpzioniShop {
  archivio: Archivio;
  casuale?: (max: number) => number;
  nuovoId?: () => string;
  adesso?: () => string;
}

export function rotteShop(opzioni: OpzioniShop): Rotta[] {
  const { archivio } = opzioni;

  return [
    {
      metodo: 'GET',
      schema: '/bauli',
      gestore: () => ({ stato: 200, corpo: { bauli: BAULI } }),
    },

    {
      metodo: 'POST',
      schema: '/bauli/:id/apertura',
      gestore: async (richiesta: Richiesta) => {
        const utente = await utenteDalToken(archivio, richiesta.token);
        if (!utente) throw new ErroreHttp('Devi accedere', 401);

        try {
          const apertura = await apriBaule(opzioni, utente.id, richiesta.parametri.id);
          return { stato: 200, corpo: { apertura } };
        } catch (errore) {
          if (errore instanceof ErroreCarta) throw new ErroreHttp(errore.message, errore.stato);
          throw errore;
        }
      },
    },
  ];
}
