import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CARTE_BASE } from '@bloodyfights/motore';
import {
  PALETTE, DIMENSIONE_TELA, PIXEL_PER_TELA, BYTE_PER_TELA, INDICE_ELEMENTO,
} from '../src/palette.ts';
import { codifica, decodifica, telaVuota, telaValida } from '../src/codifica.ts';
import { generaSegnaposto, segnapostoBase64 } from '../src/segnaposto.ts';

describe('palette', () => {
  test('esattamente 16 colori, tutti esadecimali validi', () => {
    assert.equal(PALETTE.length, 16);
    for (const colore of PALETTE) assert.match(colore, /^#[0-9A-F]{6}$/);
  });

  test('nessun colore duplicato: 16 slot sono pochi per sprecarne uno', () => {
    assert.equal(new Set(PALETTE).size, 16);
  });

  test('ogni elemento ha il suo tono e i toni sono distinti', () => {
    const indici = Object.values(INDICE_ELEMENTO);
    assert.equal(indici.length, 6);
    assert.equal(new Set(indici).size, 6);
    for (const i of indici) assert.ok(i >= 0 && i < 16);
  });
});

describe('formato di salvataggio', () => {
  test('una tela e 1024 pixel, 512 byte, 684 caratteri base64', () => {
    assert.equal(PIXEL_PER_TELA, 1024);
    assert.equal(BYTE_PER_TELA, 512);
    assert.equal(codifica(telaVuota()).length, 684);
  });

  test('andata e ritorno senza perdite su dati casuali', () => {
    const tela = telaVuota();
    for (let i = 0; i < tela.length; i++) tela[i] = i % 16;
    assert.deepEqual(decodifica(codifica(tela)), tela);
  });

  test('tutti i 16 indici sopravvivono alla codifica', () => {
    const tela = telaVuota();
    for (let i = 0; i < 16; i++) tela[i] = i;
    const ritorno = decodifica(codifica(tela));
    for (let i = 0; i < 16; i++) assert.equal(ritorno[i], i);
  });

  test('una tela della dimensione sbagliata viene rifiutata', () => {
    assert.throws(() => codifica(new Uint8Array(100)), /1024/);
    assert.equal(telaValida('troppo corta'), false);
    assert.equal(telaValida(codifica(telaVuota())), true);
  });

  test('base64 con caratteri illegali viene rifiutata', () => {
    assert.equal(telaValida('!'.repeat(684)), false);
  });
});

describe('segnaposto generati', () => {
  test('ogni carta base produce una tela valida', () => {
    for (const carta of CARTE_BASE) {
      const base64 = segnapostoBase64(carta);
      assert.equal(base64.length, 684, carta.nome);
      assert.equal(telaValida(base64), true, carta.nome);
    }
  });

  test('ogni pixel sta nella palette', () => {
    for (const carta of CARTE_BASE) {
      for (const indice of generaSegnaposto(carta)) assert.ok(indice >= 0 && indice < 16);
    }
  });

  test('deterministico: stessa carta, stesso disegno', () => {
    const carta = CARTE_BASE[0];
    assert.equal(segnapostoBase64(carta), segnapostoBase64(carta));
  });

  test('carte diverse, disegni diversi', () => {
    const disegni = new Set(CARTE_BASE.map(segnapostoBase64));
    assert.equal(disegni.size, CARTE_BASE.length, 'nessun segnaposto ripetuto fra le 20 carte');
  });

  test('ogni creatura usa il tono del proprio elemento', () => {
    for (const carta of CARTE_BASE) {
      const tela = generaSegnaposto(carta);
      const atteso = INDICE_ELEMENTO[carta.elemento];
      assert.ok(tela.includes(atteso), `${carta.nome} non usa il tono di ${carta.elemento}`);
    }
  });

  test('il disegno sta dentro i bordi della tela', () => {
    for (const carta of CARTE_BASE) {
      const tela = generaSegnaposto(carta);
      for (let x = 0; x < DIMENSIONE_TELA; x++) {
        assert.equal(tela[x], 0, `${carta.nome}: prima riga non vuota`);
        assert.equal(tela[(DIMENSIONE_TELA - 1) * DIMENSIONE_TELA + x], 0, `${carta.nome}: ultima riga`);
      }
    }
  });
});
