import type { IndiceGiocatore, StatoPartita } from './types.ts';

/**
 * OCCULTAMENTO DELLO STATO.
 *
 * Lo stato del motore contiene tutto: anche la mano e il mazzo dell'avversario.
 * Va benissimo dentro al server, che e' l'arbitro, ma spedirlo cosi' com'e' al
 * client regalerebbe la mano avversaria a chiunque apra gli strumenti per
 * sviluppatori. Non servirebbe nemmeno barare: basterebbe guardare.
 *
 * Qui le carte che il giocatore non deve vedere diventano segnaposto. Il
 * NUMERO resta - quante carte ha in mano, quante nel mazzo - perche' quello
 * e' informazione pubblica: si vede anche a un tavolo vero.
 */
export const CARTA_COPERTA = '???';

export function occulta<T extends StatoPartita>(stato: T, perChi: IndiceGiocatore): T {
  const copia = structuredClone(stato);
  const altro = (1 - perChi) as IndiceGiocatore;
  const avversario = copia.giocatori[altro];

  avversario.mano = avversario.mano.map(() => CARTA_COPERTA);
  avversario.mazzo = avversario.mazzo.map(() => CARTA_COPERTA);

  // Anche il proprio mazzo si copre: l'ordine delle carte non ancora pescate
  // e' gia' deciso, e conoscerlo significherebbe sapere cosa si pesca.
  copia.giocatori[perChi].mazzo = copia.giocatori[perChi].mazzo.map(() => CARTA_COPERTA);

  // Il registro racconta anche le pescate dell'avversario: va ripulito, o
  // basterebbe leggerlo per ricostruire la sua mano carta per carta.
  copia.log = copia.log.map((voce) =>
    voce.tipo === 'pescata' && voce.giocatore === altro
      ? { ...voce, cartaId: CARTA_COPERTA }
      : voce,
  );

  return copia;
}
