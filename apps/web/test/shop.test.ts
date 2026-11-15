import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { paginaShop, type ContestoShop } from '../src/shop.ts';
import type { AperturaRemota, BauleRemoto } from '../src/cliente.ts';

const FERRO: BauleRemoto = {
  id: 'ferro', nome: 'Baule di Ferro', prezzoOro: 300, prezzoEuro: null,
  quanteCarte: 3, probabilita: { comune: 80, raro: 18, epico: 2 },
};
const PETROLIO: BauleRemoto = {
  id: 'petrolio', nome: 'Baule di Petrolio', prezzoOro: null, prezzoEuro: 4.99,
  quanteCarte: 5, probabilita: { comune: 50, raro: 35, epico: 13, leggendario: 2 },
  garantita: 'epico',
};

function contesto(parziale: Partial<ContestoShop> = {}): ContestoShop {
  return {
    statoShop: { tipo: 'listino' },
    bauli: [FERRO],
    oro: 1000,
    carteNelPool: 5,
    inCorso: false,
    errore: '',
    ...parziale,
  };
}

describe('listino', () => {
  test('le probabilita si pubblicano: e un obbligo, non un vezzo', () => {
    const html = paginaShop(contesto());
    assert.match(html, /80%/);
    assert.match(html, /18%/);
    assert.match(html, /2%/);
  });

  test('con abbastanza oro il baule si apre', () => {
    assert.match(paginaShop(contesto()), /data-apri-baule="ferro"(?![^>]*disabled)/);
  });

  test('senza abbastanza oro il pulsante e spento e dice quanto manca', () => {
    const html = paginaShop(contesto({ oro: 120 }));
    assert.match(html, /data-apri-baule="ferro"[^>]*disabled/);
    assert.match(html, /mancano 180/);
  });

  test('con il pool vuoto non si compra, e si spiega perche', () => {
    const html = paginaShop(contesto({ carteNelPool: 0 }));
    assert.match(html, /data-apri-baule="ferro"[^>]*disabled/);
    assert.match(html, /vuoti/i);
  });

  test('il baule a pagamento si vede ma non si compra con le Gocce', () => {
    const html = paginaShop(contesto({ bauli: [FERRO, PETROLIO] }));
    assert.match(html, /4\.99/);
    assert.match(html, /data-apri-baule="petrolio"[^>]*disabled/);
    assert.match(html, /denaro reale/i);
  });

  test('la garanzia si legge', () => {
    assert.match(paginaShop(contesto({ bauli: [PETROLIO] })), /Epico garantito/);
  });

  test('mentre si apre, il pulsante non si puo premere due volte', () => {
    const html = paginaShop(contesto({ inCorso: true }));
    assert.match(html, /data-apri-baule="ferro"[^>]*disabled/);
    assert.match(html, /Apro/);
  });

  test('si dice chiaramente che i bauli non contengono le carte base', () => {
    assert.match(paginaShop(contesto()), /non le contengono/);
  });

  test('un errore si mostra', () => {
    assert.match(paginaShop(contesto({ errore: 'Gocce insufficienti' })), /Gocce insufficienti/);
  });

  test('senza server lo shop lo dice invece di rompersi', () => {
    const html = paginaShop(contesto({ statoShop: { tipo: 'senzaServer' } }));
    assert.match(html, /non disponibile/i);
    assert.doesNotMatch(html, /data-apri-baule/);
  });

  test('senza conto manda all accesso', () => {
    const html = paginaShop(contesto({ statoShop: { tipo: 'senzaConto' } }));
    assert.match(html, /data-pagina="accesso"/);
    assert.doesNotMatch(html, /data-apri-baule/);
  });
});

const APERTURA: AperturaRemota = {
  id: 'a1', bauleId: 'ferro', prezzo: 300, oroRimasto: 725,
  apertaIl: '2026-11-15T12:00:00.000Z',
  carte: [
    { cartaId: 'c1', nome: 'Ratto', rarita: 'comune', duplicata: false, oro: 0 },
    { cartaId: 'c2', nome: 'Idra', rarita: 'epico', duplicata: false, oro: 0 },
    { cartaId: 'c1', nome: 'Ratto', rarita: 'comune', duplicata: true, oro: 25 },
  ],
};

describe('apertura', () => {
  const conScoperte = (n: number) =>
    paginaShop(contesto({ statoShop: { tipo: 'apertura', apertura: APERTURA, scoperte: n } }));

  test('all inizio sono tutte coperte', () => {
    const html = conScoperte(0);
    assert.equal((html.match(/estratta coperta/g) ?? []).length, 3);
    assert.doesNotMatch(html, /Ratto/);
  });

  test('si scoprono una alla volta', () => {
    const html = conScoperte(1);
    assert.match(html, /Ratto/);
    assert.doesNotMatch(html, /Idra/);
    assert.equal((html.match(/estratta coperta/g) ?? []).length, 2);
  });

  test('la rarita si vede sulla carta', () => {
    assert.match(conScoperte(2), /class="estratta epico[^"]*"/);
  });

  test('un duplicato mostra il rimborso, non una carta nuova', () => {
    const html = conScoperte(3);
    assert.match(html, /\+25 GO/);
    assert.match(html, /estratta comune duplicata/);
  });

  test('finche non sono tutte scoperte si puo saltare l attesa', () => {
    assert.match(conScoperte(1), /data-azione="scopri-tutto"/);
    assert.doesNotMatch(conScoperte(1), /data-azione="chiudi-apertura"/);
  });

  test('a carte scoperte si chiude, e si legge il saldo nuovo', () => {
    const html = conScoperte(3);
    assert.match(html, /data-azione="chiudi-apertura"/);
    assert.match(html, /725/);
    assert.doesNotMatch(html, /data-azione="scopri-tutto"/);
  });

  test('il totale dei rimborsi si conta solo sulle carte gia scoperte', () => {
    assert.doesNotMatch(conScoperte(2), /Duplicati rimborsati/);
    assert.match(conScoperte(3), /Duplicati rimborsati: \+25 GO/);
  });

  test('si dice che le carte erano gia decise: l animazione e teatro', () => {
    assert.match(conScoperte(1), /gia decise/);
  });

  test('un nome di carta non inietta HTML', () => {
    const cattiva: AperturaRemota = {
      ...APERTURA,
      carte: [{ cartaId: 'x', nome: '<img src=x onerror=1>', rarita: 'comune', duplicata: false, oro: 0 }],
    };
    const html = paginaShop(
      contesto({ statoShop: { tipo: 'apertura', apertura: cattiva, scoperte: 1 } }),
    );
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img/);
  });
});
