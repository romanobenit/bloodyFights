import { completaCarta } from './costo.ts';
import type { CartaCompleta, DefinizioneCarta } from './types.ts';

/**
 * Le 20 carte iniziali (cap. 6). Potenza, costo e rarita' NON sono scritti qui:
 * si ricalcolano dalla formula, cosi' cambiare un peso in CONFIG ribilancia
 * automaticamente tutto il set di partenza.
 */
const DEFINIZIONI: DefinizioneCarta[] = [
  { id: 'base-01', nome: 'Topo di Fogna',        tipo: 'mischia',  elemento: 'sangue',   vita: 2,  attacco: 2,  creatoreId: null },
  { id: 'base-02', nome: 'Goccia Randagia',      tipo: 'mischia',  elemento: 'acqua',    vita: 3,  attacco: 1,  creatoreId: null },
  { id: 'base-03', nome: 'Spora Tossica',        tipo: 'mischia',  elemento: 'veleno',   vita: 1,  attacco: 3,  creatoreId: null },
  { id: 'base-04', nome: 'Secchio di Latte',     tipo: 'mischia',  elemento: 'latte',    vita: 5,  attacco: 1,  creatoreId: null },
  { id: 'base-05', nome: 'Fiammifero Vivo',      tipo: 'distanza', elemento: 'fuoco',    vita: 2,  attacco: 3,  creatoreId: null },
  { id: 'base-06', nome: 'Mungitrice',           tipo: 'support',  elemento: 'latte',    vita: 4,  attacco: 2,  creatoreId: null },
  { id: 'base-07', nome: 'Zanna Nera',           tipo: 'mischia',  elemento: 'petrolio', vita: 3,  attacco: 3,  creatoreId: null },
  { id: 'base-08', nome: 'Sanguisuga',           tipo: 'mischia',  elemento: 'sangue',   vita: 4,  attacco: 3,  creatoreId: null },
  { id: 'base-09', nome: 'Ranocchio Velenoso',   tipo: 'mischia',  elemento: 'veleno',   vita: 4,  attacco: 4,  creatoreId: null },
  { id: 'base-10', nome: 'Arciere di Sale',      tipo: 'distanza', elemento: 'acqua',    vita: 4,  attacco: 4,  creatoreId: null },
  { id: 'base-11', nome: 'Guaritrice di Sangue', tipo: 'support',  elemento: 'sangue',   vita: 5,  attacco: 3,  creatoreId: null },
  { id: 'base-12', nome: 'Cavaliere di Pece',    tipo: 'mischia',  elemento: 'petrolio', vita: 6,  attacco: 4,  creatoreId: null },
  { id: 'base-13', nome: 'Serpe di Fuoco',       tipo: 'mischia',  elemento: 'fuoco',    vita: 5,  attacco: 6,  creatoreId: null },
  { id: 'base-14', nome: 'Sputaveleno',          tipo: 'distanza', elemento: 'veleno',   vita: 5,  attacco: 4,  creatoreId: null },
  { id: 'base-15', nome: 'Balestriere di Pece',  tipo: 'distanza', elemento: 'petrolio', vita: 6,  attacco: 5,  creatoreId: null },
  { id: 'base-16', nome: 'Lattaia Eterna',       tipo: 'support',  elemento: 'latte',    vita: 5,  attacco: 7,  creatoreId: null },
  { id: 'base-17', nome: "Idra d'Acqua",         tipo: 'mischia',  elemento: 'acqua',    vita: 8,  attacco: 7,  creatoreId: null },
  { id: 'base-18', nome: 'Torre di Fiamma',      tipo: 'distanza', elemento: 'fuoco',    vita: 5,  attacco: 6,  creatoreId: null },
  { id: 'base-19', nome: 'Colosso di Sangue',    tipo: 'mischia',  elemento: 'sangue',   vita: 10, attacco: 8,  creatoreId: null },
  { id: 'base-20', nome: 'Leviatano di Petrolio',tipo: 'distanza', elemento: 'petrolio', vita: 6,  attacco: 7,  creatoreId: null },
];

export const CARTE_BASE: readonly CartaCompleta[] = DEFINIZIONI.map(completaCarta);

export const CARTE_BASE_PER_ID: ReadonlyMap<string, CartaCompleta> = new Map(
  CARTE_BASE.map((c) => [c.id, c]),
);

/**
 * Un mazzo legale da 20 carte composto con le carte base: una copia di ognuna.
 * Serve ai test e al playtest della fase 1.
 */
export function mazzoBaseCompleto(): string[] {
  return CARTE_BASE.map((c) => c.id);
}
