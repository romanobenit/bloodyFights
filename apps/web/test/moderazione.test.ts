import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { CartaCreata } from '../src/editor.ts';
import {
  MOTIVI_RIFIUTO, SCORCIATOIE, approva, coda, comandoDaTasto, paginaModerazione, revoca,
  rifiuta, testoDelMotivo, type ContestoModerazione, type Decisione,
} from '../src/moderazione.ts';

function carta(parziale: Partial<CartaCreata> = {}): CartaCreata {
  return {
    nome: 'Bestia di Prova', descrizione: 'Una bestia come tante.', tipo: 'mischia', elemento: 'sangue', vita: 4, attacco: 3,
    potenza: 8, costo: 2, rarita: 'comune', pixels: 'A'.repeat(684),
    stato: 'pending', inviataIl: '2026-11-05', ...parziale,
  };
}

function contesto(parziale: Partial<ContestoModerazione> = {}): ContestoModerazione {
  return {
    coda: [carta()],
    decisioni: [],
    giudicate: [],
    creatore: 'Benito',
    messaggio: '',
    ...parziale,
  };
}

describe('la coda', () => {
  test('contiene solo le carte in attesa', () => {
    const tutte = [carta(), carta({ nome: 'Approvata', stato: 'approved' }), carta({ nome: 'Scartata', stato: 'rejected' })];
    assert.deepEqual(coda(tutte).map((c) => c.nome), ['Bestia di Prova']);
  });

  test('e ordinata per data: chi ha aspettato di piu passa prima', () => {
    const tutte = [
      carta({ nome: 'Terza', inviataIl: '2026-11-07' }),
      carta({ nome: 'Prima', inviataIl: '2026-11-01' }),
      carta({ nome: 'Seconda', inviataIl: '2026-11-04' }),
    ];
    assert.deepEqual(coda(tutte).map((c) => c.nome), ['Prima', 'Seconda', 'Terza']);
  });

  test('non modifica l elenco ricevuto', () => {
    const tutte = [carta({ nome: 'B', inviataIl: '2026-11-09' }), carta({ nome: 'A', inviataIl: '2026-11-01' })];
    const copia = structuredClone(tutte);
    coda(tutte);
    assert.deepEqual(tutte, copia);
  });
});

describe('decisioni', () => {
  test('approvare cambia lo stato e lascia una voce nel registro', () => {
    const esito = approva(carta(), 'Benito', '2026-11-06');
    assert.equal(esito.carta.stato, 'approved');
    assert.equal(esito.decisione.esito, 'approved');
    assert.equal(esito.decisione.creatore, 'Benito');
    assert.equal(esito.decisione.motivo, undefined);
  });

  test('rifiutare richiede un motivo, e lo conserva sulla carta', () => {
    const esito = rifiuta(carta(), 'plagio', 'Benito', '2026-11-06');
    assert.equal(esito.carta.stato, 'rejected');
    assert.equal(esito.carta.motivoRifiuto, 'plagio');
    assert.equal(esito.decisione.motivo, 'plagio');
  });

  test('approvare una carta prima rifiutata ne cancella il motivo', () => {
    const rifiutata = rifiuta(carta(), 'nome', 'Benito', '2026-11-06').carta;
    assert.equal(approva(rifiutata, 'Benito', '2026-11-07').carta.motivoRifiuto, undefined);
  });

  test('i motivi sono i quattro del documento', () => {
    assert.deepEqual(
      MOTIVI_RIFIUTO.map((m) => m.testo),
      ['Contenuto offensivo', 'Plagio di un personaggio esistente', 'Disegno illeggibile', 'Nome inadeguato'],
    );
    assert.equal(testoDelMotivo('plagio'), 'Plagio di un personaggio esistente');
  });

  test('le funzioni non toccano la carta ricevuta', () => {
    const originale = carta();
    const copia = structuredClone(originale);
    approva(originale, 'Benito', '2026-11-06');
    rifiuta(originale, 'nome', 'Benito', '2026-11-06');
    assert.deepEqual(originale, copia);
  });
});

describe('revoca di una decisione sbagliata', () => {
  test('rimette la carta in coda e toglie il motivo', () => {
    const esito = rifiuta(carta(), 'illeggibile', 'Benito', '2026-11-06');
    const dopo = revoca(esito.carta, [esito.decisione]);
    assert.equal(dopo.carta.stato, 'pending');
    assert.equal(dopo.carta.motivoRifiuto, undefined);
  });

  test('la decisione resta nel registro, segnata come revocata', () => {
    const esito = rifiuta(carta(), 'illeggibile', 'Benito', '2026-11-06');
    const dopo = revoca(esito.carta, [esito.decisione]);
    assert.equal(dopo.decisioni.length, 1, 'il registro non si accorcia');
    assert.equal(dopo.decisioni[0].revocata, true);
  });

  test('revoca solo l ultima decisione non gia revocata', () => {
    const vecchie: Decisione[] = [
      { cartaId: 'Bestia di Prova', nomeCarta: 'Bestia di Prova', creatore: 'B', esito: 'rejected', motivo: 'nome', quando: '2026-11-01', revocata: true },
      { cartaId: 'Bestia di Prova', nomeCarta: 'Bestia di Prova', creatore: 'B', esito: 'rejected', motivo: 'plagio', quando: '2026-11-05' },
    ];
    const dopo = revoca(carta({ stato: 'rejected' }), vecchie);
    assert.equal(dopo.decisioni[1].revocata, true);
    assert.equal(dopo.decisioni[0].revocata, true, 'quella gia revocata resta com era');
  });

  test('senza decisioni da revocare non cambia niente', () => {
    const originale = carta({ stato: 'approved' });
    const dopo = revoca(originale, []);
    assert.equal(dopo.carta, originale);
  });
});

