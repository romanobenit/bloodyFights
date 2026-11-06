import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, calcolaPotenza } from '@bloodyfights/motore';
import {
  PALETTE, STRUMENTI, cronologiaIniziale, disegnaPixel, registra, telaCorrente, telaPiena,
} from '@bloodyfights/pixel';
import {
  applicaStrumento, bozzaIniziale, esaminaBozza, normalizzaBozza, paginaEditor,
  suggerimentoPerRientrare, vitaMassimaPer, type Bozza, type CartaCreata,
} from '../src/editor.ts';

/** Bozza con la tela gia' sporcata: una tela vuota non e' inviabile. */
function bozzaDisegnata(parziale: Partial<Bozza> = {}): Bozza {
  const base = bozzaIniziale();
  return {
    ...base,
    nome: 'Bestia di Prova',
    descrizione: 'Una bestia come tante, ma piu arrabbiata.',
    cronologia: registra(base.cronologia, disegnaPixel(telaCorrente(base.cronologia), { x: 4, y: 4 }, 5)),
    ...parziale,
  };
}

describe('strumenti collegati alla tela', () => {
  const vuota = cronologiaIniziale();

  test('la matita dipinge con il colore scelto', () => {
    const tela = applicaStrumento('matita', { x: 1, y: 1 }, { x: 1, y: 1 }, telaCorrente(vuota), 9);
    assert.equal(tela[1 * 32 + 1], 9);
  });

  test('la gomma dipinge con il fondo, qualunque colore sia scelto', () => {
    let tela = disegnaPixel(telaCorrente(vuota), { x: 2, y: 2 }, 9);
    tela = applicaStrumento('gomma', { x: 2, y: 2 }, { x: 2, y: 2 }, tela, 9);
    assert.equal(telaPiena(tela), false);
  });

  test('il contagocce non modifica la tela', () => {
    const tela = disegnaPixel(telaCorrente(vuota), { x: 3, y: 3 }, 7);
    assert.equal(applicaStrumento('contagocce', { x: 0, y: 0 }, { x: 3, y: 3 }, tela, 1), tela);
  });

  test('il secchiello parte dal punto di arrivo, non da quello di partenza', () => {
    // Durante un trascinamento il punto che conta e' dove si rilascia.
    const tela = applicaStrumento('secchiello', { x: 0, y: 0 }, { x: 10, y: 10 }, telaCorrente(vuota), 6);
    assert.equal(tela[10 * 32 + 10], 6);
  });

  test('ogni strumento dichiarato e gestito', () => {
    for (const s of STRUMENTI) {
      assert.doesNotThrow(
        () => applicaStrumento(s.id, { x: 1, y: 1 }, { x: 5, y: 5 }, telaCorrente(vuota), 4),
        s.id,
      );
    }
  });
});

describe('vincoli sulle statistiche', () => {
  test('scegliendo latte la vita scende da sola al massimo consentito', () => {
    const bozza = normalizzaBozza({ ...bozzaIniziale(), vita: 9, elemento: 'latte' });
    assert.equal(bozza.vita, CONFIG.carte.vitaMaxLatte);
    assert.equal(vitaMassimaPer('latte'), 5);
    assert.equal(vitaMassimaPer('fuoco'), 10);
  });

  test('con un altro elemento la vita non viene toccata', () => {
    const bozza = { ...bozzaIniziale(), vita: 9, elemento: 'fuoco' as const };
    assert.equal(normalizzaBozza(bozza), bozza, 'stesso oggetto: nessuna modifica inutile');
  });
});

describe('esame della bozza', () => {
  test('una tela vuota blocca l invio', () => {
    const esito = esaminaBozza({ ...bozzaIniziale(), nome: 'Qualcosa' });
    assert.equal(esito.inviabile, false);
    assert.match(esito.errori.join(' '), /tela e ancora vuota/);
  });

  test('senza nome non si invia', () => {
    const esito = esaminaBozza(bozzaDisegnata({ nome: '  ' }));
    assert.equal(esito.inviabile, false);
    assert.match(esito.errori.join(' '), /nome/i);
  });

  test('una bozza completa e valida si puo inviare, con costo e rarita', () => {
    const esito = esaminaBozza(bozzaDisegnata());
    assert.equal(esito.inviabile, true, esito.errori.join('; '));
    assert.equal(esito.costo, 2); // 4 vita + 3 atk + 1 sangue = 8
    assert.equal(esito.rarita, 'comune');
    assert.equal(esito.oltreIlTetto, false);
  });

  test('oltre il tetto non c e ne costo ne rarita', () => {
    const esito = esaminaBozza(bozzaDisegnata({ vita: 10, attacco: 10, elemento: 'petrolio', tipo: 'distanza' }));
    assert.equal(esito.oltreIlTetto, true);
    assert.equal(esito.costo, null);
    assert.equal(esito.rarita, null);
    assert.equal(esito.inviabile, false);
  });
});

describe('suggerimento per rientrare nel tetto', () => {
  test('non dice niente a una carta gia valida', () => {
    assert.equal(suggerimentoPerRientrare(bozzaDisegnata()), '');
  });

  test('per una carta a distanza conviene togliere attacco', () => {
    const bozza = bozzaDisegnata({ tipo: 'distanza', vita: 8, attacco: 9, elemento: 'petrolio' });
    // 8 + 13,5 + 2 = 23,5: eccesso 3,5, che sull attacco costa 3 punti e sulla vita 4.
    assert.match(suggerimentoPerRientrare(bozza), /attacco di 3/);
  });

  test('il suggerimento riporta davvero dentro il tetto', () => {
    const bozza = bozzaDisegnata({ tipo: 'distanza', vita: 8, attacco: 9, elemento: 'petrolio' });
    const quanti = Number(suggerimentoPerRientrare(bozza).match(/di (\d+)/)![1]);
    const corretta = { vita: bozza.vita, attacco: bozza.attacco - quanti, tipo: bozza.tipo, elemento: bozza.elemento };
    assert.ok(calcolaPotenza(corretta) <= CONFIG.carte.potenzaMax);
  });
});

