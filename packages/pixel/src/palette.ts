import type { Elemento } from '@bloodyfights/motore';

/**
 * PALETTE FISSA DEL GIOCO - 16 colori, un indice da 0 a 15 per pixel.
 *
 * Il cap. 7.1 delle specifiche chiede "16 colori: nero, bianco osso, quattro
 * rossi, e tre toni per ciascun elemento": quei conti fanno 24 slot, non 16.
 * Qui i 16 sono spesi cosi': 4 neutri, 4 rossi (l'accento del gioco), 6 toni
 * elementali uno per elemento, 2 toni intermedi condivisi per le ombre e le
 * luci. Da confermare prima di aprire l'editor al pubblico: cambiare la
 * palette dopo invalida i disegni gia' salvati, perche' ogni pixel e' un
 * indice in QUESTA tabella, non un colore.
 *
 * Perche' un indice e non un colore: 32x32 = 1024 pixel a 4 bit = 512 byte,
 * circa 684 caratteri base64. Una colonna di testo nel database invece di un
 * file PNG per carta.
 */
export const PALETTE: readonly string[] = [
  '#0A0A0A', //  0 nero            fondo
  '#151515', //  1 grigio carbone  pannelli
  '#8E8882', //  2 grigio          testo secondario
  '#E9E5DF', //  3 bianco osso     testo
  '#D81E2C', //  4 rosso sangue    accento
  '#FF3B47', //  5 rosso vivo      accento chiaro
  '#6E0D15', //  6 rosso cupo      ombre solide
  '#3A070C', //  7 rosso bruno     ombra profonda
  '#F2EFE4', //  8 latte
  '#6FA82A', //  9 veleno
  '#2E6FA8', // 10 acqua
  '#E8701A', // 11 fuoco
  '#2B2440', // 12 petrolio
  '#8E1220', // 13 sangue
  '#4A4440', // 14 ombra media     condiviso
  '#B5AFA8', // 15 luce media      condiviso
];

export const DIMENSIONE_TELA = 32;
export const PIXEL_PER_TELA = DIMENSIONE_TELA * DIMENSIONE_TELA;
export const BYTE_PER_TELA = PIXEL_PER_TELA / 2; // due pixel per byte

/** Indice nella palette del tono proprio di ciascun elemento. */
export const INDICE_ELEMENTO: Record<Elemento, number> = {
  latte: 8,
  veleno: 9,
  acqua: 10,
  fuoco: 11,
  petrolio: 12,
  sangue: 13,
};

/** Colori dell'identita' visiva (cap. 2), per la UI fuori dalla tela. */
export const COLORI = {
  fondo: PALETTE[0],
  pannello: PALETTE[1],
  testoSecondario: PALETTE[2],
  testo: PALETTE[3],
  accento: PALETTE[4],
  accentoChiaro: PALETTE[5],
  accentoScuro: PALETTE[6],
} as const;

export function coloreElemento(elemento: Elemento): string {
  return PALETTE[INDICE_ELEMENTO[elemento]];
}