describe('scorciatoie da tastiera', () => {
  test('A approva, Z revoca, le cifre scelgono il motivo', () => {
    assert.deepEqual(comandoDaTasto('a'), { tipo: 'approva' });
    assert.deepEqual(comandoDaTasto('A'), { tipo: 'approva' });
    assert.deepEqual(comandoDaTasto('z'), { tipo: 'revoca' });
    assert.deepEqual(comandoDaTasto('1'), { tipo: 'rifiuta', motivo: 'offensivo' });
    assert.deepEqual(comandoDaTasto('4'), { tipo: 'rifiuta', motivo: 'nome' });
  });

  test('ogni motivo ha la sua cifra, e nessuna cifra avanza', () => {
    for (const [i, motivo] of MOTIVI_RIFIUTO.entries()) {
      assert.deepEqual(comandoDaTasto(String(i + 1)), { tipo: 'rifiuta', motivo: motivo.id });
    }
    assert.equal(comandoDaTasto(String(MOTIVI_RIFIUTO.length + 1)), null);
  });

  test('i tasti senza significato non fanno niente', () => {
    for (const tasto of ['q', 'Enter', ' ', '0', 'Escape', '']) {
      assert.equal(comandoDaTasto(tasto), null, `tasto ${tasto}`);
    }
  });

  test('le scorciatoie dichiarate corrispondono a quelle gestite', () => {
    assert.deepEqual(SCORCIATOIE.map((s) => s.tasto), ['A', '1-4', 'Z']);
  });
});

describe('pannello', () => {
  test('mostra la prima carta della coda con tutto cio che serve per giudicare', () => {
    const html = paginaModerazione(contesto());
    assert.match(html, /Bestia di Prova/);
    assert.match(html, /Benito/, 'il creatore');
    assert.match(html, /Potenza<\/dt><dd>8/);
    assert.match(html, /data-anteprima/, 'l anteprima del disegno');
    assert.match(html, /#1 in coda/);
  });

  test('offre approvazione e tutti i motivi di rifiuto', () => {
    const html = paginaModerazione(contesto());
    assert.match(html, /data-approva="si"/);
    for (const m of MOTIVI_RIFIUTO) assert.match(html, new RegExp(`data-rifiuta="${m.id}"`));
  });

  test('i tasti sono scritti sui pulsanti: si imparano usandoli', () => {
    const html = paginaModerazione(contesto());
    assert.match(html, /<span class="tasto">A<\/span> Approva/);
    assert.match(html, /<span class="tasto">1<\/span>/);
  });

  test('a coda vuota lo dice, senza mostrare pulsanti di decisione', () => {
    const html = paginaModerazione(contesto({ coda: [] }));
    assert.match(html, /Niente da revisionare/);
    assert.doesNotMatch(html, /data-approva/);
  });

  test('il registro elenca le decisioni, piu recente in cima', () => {
    const decisioni: Decisione[] = [
      { cartaId: 'A', nomeCarta: 'Prima', creatore: 'B', esito: 'approved', quando: '2026-11-01' },
      { cartaId: 'B', nomeCarta: 'Seconda', creatore: 'B', esito: 'rejected', motivo: 'nome', quando: '2026-11-05' },
    ];
    const html = paginaModerazione(contesto({ decisioni }));
    assert.ok(html.indexOf('Seconda') < html.indexOf('Prima'), 'la piu recente viene prima');
    assert.match(html, /Nome inadeguato/);
  });

  test('una decisione revocata resta visibile e segnata', () => {
    const decisioni: Decisione[] = [
      { cartaId: 'A', nomeCarta: 'Ripescata', creatore: 'B', esito: 'rejected', motivo: 'plagio', quando: '2026-11-01', revocata: true },
    ];
    const html = paginaModerazione(contesto({ decisioni }));
    assert.match(html, /class="revocata"/);
    assert.match(html, /Ripescata/);
    assert.match(html, /<em>revocata<\/em>/);
  });

  test('una carta gia giudicata si puo rimettere in coda', () => {
    const giudicata = carta({ stato: 'rejected', motivoRifiuto: 'plagio' });
    const decisioni: Decisione[] = [
      { cartaId: giudicata.nome, nomeCarta: giudicata.nome, creatore: 'B', esito: 'rejected', motivo: 'plagio', quando: '2026-11-05' },
    ];
    const html = paginaModerazione(contesto({ coda: [], giudicate: [giudicata], decisioni }));
    assert.match(html, /data-revoca=/);
    assert.match(html, /Plagio di un personaggio esistente/);
  });

  test('senza decisioni da revocare la sezione non compare', () => {
    assert.doesNotMatch(paginaModerazione(contesto()), /data-revoca=/);
  });

  test('dichiara che la coda e locale e che non valida niente', () => {
    const html = paginaModerazione(contesto());
    assert.match(html, /coda di questo browser/);
    assert.match(html, /riservato ai moderatori/);
  });

  test('i nomi delle carte sono resi innocui', () => {
    const html = paginaModerazione(contesto({ coda: [carta({ nome: '<script>x()</script>' })] }));
    assert.doesNotMatch(html, /<script>x\(\)/);
  });
});
