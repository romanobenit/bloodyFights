import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CARTE_BASE, CONFIG } from '@bloodyfights/motore';
import { barraNavigazione, disegnaPagina, type ContestoPagine, type Pagina } from '../src/pagine.ts';
import { profiloIniziale, togliDalMazzo, mazzoAttivo, type Profilo } from '../src/profilo.ts';

function contesto(parziale: Partial<ContestoPagine> = {}): ContestoPagine {
  const profilo = parziale.profilo ?? profiloIniziale(CARTE_BASE, 'Benito');
  return {
    pagina: 'mazzo',
    profilo,
    mazzo: mazzoAttivo(profilo)!,
    catalogo: CARTE_BASE,
    filtro: 'tutti',
    messaggio: '',
    duraturo: true,
    urlSprite: (id) => `sprite:${id}`,
    ...parziale,
  };
}

describe('navigazione', () => {
  test('la pagina corrente e segnalata, le altre no', () => {
    const html = barraNavigazione('mazzo');
    assert.match(html, /data-pagina="mazzo"/);
    assert.equal((html.match(/class="voce corrente"/g) ?? []).length, 1);
    assert.match(html, /href="#profilo"/);
  });

  test('ogni voce porta a un indirizzo semplice, senza percorsi', () => {
    for (const p of ['gioca', 'mazzo', 'profilo', 'tutorial'] as Pagina[]) {
      assert.match(barraNavigazione(p), new RegExp(`href="#${p}"`));
    }
    assert.doesNotMatch(barraNavigazione('gioca'), /href="#\//);
  });
});

describe('editor del mazzo', () => {
  test('la collezione mostra tutte le carte, ognuna cliccabile', () => {
    const html = disegnaPagina(contesto());
    assert.equal((html.match(/data-aggiungi="/g) ?? []).length, CARTE_BASE.length);
  });

  test('il filtro riduce la collezione a un solo elemento', () => {
    const html = disegnaPagina(contesto({ filtro: 'petrolio' }));
    assert.equal((html.match(/data-aggiungi="/g) ?? []).length, 4, 'le carte petrolio sono 4');
  });

  test('il filtro per tipo funziona come quello per elemento', () => {
    const html = disegnaPagina(contesto({ filtro: 'support' }));
    assert.equal((html.match(/data-aggiungi="/g) ?? []).length, 3);
  });

  test('il conteggio dice quante carte ci sono sulle venti', () => {
    const html = disegnaPagina(contesto());
    assert.match(html, /<span class="numero">20<\/span> \/ 20 carte/);
    assert.match(html, /class="conteggio completo"/);
  });

  test('un mazzo da 20 carte valide si dichiara giocabile e si puo attivare', () => {
    const html = disegnaPagina(contesto());
    assert.match(html, /Mazzo giocabile/);
    assert.match(html, /data-azione="attiva-mazzo"/);
  });

  test('un mazzo incompleto elenca cosa non va, e non si attiva', () => {
    const profilo = profiloIniziale(CARTE_BASE, 'Benito');
    const mazzo = togliDalMazzo(mazzoAttivo(profilo)!, 'base-01').mazzo;
    const html = disegnaPagina(contesto({ profilo, mazzo }));
    assert.match(html, /class="esito-mazzo non-valido"/);
    assert.match(html, /20 carte/);
    assert.doesNotMatch(html, /Mazzo giocabile/);
  });

  test('la curva dei costi ha una colonna per ciascuna fascia', () => {
    const html = disegnaPagina(contesto());
    assert.equal((html.match(/class="colonna-curva"/g) ?? []).length, 5);
  });

  test('ogni carta nel mazzo si puo togliere con un clic', () => {
    const html = disegnaPagina(contesto());
    assert.equal((html.match(/data-togli="/g) ?? []).length, 20);
  });

  test('il filtro oggetto mostra le carte oggetto', () => {
    const html = disegnaPagina(contesto({ filtro: 'oggetto' }));
    assert.equal((html.match(/data-aggiungi="/g) ?? []).length, 1);
    assert.match(html, /Goccia di Sangue/);
  });

  test('una carta esaurita in collezione e segnalata', () => {
    // Nel mazzo iniziale c'e' una copia di ciascuna e se ne possiedono due:
    // nessuna e' esaurita. Togliendo una carta dalla collezione lo diventa.
    const base = profiloIniziale(CARTE_BASE, 'Benito');
    const profilo: Profilo = { ...base, collezione: { ...base.collezione, 'base-01': 1 } };
    const html = disegnaPagina(contesto({ profilo }));
    assert.match(html, /carta-collezione esaurita/);
  });

  test('il nome del mazzo e modificabile', () => {
    assert.match(disegnaPagina(contesto()), /data-campo="nome-mazzo"/);
  });
});

describe('profilo', () => {
  test('mostra le statistiche contate', () => {
    const base = profiloIniziale(CARTE_BASE, 'Benito');
    const profilo: Profilo = { ...base, vittorie: 3, sconfitte: 1 };
    const html = disegnaPagina(contesto({ pagina: 'profilo', profilo }));
    assert.match(html, /Vittorie<\/dt><dd class="vita">3/);
    assert.match(html, /75%/, 'la percentuale e calcolata');
  });

  test('senza partite giocate la percentuale non e zero ma un trattino', () => {
    const html = disegnaPagina(contesto({ pagina: 'profilo' }));
    assert.match(html, /Percentuale<\/dt><dd class="costo">-</);
  });

  test('dice dove stanno i dati, e cambia discorso se non durano', () => {
    const durevole = disegnaPagina(contesto({ pagina: 'profilo', duraturo: true }));
    assert.match(durevole, /Nel tuo browser/);
    const volatile = disegnaPagina(contesto({ pagina: 'profilo', duraturo: false }));
    assert.match(volatile, /riparte da zero/);
  });

  test('un nickname ostile viene reso innocuo', () => {
    const base = profiloIniziale(CARTE_BASE);
    const profilo: Profilo = { ...base, nickname: '"><script>cattivo()</script>' };
    const html = disegnaPagina(contesto({ pagina: 'profilo', profilo }));
    assert.doesNotMatch(html, /<script>cattivo/);
    assert.match(html, /&lt;script&gt;/);
  });
});

describe('tutorial', () => {
  test('spiega le quattro fasi nell ordine', () => {
    const html = disegnaPagina(contesto({ pagina: 'tutorial' }));
    const posizioni = ['1. Evocazione', '2. Riposizionamento', '3. Support', '4. Attacco'].map((f) =>
      html.indexOf(f),
    );
    assert.ok(posizioni.every((i) => i >= 0), 'ci sono tutte e quattro');
    assert.deepEqual(posizioni, [...posizioni].sort((a, b) => a - b), 'in ordine');
  });

  test('mostra la catena elementale e i tabellini di esempio', () => {
    const html = disegnaPagina(contesto({ pagina: 'tutorial' }));
    assert.match(html, /latte &rarr; veleno &rarr; acqua &rarr; fuoco &rarr; petrolio/);
    assert.ok((html.match(/class="schema"/g) ?? []).length >= 3);
  });

  test('i numeri vengono dalla configurazione, non riscritti a mano', () => {
    const html = disegnaPagina(contesto({ pagina: 'tutorial' }));
    assert.match(html, new RegExp(`${CONFIG.tabellone.vitaGiocatore} punti vita`));
    assert.match(html, new RegExp(`fino a\\s+${CONFIG.economia.tettoGocce}`));
  });

  test('si chiude con un invito a giocare', () => {
    assert.match(disegnaPagina(contesto({ pagina: 'tutorial' })), /data-pagina="gioca"/);
  });
});
