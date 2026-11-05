import { CARTE_BASE, mazzoBaseCompleto } from '../src/carte-base.ts';
import { creaPartita, type StatoPartitaConCatalogo } from '../src/motore.ts';
import { casella } from '../src/tabellone.ts';
import type { CartaInCampo, Elemento, IndiceGiocatore, TipoCarta } from '../src/types.ts';

/** Partita di prova con tabelloni vuoti e chi inizia deciso dal test. */
export function scenario(
  opzioni: { primo?: IndiceGiocatore; seme?: number } = {},
): StatoPartitaConCatalogo {
  return creaPartita({
    idGiocatori: ['A', 'B'],
    mazzi: [mazzoBaseCompleto(), mazzoBaseCompleto()],
    carte: CARTE_BASE,
    seme: opzioni.seme ?? 12345,
    primoGiocatore: opzioni.primo ?? 0,
  });
}

let contatore = 0;

/** Piazza una carta sul tabellone, scavalcando l'evocazione: solo per i test. */
export function metti(
  stato: StatoPartitaConCatalogo,
  giocatore: IndiceGiocatore,
  linea: 0 | 1,
  colonna: number,
  carta: {
    tipo: TipoCarta;
    elemento: Elemento;
    vita: number;
    attacco: number;
    vitaMax?: number;
    fresca?: boolean;
    nome?: string;
  },
): CartaInCampo {
  contatore += 1;
  const istanza: CartaInCampo = {
    uid: `t${contatore}`,
    cartaId: `test-${contatore}`,
    nome: carta.nome ?? `Prova ${contatore}`,
    tipo: carta.tipo,
    elemento: carta.elemento,
    vita: carta.vita,
    vitaMax: carta.vitaMax ?? carta.vita,
    attacco: carta.attacco,
    costo: 1,
    fresca: carta.fresca ?? false,
    haAgito: false,
  };
  stato.giocatori[giocatore].tabellone[casella(linea, colonna)] = istanza;
  return istanza;
}

/** Svuota la mano e le gocce, per isolare la fase sotto test. */
export function vaiAFase(
  stato: StatoPartitaConCatalogo,
  fase: 'evocazione' | 'riposizionamento' | 'support',
): void {
  stato.fase = fase;
}

export function cartaIn(
  stato: StatoPartitaConCatalogo,
  giocatore: IndiceGiocatore,
  linea: 0 | 1,
  colonna: number,
): CartaInCampo | null {
  return stato.giocatori[giocatore].tabellone[casella(linea, colonna)];
}
