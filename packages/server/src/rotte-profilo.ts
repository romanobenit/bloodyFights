import { CONFIG, copieMassime } from '@bloodyfights/motore';
import type { Archivio, MazzoSalvato, Utente } from './archivio.ts';
import { utenteDalToken } from './identita.ts';
import { ErroreHttp, type Richiesta, type Rotta } from './http.ts';

/**
 * PROFILO: COLLEZIONE E MAZZI.
 *
 * Una asimmetria voluta: i MAZZI si scrivono, la COLLEZIONE no.
 *
 * Un mazzo e' una scelta fra le carte che possiedi, e farla e' affare del
 * giocatore: il server controlla solo che le carte ci siano davvero. La
 * collezione invece cambia solo per tre motivi - la dotazione iniziale, una
 * carta approvata, un baule aperto - e tutti e tre passano dal server. Se
 * esistesse una rotta per scriverla, darsi le venti carte leggendarie della
 * community sarebbe una riga di fetch dalla console.
 */

/** Quanti mazzi puo' salvare un utente (proposta del cap. 12). */
export const MAZZI_MASSIMI = 3;

function profiloPubblico(utente: Utente) {
  return {
    collezione: utente.collezione,
    mazzi: utente.mazzi,
    mazzoAttivoId: utente.mazzoAttivoId,
    oro: utente.oro,
  };
}

/**
 * Controlla i mazzi che arrivano dal client.
 *
 * Non pretende che siano completi: si salva anche un mazzo a meta' mentre lo
 * si costruisce. Pretende che le carte siano possedute, perche' quello e' il
 * punto in cui un client modificato proverebbe a passare.
 */
export function verificaMazzi(grezzi: unknown, collezione: Record<string, number>): MazzoSalvato[] {
  if (!Array.isArray(grezzi)) throw new ErroreHttp('Mazzi mancanti');
  if (grezzi.length > MAZZI_MASSIMI)
    throw new ErroreHttp(`Non puoi avere piu di ${MAZZI_MASSIMI} mazzi`);

  return grezzi.map((grezzo, indice) => {
    const m = grezzo as Partial<MazzoSalvato> | undefined;
    if (!m || typeof m.id !== 'string' || typeof m.nome !== 'string')
      throw new ErroreHttp(`Mazzo ${indice + 1}: id o nome mancante`);
    if (!m.carte || typeof m.carte !== 'object')
      throw new ErroreHttp(`Mazzo ${indice + 1}: carte mancanti`);

    const carte: Record<string, number> = {};
    let totale = 0;

    for (const [cartaId, quante] of Object.entries(m.carte)) {
      if (!Number.isInteger(quante) || (quante as number) < 0)
        throw new ErroreHttp(`Mazzo ${indice + 1}: quantita non valida per ${cartaId}`);
      if ((quante as number) === 0) continue;

      const possedute = collezione[cartaId] ?? 0;
      if ((quante as number) > possedute)
        throw new ErroreHttp(
          `Mazzo ${indice + 1}: ${cartaId} ne hai ${possedute}, ne metti ${quante}`,
        );

      carte[cartaId] = quante as number;
      totale += quante as number;
    }

    if (totale > CONFIG.mazzo.carteNelMazzo)
      throw new ErroreHttp(
        `Mazzo ${indice + 1}: ${totale} carte, il massimo e ${CONFIG.mazzo.carteNelMazzo}`,
      );

    return { id: m.id, nome: m.nome.slice(0, 40), carte };
  });
}

export function rotteProfilo(archivio: Archivio): Rotta[] {
  async function esigiUtente(richiesta: Richiesta) {
    const utente = await utenteDalToken(archivio, richiesta.token);
    if (!utente) throw new ErroreHttp('Devi accedere', 401);
    return utente;
  }

  return [
    {
      metodo: 'GET',
      schema: '/profilo',
      gestore: async (richiesta) => ({
        stato: 200,
        corpo: { profilo: profiloPubblico(await esigiUtente(richiesta)) },
      }),
    },

    {
      metodo: 'PUT',
      schema: '/profilo/mazzi',
      gestore: async (richiesta) => {
        const utente = await esigiUtente(richiesta);
        const corpo = richiesta.corpo as { mazzi?: unknown; mazzoAttivoId?: unknown } | undefined;
        const mazzi = verificaMazzi(corpo?.mazzi, utente.collezione);

        const attivo = typeof corpo?.mazzoAttivoId === 'string' ? corpo.mazzoAttivoId : '';
        if (attivo && !mazzi.some((m) => m.id === attivo))
          throw new ErroreHttp('Il mazzo attivo non e fra quelli mandati');

        const aggiornato = await archivio.modifica((dati) => {
          const u = dati.utenti.find((x) => x.id === utente.id);
          if (!u) throw new ErroreHttp('Utente sconosciuto', 401);
          u.mazzi = mazzi;
          u.mazzoAttivoId = attivo || mazzi[0]?.id || '';
          return profiloPubblico(u);
        });

        return { stato: 200, corpo: { profilo: aggiornato } };
      },
    },
  ];
}

/** Riesportata perche' il client la usa per lo stesso controllo, in anticipo. */
export { copieMassime };
