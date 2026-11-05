import { BYTE_PER_TELA, PALETTE, PIXEL_PER_TELA } from './palette.ts';

/**
 * Una tela e' un array di 1024 indici di palette (0-15).
 * Sul filo e nel database viaggia come 512 byte in base64.
 */
export type Tela = Uint8Array;

export function telaVuota(indiceFondo = 0): Tela {
  return new Uint8Array(PIXEL_PER_TELA).fill(indiceFondo);
}

export function codifica(tela: Tela): string {
  if (tela.length !== PIXEL_PER_TELA)
    throw new Error(`La tela deve avere ${PIXEL_PER_TELA} pixel, ne ha ${tela.length}`);

  const byte = new Uint8Array(BYTE_PER_TELA);
  for (let i = 0; i < BYTE_PER_TELA; i++) {
    const alto = tela[i * 2] & 0x0f;
    const basso = tela[i * 2 + 1] & 0x0f;
    byte[i] = (alto << 4) | basso;
  }
  return bytesInBase64(byte);
}

export function decodifica(base64: string): Tela {
  const byte = base64InBytes(base64);
  if (byte.length !== BYTE_PER_TELA)
    throw new Error(`Attesi ${BYTE_PER_TELA} byte, arrivati ${byte.length}`);

  const tela = new Uint8Array(PIXEL_PER_TELA);
  for (let i = 0; i < BYTE_PER_TELA; i++) {
    tela[i * 2] = (byte[i] >> 4) & 0x0f;
    tela[i * 2 + 1] = byte[i] & 0x0f;
  }
  return tela;
}

/** Validazione server-side di una tela ricevuta dal client. */
export function telaValida(base64: string): boolean {
  try {
    decodifica(base64);
    return true;
  } catch {
    return false;
  }
}

export function indiceInPalette(indice: number): string {
  return PALETTE[indice] ?? PALETTE[0];
}

// --- base64 senza dipendenze, uguale in Node e nel browser ----------------

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesInBase64(byte: Uint8Array): string {
  let risultato = '';
  for (let i = 0; i < byte.length; i += 3) {
    const b0 = byte[i];
    const b1 = byte[i + 1];
    const b2 = byte[i + 2];
    risultato += ALFABETO[b0 >> 2];
    risultato += ALFABETO[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    risultato += b1 === undefined ? '=' : ALFABETO[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    risultato += b2 === undefined ? '=' : ALFABETO[b2 & 0x3f];
  }
  return risultato;
}

function base64InBytes(base64: string): Uint8Array {
  const pulita = base64.replace(/=+$/, '');
  const byte: number[] = [];
  let accumulatore = 0;
  let bit = 0;
  for (const carattere of pulita) {
    const valore = ALFABETO.indexOf(carattere);
    if (valore < 0) throw new Error(`Carattere non valido in base64: ${carattere}`);
    accumulatore = (accumulatore << 6) | valore;
    bit += 6;
    if (bit >= 8) {
      bit -= 8;
      byte.push((accumulatore >> bit) & 0xff);
    }
  }
  return new Uint8Array(byte);
}
