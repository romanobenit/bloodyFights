import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { ElementoBase, installaDomFinto, type Impalcatura } from './dom-finto.ts';

/**
 * Verifica il collegamento fra i clic e le azioni del motore caricando
 * davvero main.ts. Non prova l'aspetto: prova che premendo una carta e poi
 * una casella la carta finisca in campo, e che il bot giochi il suo turno.
 */
let impalcatura: Impalcatura;

before(async () => {
  impalcatura = installaDomFinto(0); // Math.random = 0 -> comincio io
  await import('../src/main.ts');
});

function html(): string {
  return impalcatura.radice.innerHTML;
}

function clicca(dataset: Record<string, string>): void {
  impalcatura.radice.scatena('click', new ElementoBase('button', dataset));
}

describe('avvio', () => {
  test('la pagina viene disegnata al caricamento', () => {
    assert.match(html(), /class="partita"/);
    assert.equal((html().match(/data-casella="/g) ?? []).length, 16);
  });

  test('la mano iniziale e di 5 carte: 4 piu la pescata del turno', () => {
    assert.equal((html().match(/data-mano="/g) ?? []).length, 5);
  });

  test('nessuna carta in campo prima di giocare', () => {
    assert.doesNotMatch(html(), /class="carta /);
  });
});

describe('una mossa completa', () => {
  test('scegliere una carta dalla mano la segnala come scelta', () => {
    clicca({ mano: '0' });
    assert.match(html(), /carta-mano scelta/);
    assert.match(html(), /scegli la casella/);
  });

  test('con una carta scelta le caselle libere si accendono', () => {
    assert.equal((html().match(/slot bersagliabile/g) ?? []).length, 8);
  });

  test('cliccare una casella evoca la carta', () => {
    clicca({ giocatore: '0', casella: '0' });
    assert.match(html(), /FRESCA/, 'la carta evocata entra fresca');
    assert.doesNotMatch(html(), /carta-mano scelta/, 'la selezione si azzera');
    assert.equal((html().match(/data-mano="/g) ?? []).length, 4, 'la mano cala di una carta');
  });

  test('cliccare una casella senza aver scelto una carta lo dice', () => {
    clicca({ giocatore: '0', casella: '1' });
    assert.match(html(), /Scegli prima una carta dalla mano/);
  });

  test('non si puo agire sullo schieramento avversario', () => {
    clicca({ giocatore: '1', casella: '0' });
    assert.match(html(), /solo sul tuo schieramento/);
  });

  test('una mossa illegale mostra il messaggio del motore, non rompe la pagina', () => {
    clicca({ mano: '0' });
    clicca({ giocatore: '0', casella: '0' }); // casella gia occupata
    assert.match(html(), /occupata/);
    assert.match(html(), /class="partita"/);
  });
});

describe('passaggio del turno', () => {
  test('passando le fasi si arriva alla fase support', () => {
    clicca({ azione: 'passa' }); // -> riposizionamento
    assert.match(html(), /fase corrente">2 Riposizionamento/);
    clicca({ azione: 'passa' }); // -> support
    assert.match(html(), /fase corrente">3 Support/);
    assert.match(html(), /Attacca e passa il turno/);
  });

  test('dopo l attacco il turno passa al bot, che gioca da solo', () => {
    clicca({ azione: 'passa' }); // risolve l attacco e passa il turno
    assert.ok(impalcatura.timerInAttesa() > 0, 'il turno del bot e in coda');
    impalcatura.scorriTimer();
    assert.match(html(), /Fase 1: scegli una carta/, 'il turno torna a me');
  });

  test('il bot ha schierato qualcosa', () => {
    const carteInCampo = (html().match(/class="carta /g) ?? []).length;
    assert.ok(carteInCampo >= 2, `carte in campo: ${carteInCampo}`);
  });

  test('il registro racconta cosa e successo', () => {
    assert.match(html(), /class="registro"/);
    assert.match(html(), /Turno \d/);
  });
});

describe('nuova partita', () => {
  test('il bottone riporta a un tabellone vuoto', () => {
    clicca({ azione: 'nuova' });
    impalcatura.scorriTimer();
    assert.match(html(), /class="partita"/);
    assert.equal((html().match(/data-casella="/g) ?? []).length, 16);
  });
});

describe('animazioni nel ciclo di gioco', () => {
  test('evocare accende l animazione sulla casella giusta', () => {
    clicca({ mano: '0' });
    clicca({ giocatore: '0', casella: '3' });
    assert.match(html(), /data-casella="3"[^>]*>/);
    assert.match(html(), /class="slot appare[^"]*" data-giocatore="0" data-casella="3"/);
  });

  test('scaduta l animazione la classe sparisce', () => {
    impalcatura.scorriTimer();
    assert.doesNotMatch(html(), /\bappare\b/);
    assert.match(html(), /class="partita"/, 'la pagina resta disegnata');
  });

  test('un turno intero con attacco si conclude e torna a me', () => {
    clicca({ azione: 'passa' }); // riposizionamento
    clicca({ azione: 'passa' }); // support
    clicca({ azione: 'passa' }); // attacco, poi tocca al bot
    const eseguiti = impalcatura.scorriTimer(500);
    assert.ok(eseguiti > 0, 'il sequenziatore ha lavorato');
    assert.equal(impalcatura.timerInAttesa(), 0, 'nessun timer resta appeso');
    assert.match(html(), /Fase 1: scegli una carta/, 'il turno e tornato a me');
    assert.doesNotMatch(html(), /\bimpatto\b/, 'nessuna animazione rimasta accesa');
  });
});

describe('navigazione fra le pagine', () => {
  test('dalla partita si passa all editor del mazzo', () => {
    clicca({ pagina: 'mazzo' });
    assert.match(html(), /class="voce corrente"/);
    assert.match(html(), /data-aggiungi="base-01"/);
    assert.doesNotMatch(html(), /data-casella="/, 'il tabellone non e piu a schermo');
  });

  test('il mazzo di partenza e gia pieno: aggiungere viene rifiutato', () => {
    clicca({ aggiungi: 'base-01' });
    assert.match(html(), /gia' 20 carte|gia 20 carte/);
  });

  test('togliere e rimettere una carta riporta il conto a venti', () => {
    clicca({ togli: 'base-05' });
    assert.match(html(), /<span class="numero">19<\/span>/);
    clicca({ aggiungi: 'base-05' });
    assert.match(html(), /<span class="numero">20<\/span>/);
    assert.match(html(), /Mazzo giocabile/);
  });

  test('il filtro restringe la collezione', () => {
    clicca({ filtro: 'fuoco' });
    assert.equal((html().match(/data-aggiungi="/g) ?? []).length, 3);
    clicca({ filtro: 'tutti' });
    assert.equal((html().match(/data-aggiungi="/g) ?? []).length, 21, '20 creature piu la carta oggetto');
  });

  test('un secondo mazzo si crea vuoto e si puo riempire', () => {
    clicca({ azione: 'nuovo-mazzo' });
    assert.match(html(), /<span class="numero">0<\/span>/);
    clicca({ aggiungi: 'base-19' });
    assert.match(html(), /<span class="numero">1<\/span>/);
    assert.match(html(), /class="esito-mazzo non-valido"/, 'un mazzo da 1 carta non e giocabile');
  });

  test('il profilo mostra le statistiche', () => {
    clicca({ pagina: 'profilo' });
    assert.match(html(), /Statistiche/);
    assert.match(html(), /data-campo="nickname"/);
  });

  test('il tutorial spiega le fasi', () => {
    clicca({ pagina: 'tutorial' });
    assert.match(html(), /1\. Evocazione/);
    assert.match(html(), /4\. Attacco/);
  });

  test('si torna alla partita e il tabellone e ancora li', () => {
    clicca({ pagina: 'gioca' });
    assert.equal((html().match(/data-casella="/g) ?? []).length, 16);
    assert.match(html(), /class="partita"/);
  });
});

describe('editor di carte', () => {
  test('la pagina offre tela, strumenti e statistiche', () => {
    clicca({ pagina: 'crea' });
    assert.match(html(), /data-tela/);
    assert.equal((html().match(/data-colore="/g) ?? []).length, 16);
    assert.equal((html().match(/data-vita="/g) ?? []).length, 10);
  });

  test('scegliere uno strumento e un colore li segnala', () => {
    clicca({ strumento: 'secchiello' });
    assert.match(html(), /class="filtro corrente"\s+data-strumento="secchiello"/);
    clicca({ colore: '9' });
    assert.match(html(), /class="colore corrente"\s+data-colore="9"/);
  });

  test('scegliere latte fa scendere la vita a cinque da sola', () => {
    clicca({ vita: '9' });
    assert.match(html(), /class="tacca corrente"\s+data-vita="9"/);
    clicca({ elemento: 'latte' });
    assert.match(html(), /class="tacca corrente"\s+data-vita="5"/);
    assert.match(html(), /data-vita="6"\s+disabled/);
  });

  test('una combinazione oltre il tetto blocca l invio e spiega cosa fare', () => {
    clicca({ elemento: 'petrolio' });
    clicca({ tipo: 'distanza' });
    clicca({ vita: '10' });
    clicca({ attacco: '10' });
    assert.match(html(), /Oltre il tetto/);
    assert.match(html(), /data-azione="invia-carta"\s+disabled/);
  });

  test('rientrando nel tetto ricompaiono costo e rarita', () => {
    clicca({ vita: '5' });
    clicca({ attacco: '4' });
    assert.doesNotMatch(html(), /Oltre il tetto/);
    assert.match(html(), /rarita/);
  });

  test('senza disegno l invio resta bloccato', () => {
    // Il nome si digita, la tela no: finche e vuota non si invia.
    assert.match(html(), /tela e ancora vuota/);
    assert.match(html(), /data-azione="invia-carta"\s+disabled/);
  });

  test('si torna al gioco e il tabellone e intatto', () => {
    clicca({ pagina: 'gioca' });
    assert.equal((html().match(/data-casella="/g) ?? []).length, 16);
  });
});

describe('il rilascio del dito fuori dalla tela non ridisegna', () => {
  test('un pointerup senza tratto in corso lascia la pagina ferma', () => {
    // Difetto vero: il gestore del rilascio sta su tutta la pagina e
    // ridisegnava a ogni clic. Il browser emette il `click` solo se
    // l'elemento premuto esiste ancora al rilascio: ridisegnando fra i due
    // eventi, ogni pulsante dell'editor smetteva di rispondere.
    clicca({ pagina: 'crea' });
    const prima = impalcatura.ridisegni();
    impalcatura.radice.scatena('pointerup', new ElementoBase('button', { colore: '4' }));
    assert.equal(impalcatura.ridisegni(), prima, 'nessun ridisegno');
  });

  test('e i pulsanti continuano a rispondere dopo il rilascio', () => {
    impalcatura.radice.scatena('pointerup', new ElementoBase('button', { colore: '4' }));
    clicca({ colore: '6' });
    assert.match(html(), /class="colore corrente"\s+data-colore="6"/);
    impalcatura.radice.scatena('pointerup', new ElementoBase('button', { strumento: 'linea' }));
    clicca({ strumento: 'linea' });
    assert.match(html(), /class="filtro corrente"\s+data-strumento="linea"/);
  });

  test('piu rilasci di fila non accumulano niente nella cronologia', () => {
    for (let i = 0; i < 5; i++) {
      impalcatura.radice.scatena('pointerup', new ElementoBase('div', {}));
    }
    assert.match(html(), /data-azione="annulla"\s+disabled/, 'niente da annullare');
  });
});

/** Tela finta: ha solo cio che main.ts usa davvero di un canvas. */
class TelaFinta extends ElementoBase {
  constructor() {
    super('canvas', { tela: '' });
  }
  hasAttribute(nome: string): boolean {
    return nome === 'data-tela';
  }
  setPointerCapture(): void {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 384, height: 384 };
  }
  getContext() {
    return {
      createImageData: (l: number, a: number) => ({ data: new Uint8ClampedArray(l * a * 4) }),
      putImageData: () => undefined,
    };
  }
}

describe('dal disegno alla moderazione', () => {
  const tela = new TelaFinta();

  test('un tratto sulla tela sblocca l invio', () => {
    clicca({ pagina: 'crea' });
    assert.match(html(), /tela e ancora vuota/);

    // 384 px per 32 pixel: dodici px a pixel. (60,60) cade sul pixel (5,5).
    impalcatura.radice.scatena('pointerdown', tela, { clientX: 60, clientY: 60, pointerId: 1 });
    impalcatura.radice.scatena('pointermove', tela, { clientX: 96, clientY: 96, pointerId: 1 });
    impalcatura.radice.scatena('pointerup', tela, { pointerId: 1 });

    assert.doesNotMatch(html(), /tela e ancora vuota/);
    assert.doesNotMatch(html(), /data-azione="annulla"\s+disabled/, 'c e qualcosa da annullare');
  });

  test('senza descrizione l invio resta bloccato', () => {
    // L'elemento finto non ha `value`: lo si impone come farebbe il campo vero.
    const nome = Object.assign(new ElementoBase('input', { campo: 'nome-carta' }), {
      value: 'Bestia di Prova',
    });
    impalcatura.radice.scatena('input', nome);
    assert.match(html(), /Manca la descrizione/);
    assert.match(html(), /data-azione="invia-carta"\s+disabled/);
  });

  test('con nome e descrizione la carta si puo inviare', () => {
    const descrizione = Object.assign(new ElementoBase('textarea', { campo: 'descrizione-carta' }), {
      value: 'Una bestia come tante, ma piu arrabbiata.',
    });
    impalcatura.radice.scatena('input', descrizione);
    assert.doesNotMatch(html(), /data-azione="invia-carta"\s+disabled/);

    clicca({ azione: 'invia-carta' });
    assert.match(html(), /in moderazione/);
    assert.match(html(), /Bestia di Prova/);
  });

  test('la carta compare nella coda di revisione', () => {
    clicca({ pagina: 'moderazione' });
    assert.match(html(), /Coda di revisione - 1 carta/);
    assert.match(html(), /#1 in coda/);
    assert.match(html(), /data-approva="si"/);
  });

  test('rifiutarla la toglie dalla collezione e restituisce il tentativo', () => {
    clicca({ rifiuta: 'plagio' });
    assert.match(html(), /rifiutata/i);
    assert.match(html(), /Coda di revisione - 0 carte/);
    assert.match(html(), /Plagio di un personaggio esistente/);

    clicca({ pagina: 'mazzo' });
    assert.doesNotMatch(html(), /data-aggiungi="utente-1"/, 'non e piu nella collezione');
  });

  test('il creatore vede il motivo e puo rifarla', () => {
    clicca({ pagina: 'crea' });
    assert.match(html(), /Rifiutata:/);
    assert.match(html(), /data-azione="rifai-carta"/);
  });

  test('revocare il rifiuto rimette la carta in coda', () => {
    clicca({ pagina: 'moderazione' });
    clicca({ revoca: 'Bestia di Prova' });
    assert.match(html(), /Coda di revisione - 1 carta/);
    assert.match(html(), /class="revocata"/, 'la decisione resta nel registro');
  });

  test('la tastiera approva senza toccare il mouse', () => {
    impalcatura.scatenaGlobale('keydown', { key: 'a' });
    assert.match(html(), /approvata/);
    assert.match(html(), /Coda di revisione - 0 carte/);
  });

  test('una carta approvata non si rifa', () => {
    clicca({ pagina: 'crea' });
    assert.match(html(), /approvata/);
    assert.doesNotMatch(html(), /data-azione="rifai-carta"/);
  });

  test('un tasto senza significato non combina niente', () => {
    clicca({ pagina: 'moderazione' });
    const prima = impalcatura.ridisegni();
    impalcatura.scatenaGlobale('keydown', { key: 'q' });
    assert.equal(impalcatura.ridisegni(), prima);
  });
});

describe('la carta oggetto nel mazzo', () => {
  test('e nella collezione e si puo mettere nel mazzo', () => {
    clicca({ pagina: 'mazzo' });
    clicca({ filtro: 'oggetto' });
    assert.equal((html().match(/data-aggiungi="/g) ?? []).length, 1);
    assert.match(html(), /Goccia di Sangue/);
  });

  test('su un mazzo pieno va prima fatto spazio', () => {
    // Si apre esplicitamente il primo mazzo: i test precedenti ne hanno
    // creato un secondo, e dipendere da quale sia aperto li renderebbe fragili.
    clicca({ mazzo: 'mazzo-1' });
    clicca({ filtro: 'tutti' });
    assert.match(html(), /<span class="numero">20<\/span>/, 'il primo mazzo e pieno');

    clicca({ aggiungi: 'base-21' });
    assert.match(html(), /gia' 20 carte|gia 20 carte/);
  });

  test('fatto spazio, la carta oggetto entra e il mazzo resta giocabile', () => {
    clicca({ togli: 'base-20' });
    clicca({ aggiungi: 'base-21' });
    assert.match(html(), /data-togli="base-21"/, 'ora e nel mazzo');
    assert.match(html(), /<span class="numero">20<\/span>/);
    assert.match(html(), /Mazzo giocabile/);
  });

  test('la curva dei costi la conta nella fascia zero', () => {
    // Costa 0: non rientra nelle cinque colonne da 1 a 5, e non deve
    // comparire come se costasse 1.
    assert.equal((html().match(/class="colonna-curva"/g) ?? []).length, 5);
  });
});
