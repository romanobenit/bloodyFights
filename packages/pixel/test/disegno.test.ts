import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONE_TELA } from '../src/palette.ts';
import { codifica, telaVuota } from '../src/codifica.ts';
import {
  FONDO, PASSI_CRONOLOGIA, annulla, colorePixel, cronologiaIniziale, disegnaLinea, disegnaPixel,
  disegnaRettangolo, puoAnnullare, puoRipetere, registra, riempi, ripeti, specchiaOrizzontale,
  svuota, telaCorrente, telaPiena,
} from '../src/disegno.ts';

const N = DIMENSIONE_TELA;
const conta = (tela: Uint8Array, colore: number) => tela.reduce((n, i) => n + (i === colore ? 1 : 0), 0);

describe('matita e gomma', () => {
  test('dipinge il pixel chiesto e nessun altro', () => {
    const tela = disegnaPixel(svuota(), { x: 5, y: 7 }, 4);
    assert.equal(colorePixel(tela, { x: 5, y: 7 }), 4);
    assert.equal(conta(tela, 4), 1);
  });

  test('non modifica la tela ricevuta', () => {
    const originale = svuota();
    const copia = Uint8Array.from(originale);
    disegnaPixel(originale, { x: 1, y: 1 }, 9);
    assert.deepEqual(originale, copia);
  });

  test('fuori dai bordi non succede niente, e non esplode', () => {
    const tela = svuota();
    for (const p of [{ x: -1, y: 0 }, { x: N, y: 0 }, { x: 0, y: -1 }, { x: 0, y: N }]) {
      assert.doesNotThrow(() => disegnaPixel(tela, p, 4));
      assert.equal(telaPiena(disegnaPixel(tela, p, 4)), false);
    }
  });

  test('la gomma riporta al fondo', () => {
    let tela = disegnaPixel(svuota(), { x: 3, y: 3 }, 5);
    tela = disegnaPixel(tela, { x: 3, y: 3 }, FONDO);
    assert.equal(telaPiena(tela), false);
  });
});

describe('linea', () => {
  test('una linea orizzontale tocca ogni pixel fra i due estremi', () => {
    const tela = disegnaLinea(svuota(), { x: 2, y: 10 }, { x: 8, y: 10 }, 4);
    assert.equal(conta(tela, 4), 7);
    for (let x = 2; x <= 8; x++) assert.equal(colorePixel(tela, { x, y: 10 }), 4);
  });

  test('una diagonale a 45 gradi non lascia buchi', () => {
    const tela = disegnaLinea(svuota(), { x: 0, y: 0 }, { x: 9, y: 9 }, 4);
    assert.equal(conta(tela, 4), 10);
    for (let i = 0; i <= 9; i++) assert.equal(colorePixel(tela, { x: i, y: i }), 4);
  });

  test('una linea obliqua qualsiasi resta continua', () => {
    const tela = disegnaLinea(svuota(), { x: 1, y: 2 }, { x: 20, y: 9 }, 4);
    // Continua = ogni pixel acceso ha un vicino acceso, anche in diagonale.
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (colorePixel(tela, { x, y }) !== 4) continue;
        let vicini = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          if (colorePixel(tela, { x: x + dx, y: y + dy }) === 4) vicini++;
        }
        assert.ok(vicini >= 1, `pixel isolato in ${x},${y}`);
      }
    }
  });

  test('una linea fra lo stesso punto accende un pixel solo', () => {
    assert.equal(conta(disegnaLinea(svuota(), { x: 4, y: 4 }, { x: 4, y: 4 }, 4), 4), 1);
  });

  test('disegnata al contrario produce gli stessi pixel', () => {
    const avanti = disegnaLinea(svuota(), { x: 3, y: 1 }, { x: 17, y: 12 }, 4);
    const indietro = disegnaLinea(svuota(), { x: 17, y: 12 }, { x: 3, y: 1 }, 4);
    assert.equal(codifica(avanti), codifica(indietro));
  });
});

describe('rettangolo', () => {
  test('il contorno e cavo', () => {
    const tela = disegnaRettangolo(svuota(), { x: 2, y: 2 }, { x: 6, y: 6 }, 4);
    assert.equal(colorePixel(tela, { x: 2, y: 2 }), 4, 'angolo');
    assert.equal(colorePixel(tela, { x: 4, y: 2 }), 4, 'lato');
    assert.equal(colorePixel(tela, { x: 4, y: 4 }), FONDO, 'il centro resta vuoto');
    assert.equal(conta(tela, 4), 16, 'perimetro di un 5x5');
  });

  test('pieno riempie tutto', () => {
    const tela = disegnaRettangolo(svuota(), { x: 2, y: 2 }, { x: 6, y: 6 }, 4, true);
    assert.equal(conta(tela, 4), 25);
  });

  test('gli angoli si possono dare in qualunque ordine', () => {
    const a = disegnaRettangolo(svuota(), { x: 6, y: 6 }, { x: 2, y: 2 }, 4);
    const b = disegnaRettangolo(svuota(), { x: 2, y: 2 }, { x: 6, y: 6 }, 4);
    assert.equal(codifica(a), codifica(b));
  });
});

