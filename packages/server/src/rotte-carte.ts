import type { Archivio } from './archivio.ts';
import {
  ErroreCarta, carteDiUtente, catalogoApprovato, codaDiRevisione, comeCartaCompleta,
  decidiSuCarta, inviaCarta, revocaDecisione, type CartaArchiviata,
} from './carte.ts';
import { utenteDalToken } from './identita.ts';
import { ErroreHttp, type Richiesta, type Rotta } from './http.ts';

/**
 * LE ROTTE DELLE CARTE DELLA COMMUNITY.
 *
 * Chiunque legge il catalogo approvato: sono le carte del gioco, non un
 * segreto. Inviare richiede un account. Giudicare richiede di essere
 * amministratore.
 *
 * CHI E' AMMINISTRATORE lo dice l'ambiente, non il database: l'elenco degli
 * indirizzi arriva all'avvio. Promuovere qualcuno e' cambiare una variabile e
 * riavviare, e soprattutto nessuna rotta puo' promuovere se stessa - che e'
 * il modo in cui di solito un pannello di moderazione viene espugnato.
 */

export interface OpzioniCarte {
  archivio: Archivio;
  /** Indirizzi email ammessi a giudicare le carte. */
  amministratori: readonly string[];
  adesso?: () => string;
}

async function esigiUtente(archivio: Archivio, richiesta: Richiesta) {
  const utente = await utenteDalToken(archivio, richiesta.token);
  if (!utente) throw new ErroreHttp('Devi accedere', 401);
  return utente;
}

function tradotto(errore: unknown): never {
  if (errore instanceof ErroreCarta) throw new ErroreHttp(errore.message, errore.stato);
  throw errore;
}

/**
 * Quello che esce verso il client. I pixel ci sono - servono a disegnarla -
 * ma l'identificativo del creatore no: basta il suo nome, e l'id di un utente
 * non e' affare di chi apre un baule.
 */
function pubblica(carta: CartaArchiviata) {
  const completa = comeCartaCompleta(carta);
  return {
    id: carta.id,
    nome: carta.nome,
    descrizione: carta.descrizione,
    tipo: carta.tipo,
    elemento: carta.elemento,
    vita: carta.vita,
    attacco: carta.attacco,
    potenza: completa.potenza,
    costo: completa.costo,
    rarita: completa.rarita,
    pixels: carta.pixels,
    creatore: carta.creatoreNickname,
    stato: carta.stato,
    motivoRifiuto: carta.motivoRifiuto,
    inviataIl: carta.inviataIl,
  };
}

export function rotteCarte(opzioni: OpzioniCarte): Rotta[] {
  const { archivio } = opzioni;
  const ammessi = opzioni.amministratori.map((e) => e.trim().toLowerCase()).filter(Boolean);

  async function esigiAmministratore(richiesta: Richiesta) {
    const utente = await esigiUtente(archivio, richiesta);
    if (!ammessi.includes(utente.email.toLowerCase()))
      // 404 e non 403: a chi non e' moderatore il pannello non risulta
      // nemmeno esistere, cosi' non c'e' niente da sondare.
      throw new ErroreHttp('Rotta non trovata', 404);
    return utente;
  }

  return [
    {
      metodo: 'GET',
      schema: '/carte',
      gestore: async () => ({
        stato: 200,
        corpo: { carte: (await catalogoApprovato(archivio)).map(pubblica) },
      }),
    },

    {
      metodo: 'GET',
      schema: '/carte/mie',
      gestore: async (richiesta) => {
        const utente = await esigiUtente(archivio, richiesta);
        return {
          stato: 200,
          corpo: { carte: (await carteDiUtente(archivio, utente.id)).map(pubblica) },
        };
      },
    },

    {
      metodo: 'POST',
      schema: '/carte',
      gestore: async (richiesta) => {
        const utente = await esigiUtente(archivio, richiesta);
        try {
          const carta = await inviaCarta(
            archivio, utente.id, (richiesta.corpo as { carta?: unknown })?.carta, opzioni.adesso,
          );
          return { stato: 201, corpo: { carta: pubblica(carta) } };
        } catch (errore) {
          tradotto(errore);
        }
      },
    },

    {
      metodo: 'GET',
      schema: '/moderazione/coda',
      gestore: async (richiesta) => {
        await esigiAmministratore(richiesta);
        return { stato: 200, corpo: { carte: (await codaDiRevisione(archivio)).map(pubblica) } };
      },
    },

    {
      metodo: 'POST',
      schema: '/moderazione/carte/:id',
      gestore: async (richiesta) => {
        await esigiAmministratore(richiesta);
        const corpo = richiesta.corpo as { esito?: string; motivo?: string } | undefined;
        const esito = corpo?.esito;

        try {
          if (esito === 'revoca') {
            const carta = await revocaDecisione(archivio, richiesta.parametri.id);
            return { stato: 200, corpo: { carta: pubblica(carta) } };
          }
          if (esito !== 'approved' && esito !== 'rejected')
            throw new ErroreCarta("L'esito dev'essere approved, rejected o revoca");
          if (esito === 'rejected' && !corpo?.motivo)
            throw new ErroreCarta('Un rifiuto senza motivo non si puo mandare al creatore');

          const carta = await decidiSuCarta(
            archivio, richiesta.parametri.id, esito, corpo?.motivo, opzioni.adesso,
          );
          return { stato: 200, corpo: { carta: pubblica(carta) } };
        } catch (errore) {
          tradotto(errore);
        }
      },
    },
  ];
}