describe('pagina dell editor', () => {
  const pagina = (b: Bozza = bozzaDisegnata()) => paginaEditor({ bozza: b, gia: null, messaggio: '' });

  test('c e la tela, e una sola', () => {
    assert.equal((pagina().match(/data-tela/g) ?? []).length, 1);
    assert.match(pagina(), /width="32" height="32"/);
  });

  test('la tavolozza ha esattamente sedici colori', () => {
    const html = pagina();
    assert.equal((html.match(/data-colore="/g) ?? []).length, 16);
    assert.equal((html.match(/data-colore="/g) ?? []).length, PALETTE.length);
  });

  test('ci sono tutti gli strumenti del documento', () => {
    const html = pagina();
    for (const s of STRUMENTI) assert.match(html, new RegExp(`data-strumento="${s.id}"`));
    for (const azione of ['annulla', 'ripeti', 'specchia', 'svuota']) {
      assert.match(html, new RegExp(`data-azione="${azione}"`));
    }
  });

  test('annulla e disattivato quando non c e niente da annullare', () => {
    const html = paginaEditor({ bozza: bozzaIniziale(), gia: null, messaggio: '' });
    assert.match(html, /data-azione="annulla"\s+disabled/);
  });

  test('i selettori coprono gli intervalli del documento', () => {
    const html = pagina();
    assert.equal((html.match(/data-vita="/g) ?? []).length, 10, 'vita da 1 a 10');
    assert.equal((html.match(/data-attacco="/g) ?? []).length, 11, 'attacco da 0 a 10');
    assert.equal((html.match(/data-tipo="/g) ?? []).length, 3);
    assert.equal((html.match(/data-elemento="/g) ?? []).length, 6);
  });

  test('con il latte le tacche oltre cinque sono bloccate', () => {
    const html = pagina(bozzaDisegnata({ elemento: 'latte', vita: 5 }));
    assert.match(html, /data-vita="6"\s+disabled/);
    assert.doesNotMatch(html, /data-vita="5"\s+disabled/);
    assert.match(html, /si fermano a 5 punti vita/);
  });

  test('per un support l attacco si chiama cura', () => {
    assert.match(pagina(bozzaDisegnata({ tipo: 'support' })), /<span class="etichetta">Cura<\/span>/);
    assert.match(pagina(bozzaDisegnata({ tipo: 'mischia' })), /<span class="etichetta">Attacco<\/span>/);
  });

  test('la barra di potenza cambia colore secondo la fascia', () => {
    assert.match(pagina(bozzaDisegnata({ vita: 4, attacco: 3 })), /barra-riempimento verde/);
    assert.match(pagina(bozzaDisegnata({ vita: 9, attacco: 8 })), /barra-riempimento gialla/);
    assert.match(pagina(bozzaDisegnata({ vita: 10, attacco: 10 })), /barra-riempimento rossa/);
  });

  test('oltre il tetto l invio e bloccato e si dice cosa abbassare', () => {
    const html = pagina(bozzaDisegnata({ vita: 10, attacco: 10 }));
    assert.match(html, /data-azione="invia-carta"\s+disabled/);
    assert.match(html, /Oltre il tetto/);
    assert.match(html, /Abbassa/);
  });

  test('il conto della potenza e mostrato voce per voce', () => {
    const html = pagina(bozzaDisegnata({ tipo: 'distanza', vita: 5, attacco: 6, elemento: 'fuoco' }));
    assert.match(html, /class="scomposizione"/);
    assert.match(html, /6 x 1,5/, 'il peso della distanza e spiegato');
    assert.match(html, /Elemento fuoco/);
  });

  test('una bozza valida sblocca il pulsante di invio', () => {
    assert.doesNotMatch(pagina(), /data-azione="invia-carta"\s+disabled/);
  });

  test('il nome viene reso innocuo', () => {
    const html = pagina(bozzaDisegnata({ nome: '<script>x()</script>' }));
    assert.doesNotMatch(html, /<script>x\(\)/);
  });
});

describe('carta gia inviata', () => {
  const carta: CartaCreata = {
    nome: 'Bestia di Prova',
    descrizione: 'Una bestia come tante, ma piu arrabbiata.', tipo: 'mischia', elemento: 'sangue', vita: 4, attacco: 3,
    potenza: 8, costo: 2, rarita: 'comune', pixels: 'A'.repeat(684),
    stato: 'pending', inviataIl: '2026-11-05',
  };

  test('al posto dell editor si vede lo stato in moderazione', () => {
    const html = paginaEditor({ bozza: bozzaIniziale(), gia: carta, messaggio: '' });
    assert.match(html, /in moderazione/);
    assert.match(html, /Bestia di Prova/);
    assert.doesNotMatch(html, /data-strumento/, 'non si disegna piu');
    assert.doesNotMatch(html, /data-azione="invia-carta"/);
  });

  test('spiega perche la revisione e manuale', () => {
    const html = paginaEditor({ bozza: bozzaIniziale(), gia: carta, messaggio: '' });
    assert.match(html, /occhio umano/);
  });
});
