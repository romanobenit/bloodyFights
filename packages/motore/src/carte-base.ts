import { completaCarta } from './costo.ts';
import type { CartaCompleta, DefinizioneCarta } from './types.ts';

/**
 * Le 20 carte iniziali (cap. 6), piu' la prima carta oggetto.
 * Potenza, costo e rarita' NON sono scritti qui: si ricalcolano dalla
 * formula, cosi' cambiare un peso in CONFIG ribilancia automaticamente tutto.
 *
 * La descrizione non incide sul costo: e' presentazione, non statistica.
 */
const CREATURE: DefinizioneCarta[] = [
  { id: 'base-01', nome: 'Topo di Fogna',         tipo: 'mischia',  elemento: 'sangue',   vita: 2,  attacco: 2,  creatoreId: null,
    descrizione: 'Vive dove l acqua si ferma. Morde prima di guardare.' },
  { id: 'base-02', nome: 'Goccia Randagia',       tipo: 'mischia',  elemento: 'acqua',    vita: 3,  attacco: 1,  creatoreId: null,
    descrizione: 'Caduta da una grondaia e mai piu tornata indietro.' },
  { id: 'base-03', nome: 'Spora Tossica',         tipo: 'mischia',  elemento: 'veleno',   vita: 1,  attacco: 3,  creatoreId: null,
    descrizione: 'Si rompe al primo colpo. Quello che esce resta nell aria.' },
  { id: 'base-04', nome: 'Secchio di Latte',      tipo: 'mischia',  elemento: 'latte',    vita: 5,  attacco: 1,  creatoreId: null,
    descrizione: 'Pesante, lento, difficile da rovesciare.' },
  { id: 'base-05', nome: 'Fiammifero Vivo',       tipo: 'distanza', elemento: 'fuoco',    vita: 2,  attacco: 3,  creatoreId: null,
    descrizione: 'Brucia da lontano finche ha testa. Poi non serve piu.' },
  { id: 'base-06', nome: 'Mungitrice',            tipo: 'support',  elemento: 'latte',    vita: 4,  attacco: 2,  creatoreId: null,
    descrizione: 'Lavora prima dell alba. Tiene in piedi chi combatte.' },
  { id: 'base-07', nome: 'Zanna Nera',            tipo: 'mischia',  elemento: 'petrolio', vita: 3,  attacco: 3,  creatoreId: null,
    descrizione: 'Morde e lascia una macchia che non va piu via.' },
  { id: 'base-08', nome: 'Sanguisuga',            tipo: 'mischia',  elemento: 'sangue',   vita: 4,  attacco: 3,  creatoreId: null,
    descrizione: 'Non molla finche non ha preso quello per cui e venuta.' },
  { id: 'base-09', nome: 'Ranocchio Velenoso',    tipo: 'mischia',  elemento: 'veleno',   vita: 4,  attacco: 4,  creatoreId: null,
    descrizione: 'Piccolo, colorato, e nessuno lo tocca due volte.' },
  { id: 'base-10', nome: 'Arciere di Sale',       tipo: 'distanza', elemento: 'acqua',    vita: 4,  attacco: 4,  creatoreId: null,
    descrizione: 'Tira da dietro. Le ferite che lascia bruciano a lungo.' },
  { id: 'base-11', nome: 'Guaritrice di Sangue',  tipo: 'support',  elemento: 'sangue',   vita: 5,  attacco: 3,  creatoreId: null,
    descrizione: 'Rimette in piedi i suoi col sangue di qualcun altro.' },
  { id: 'base-12', nome: 'Cavaliere di Pece',     tipo: 'mischia',  elemento: 'petrolio', vita: 6,  attacco: 4,  creatoreId: null,
    descrizione: 'L armatura cola. Dove passa, il terreno resta nero.' },
  { id: 'base-13', nome: 'Serpe di Fuoco',        tipo: 'mischia',  elemento: 'fuoco',    vita: 5,  attacco: 6,  creatoreId: null,
    descrizione: 'Colpisce una volta sola. Di solito basta.' },
  { id: 'base-14', nome: 'Sputaveleno',           tipo: 'distanza', elemento: 'veleno',   vita: 5,  attacco: 4,  creatoreId: null,
    descrizione: 'Mira agli occhi e non sbaglia quasi mai.' },
  { id: 'base-15', nome: 'Balestriere di Pece',   tipo: 'distanza', elemento: 'petrolio', vita: 6,  attacco: 5,  creatoreId: null,
    descrizione: 'Un colpo per volta, e il colpo arriva ovunque.' },
  { id: 'base-16', nome: 'Lattaia Eterna',        tipo: 'support',  elemento: 'latte',    vita: 5,  attacco: 7,  creatoreId: null,
    descrizione: 'Versa da un secchio che nessuno ha mai visto vuotarsi.' },
  { id: 'base-17', nome: "Idra d'Acqua",          tipo: 'mischia',  elemento: 'acqua',    vita: 8,  attacco: 7,  creatoreId: null,
    descrizione: 'Tagliane una parte: dal taglio ne esce dell altra.' },
  { id: 'base-18', nome: 'Torre di Fiamma',       tipo: 'distanza', elemento: 'fuoco',    vita: 5,  attacco: 6,  creatoreId: null,
    descrizione: 'Non si muove. Non ne ha bisogno.' },
  { id: 'base-19', nome: 'Colosso di Sangue',     tipo: 'mischia',  elemento: 'sangue',   vita: 10, attacco: 8,  creatoreId: null,
    descrizione: 'Tutto quello che e stato versato, in piedi e arrabbiato.' },
  { id: 'base-20', nome: 'Leviatano di Petrolio', tipo: 'distanza', elemento: 'petrolio', vita: 6,  attacco: 7,  creatoreId: null,
    descrizione: 'Sale dal fondo. L acqua sopra di lui non torna pulita.' },
];

/**
 * Carte oggetto: si giocano dalla mano, hanno effetto subito e non occupano
 * nessuna casella. Costano 0 e non passano dalla formula del costo, quindi
 * non si possono creare dall'editor: non esisterebbe un tetto a frenarle.
 */
const OGGETTI: DefinizioneCarta[] = [
  { id: 'base-21', nome: 'Goccia di Sangue', tipo: 'oggetto', elemento: 'sangue', vita: 0, attacco: 0,
    creatoreId: null, effetto: 'goccia',
    descrizione: 'Una goccia, subito, in qualunque fase del tuo turno.' },
];

export const CARTE_BASE: readonly CartaCompleta[] = [...CREATURE, ...OGGETTI].map(completaCarta);

export const CARTE_BASE_PER_ID: ReadonlyMap<string, CartaCompleta> = new Map(
  CARTE_BASE.map((c) => [c.id, c]),
);

/**
 * Un mazzo legale da 20 carte: una copia di ciascuna creatura.
 * Le carte oggetto restano fuori: il mazzo deve avere esattamente 20 carte, e
 * questo e' il mazzo con cui gioca il bot.
 */
export function mazzoBaseCompleto(): string[] {
  return CREATURE.map((c) => c.id);
}