describe('secchiello', () => {
  test('una tela vuota si riempie tutta', () => {
    const tela = riempi(svuota(), { x: 0, y: 0 }, 4);
    assert.equal(conta(tela, 4), N * N);
  });

  test('un contorno chiuso trattiene il riempimento', () => {
    let tela = disegnaRettangolo(svuota(), { x: 4, y: 4 }, { x: 10, y: 10 }, 6);
    tela = riempi(tela, { x: 7, y: 7 }, 4);
    assert.equal(conta(tela, 4), 25, 'solo l interno del 7x7');
    assert.equal(colorePixel(tela, { x: 0, y: 0 }), FONDO, 'fuori non e stato toccato');
  });

  test('una falla nel contorno fa uscire il colore', () => {
    let tela = disegnaRettangolo(svuota(), { x: 4, y: 4 }, { x: 10, y: 10 }, 6);
    tela = disegnaPixel(tela, { x: 7, y: 4 }, FONDO); // apre il bordo
    tela = riempi(tela, { x: 7, y: 7 }, 4);
    assert.ok(conta(tela, 4) > 25, 'il colore e uscito');
    assert.equal(colorePixel(tela, { x: 0, y: 0 }), 4);
  });

  test('riempire con il colore gia presente non cambia niente e non si impicca', () => {
    const tela = svuota();
    const dopo = riempi(tela, { x: 5, y: 5 }, FONDO);
    assert.equal(codifica(dopo), codifica(tela));
  });

  test('le aree separate restano separate', () => {
    let tela = disegnaRettangolo(svuota(), { x: 1, y: 1 }, { x: 5, y: 5 }, 6, true);
    tela = disegnaRettangolo(tela, { x: 20, y: 20 }, { x: 24, y: 24 }, 6, true);
    tela = riempi(tela, { x: 3, y: 3 }, 4);
    assert.equal(conta(tela, 4), 25);
    assert.equal(colorePixel(tela, { x: 22, y: 22 }), 6, 'l altra area non e cambiata');
  });
});

describe('specchia', () => {
  test('riflette in orizzontale', () => {
    const tela = specchiaOrizzontale(disegnaPixel(svuota(), { x: 0, y: 5 }, 4));
    assert.equal(colorePixel(tela, { x: N - 1, y: 5 }), 4);
    assert.equal(colorePixel(tela, { x: 0, y: 5 }), FONDO);
  });

  test('due specchiate riportano al punto di partenza', () => {
    const originale = disegnaLinea(svuota(), { x: 2, y: 3 }, { x: 11, y: 19 }, 9);
    assert.equal(codifica(specchiaOrizzontale(specchiaOrizzontale(originale))), codifica(originale));
  });
});

describe('cronologia', () => {
  test('all inizio non si puo ne annullare ne ripetere', () => {
    const c = cronologiaIniziale();
    assert.equal(puoAnnullare(c), false);
    assert.equal(puoRipetere(c), false);
  });

  test('annulla torna allo stato precedente, ripeti lo rimette', () => {
    let c = cronologiaIniziale();
    c = registra(c, disegnaPixel(telaCorrente(c), { x: 1, y: 1 }, 4));
    c = registra(c, disegnaPixel(telaCorrente(c), { x: 2, y: 2 }, 5));
    assert.equal(conta(telaCorrente(c), 5), 1);

    c = annulla(c);
    assert.equal(conta(telaCorrente(c), 5), 0);
    assert.equal(conta(telaCorrente(c), 4), 1);

    c = ripeti(c);
    assert.equal(conta(telaCorrente(c), 5), 1);
  });

  test('disegnare dopo aver annullato cancella il futuro', () => {
    let c = cronologiaIniziale();
    c = registra(c, disegnaPixel(telaCorrente(c), { x: 1, y: 1 }, 4));
    c = registra(c, disegnaPixel(telaCorrente(c), { x: 2, y: 2 }, 5));
    c = annulla(c);
    c = registra(c, disegnaPixel(telaCorrente(c), { x: 3, y: 3 }, 6));
    assert.equal(puoRipetere(c), false);
    assert.equal(conta(telaCorrente(c), 5), 0, 'il passo annullato non torna');
    assert.equal(conta(telaCorrente(c), 6), 1);
  });

  test('si conservano almeno 30 passi, come chiede il documento', () => {
    assert.ok(PASSI_CRONOLOGIA >= 30);
    let c = cronologiaIniziale();
    for (let i = 0; i < PASSI_CRONOLOGIA + 15; i++) {
      c = registra(c, disegnaPixel(telaCorrente(c), { x: i % N, y: Math.floor(i / N) }, 4));
    }
    assert.equal(c.passi.length, PASSI_CRONOLOGIA, 'i piu vecchi vengono scartati');
    let annullamenti = 0;
    while (puoAnnullare(c)) {
      c = annulla(c);
      annullamenti++;
    }
    assert.ok(annullamenti >= 30, `solo ${annullamenti} passi indietro`);
  });

  test('annullare oltre il fondo non rompe niente', () => {
    let c = cronologiaIniziale();
    for (let i = 0; i < 5; i++) c = annulla(c);
    assert.equal(c.indice, 0);
    assert.equal(telaPiena(telaCorrente(c)), false);
  });

  test('la cronologia non condivide memoria con la tela che le passi', () => {
    const tela = telaVuota();
    const c = cronologiaIniziale(tela);
    tela[0] = 9;
    assert.equal(telaCorrente(c)[0], FONDO, 'il passo registrato e una copia');
  });
});
