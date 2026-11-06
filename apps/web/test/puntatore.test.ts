import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { ElementoBase, installaDomFinto, type Impalcatura } from './dom-finto.ts';

/**
 * PASSARE SOPRA UNA CARTA NON LA GIOCA.
 *
 * Il gestore del `mouseover` conteneva una copia di quello del `click`: la
 * Goccia di Sangue veniva spesa appena il puntatore la sfiorava, senza che
 * nessuno avesse premuto niente. Qui si prova che sfiorare una carta oggetto
 * mostra la carta e non muove la partita.
 */
let impalcatura: Impalcatura;

before(async () => {
  impalcatura = installaDomFinto(0);
  await import('../src/main.ts');
});

function html(): string {
  return impalcatura.radice.innerHTML;
}

describe('il puntatore guarda, non gioca', () => {
  test('sfiorare una carta oggetto non prova a giocarla', () => {
    const prima = html();
    impalcatura.radice.scatena('mouseover', new ElementoBase('button', { giocaOggetto: '0' }));

    // Col difetto il motore rifiutava la mossa (la carta in mano e' una
    // creatura) e il rifiuto finiva nel messaggio in pagina.
    assert.doesNotMatch(html(), /non e una carta oggetto/i);
    assert.doesNotMatch(html(), /Gocce insufficienti/i);
    assert.doesNotMatch(html(), /Mossa non valida/i);

    // E la mano resta com'era: nessuna carta e' finita nel cimitero.
    assert.equal(
      (html().match(/data-mano="/g) ?? []).length,
      (prima.match(/data-mano="/g) ?? []).length,
      'nessuna carta deve lasciare la mano',
    );
  });

  test('sfiorare una carta della mano ne mostra il dettaglio', () => {
    impalcatura.radice.scatena('mouseover', new ElementoBase('button', { mano: '1' }));
    assert.match(html(), /class="dettaglio"/, 'il pannello deve riempirsi');
    assert.doesNotMatch(html(), /Passa il puntatore su una carta/);
  });

  test('sfiorare una casella vuota non fa niente di strano', () => {
    const prima = html();
    impalcatura.radice.scatena(
      'mouseover',
      new ElementoBase('div', { giocatore: '0', casella: '3' }),
    );
    assert.equal(html(), prima, 'una casella vuota non cambia il dettaglio');
  });
});
