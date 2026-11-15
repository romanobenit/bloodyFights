import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARTE_BASE, type CartaCompleta, collezioneIniziale, mazzoIniziale, statisticheDerivate,
} from '@bloodyfights/motore';
import { codifica, telaVuota } from '@bloodyfights/pixel';
import { archivioInMemoria, datiVuoti, type Archivio, type Utente } from '../src/archivio.ts';
import { BAULI, apriBaule, bauleDa, estrai, scegliCarta, sorteggiaRarita } from '../src/bauli.ts';
import { decidiSuCarta, inviaCarta } from '../src/carte.ts';

const FERRO = bauleDa('ferro')!;
const SANGUE = bauleDa('sangue')!;
const DISEGNO = codifica(telaVuota(3));

/** Una carta della community finta, con la rarita' che serve alla prova. */
function carta(id: string, vita: number, attacco: number): CartaCompleta {
  const base = {
    id, nome: `Carta ${id}`, tipo: 'mischia' as const, elemento: 'sangue' as const,
    vita, attacco, descrizione: '', creatoreId: 'x',
  };
  return { ...base, ...statisticheDerivate(base) };
}

const COMUNE = carta('c1', 2, 2);          // P 5
const RARA = carta('r1', 5, 4);            // P ~11
const EPICA = carta('e1', 8, 7);           // P ~15,5
const LEGGENDARIA = carta('l1', 10, 8);    // P 19

describe('i bauli del documento', () => {
  test('ferro: 300 GO, 3 carte', () => {
    assert.equal(FERRO.prezzoOro, 300);
    assert.equal(FERRO.quanteCarte, 3);
  });

  test('sangue: 800 GO, 5 carte', () => {
    assert.equal(SANGUE.prezzoOro, 800);
    assert.equal(SANGUE.quanteCarte, 5);
  });

  test('le probabilita fanno cento in tutti i bauli', () => {
    for (const b of BAULI) {
      const somma = Object.values(b.probabilita).reduce((s, n) => s + n, 0);
      assert.equal(somma, 100, `${b.nome} somma ${somma}`);
    }
  });

  test('il baule a pagamento non si compra con la valuta di gioco', () => {
    assert.equal(bauleDa('petrolio')!.prezzoOro, null);
  });

  test('un baule che non esiste non esiste', () => {
    assert.equal(bauleDa('cartone'), null);
  });

  test('le rarita verificate: le carte di prova sono quelle che credo', () => {
    assert.equal(COMUNE.rarita, 'comune');
    assert.equal(RARA.rarita, 'raro');
    assert.equal(EPICA.rarita, 'epico');
    assert.equal(LEGGENDARIA.rarita, 'leggendario');
  });
});

describe('sorteggio della rarita', () => {
  /** Un dado truccato: restituisce sempre il numero che gli si dice. */
  const fisso = (n: number) => () => n;

  test('ferro: sotto 80% esce comune', () => {
    assert.equal(sorteggiaRarita(FERRO, fisso(0)), 'comune');
    assert.equal(sorteggiaRarita(FERRO, fisso(7_999)), 'comune');
  });

  test('ferro: il bordo esatto dell 80% e gia raro', () => {
    assert.equal(sorteggiaRarita(FERRO, fisso(8_000)), 'raro');
    assert.equal(sorteggiaRarita(FERRO, fisso(9_799)), 'raro');
  });

  test('ferro: l ultimo 2% e epico', () => {
    assert.equal(sorteggiaRarita(FERRO, fisso(9_800)), 'epico');
    assert.equal(sorteggiaRarita(FERRO, fisso(9_999)), 'epico');
  });

  test('ferro: non esce mai un leggendario, perche non e in tabella', () => {
    for (const n of [0, 2_500, 5_000, 8_000, 9_900, 9_999])
      assert.notEqual(sorteggiaRarita(FERRO, fisso(n)), 'leggendario');
  });

  test('sangue: le quattro fasce ai loro bordi', () => {
    assert.equal(sorteggiaRarita(SANGUE, fisso(0)), 'comune');
    assert.equal(sorteggiaRarita(SANGUE, fisso(4_999)), 'comune');
    assert.equal(sorteggiaRarita(SANGUE, fisso(5_000)), 'raro');
    assert.equal(sorteggiaRarita(SANGUE, fisso(8_499)), 'raro');
    assert.equal(sorteggiaRarita(SANGUE, fisso(8_500)), 'epico');
    assert.equal(sorteggiaRarita(SANGUE, fisso(9_799)), 'epico');
    assert.equal(sorteggiaRarita(SANGUE, fisso(9_800)), 'leggendario');
  });

  test('su molti tiri le proporzioni tornano', () => {
    let n = 0;
    const giro = (max: number) => (n++ * 7919) % max; // passo primo: copre tutto
    const conteggio: Record<string, number> = {};
    for (let i = 0; i < 10_000; i++) {
      const r = sorteggiaRarita(FERRO, giro);
      conteggio[r] = (conteggio[r] ?? 0) + 1;
    }
    assert.ok(Math.abs(conteggio.comune - 8_000) < 300, `comuni: ${conteggio.comune}`);
    assert.ok(Math.abs(conteggio.raro - 1_800) < 300, `rare: ${conteggio.raro}`);
  });
});

describe('scelta della carta nel pool', () => {
  const primo = () => 0;

  test('pesca la rarita voluta quando c e', () => {
    const pool = [COMUNE, RARA, EPICA];
    assert.equal(scegliCarta(pool, 'epico', primo)?.id, 'e1');
  });

  test('senza leggendari ripiega verso il basso, non lascia a mani vuote', () => {
    const pool = [COMUNE, RARA];
    assert.equal(scegliCarta(pool, 'leggendario', primo)?.id, 'r1', 'la piu vicina sotto');
  });

  test('se sotto non c e niente, sale', () => {
    const pool = [LEGGENDARIA];
    assert.equal(scegliCarta(pool, 'comune', primo)?.id, 'l1');
  });

  test('con il pool vuoto non si inventa niente', () => {
    assert.equal(scegliCarta([], 'comune', primo), null);
  });

  test('fra piu carte della stessa rarita sceglie a caso', () => {
    const pool = [COMUNE, carta('c2', 3, 1), carta('c3', 1, 3)];
    assert.equal(scegliCarta(pool, 'comune', () => 2)?.id, 'c3');
  });
});

describe('estrazione', () => {
  const pool = [COMUNE, RARA, EPICA, LEGGENDARIA];
  const sempreComune = (max: number) => (max === 10_000 ? 0 : 0);

  test('un baule da tre da tre carte', () => {
    assert.equal(estrai(pool, FERRO, {}, sempreComune).length, 3);
  });

  test('un baule da cinque da cinque carte', () => {
    assert.equal(estrai(pool, SANGUE, {}, sempreComune).length, 5);
  });

  test('con il pool vuoto non esce niente', () => {
    assert.deepEqual(estrai([], FERRO, {}, sempreComune), []);
  });

  test('una carta gia al massimo delle copie diventa oro', () => {
    // Una comune da 1 goccia se ne possono avere tre.
    const estratte = estrai(pool, FERRO, { c1: 3 }, sempreComune);
    assert.ok(estratte.every((e) => e.duplicata), JSON.stringify(estratte));
    assert.ok(estratte.every((e) => e.oro === 25));
  });

  test('una carta che non hai non e un duplicato', () => {
    const estratte = estrai(pool, FERRO, {}, sempreComune);
    assert.equal(estratte[0].duplicata, false);
    assert.equal(estratte[0].oro, 0);
  });

  test('le copie si contano man mano dentro lo stesso baule', () => {
    // Tre copie concesse, zero possedute: la quarta carta dello stesso tipo
    // sarebbe un duplicato. Con un baule da cinque si vede.
    const estratte = estrai(pool, SANGUE, {}, sempreComune);
    assert.deepEqual(
      estratte.map((e) => e.duplicata),
      [false, false, false, true, true],
      'le prime tre riempiono il tetto, le altre due diventano oro',
    );
  });

  test('non modifica la collezione che riceve', () => {
    const possedute = { c1: 1 };
    estrai(pool, FERRO, possedute, sempreComune);
    assert.deepEqual(possedute, { c1: 1 });
  });

  test('il baule con garanzia la onora sull ultima carta', () => {
    const conGaranzia = { ...FERRO, garantita: 'epico' as const };
    const estratte = estrai(pool, conGaranzia, {}, sempreComune);
    assert.equal(estratte[2].rarita, 'epico');
    assert.equal(estratte[0].rarita, 'comune', 'le altre restano sorteggiate');
  });

  test('se l epico e gia uscito, la garanzia non forza l ultima carta', () => {
    const conGaranzia = { ...FERRO, garantita: 'epico' as const };
    const sempreEpico = (max: number) => (max === 10_000 ? 9_900 : 0);
    const estratte = estrai(pool, conGaranzia, {}, sempreEpico);
    assert.ok(estratte.every((e) => e.rarita === 'epico'));
  });
});

// ------------------------------------------------------- apertura sul server

function utente(id: string, oro: number): Utente {
  return {
    id, email: `${id}@x.it`, impronta: '', sale: '', nickname: id, bio: '',
    oro, mmr: 1000, vittorie: 0, sconfitte: 0, cartaCreataId: null,
    collezione: collezioneIniziale(CARTE_BASE),
    mazzi: [{ id: 'mazzo-1', nome: 'Mazzo base', carte: mazzoIniziale(CARTE_BASE) }],
    mazzoAttivoId: 'mazzo-1', ultimaVittoriaIl: null,
    creatoIl: new Date(0).toISOString(), tentativiFalliti: 0, ultimoTentativo: 0,
  };
}

const BOZZA = {
  nome: 'Ratto', descrizione: '', tipo: 'mischia' as const, elemento: 'sangue' as const,
  vita: 2, attacco: 2, pixels: DISEGNO,
};

describe('apertura sul server', () => {
  let archivio: Archivio;
  let n: number;

  async function conUnaCartaApprovata() {
    const carta = await inviaCarta(archivio, 'autore', BOZZA);
    await decidiSuCarta(archivio, carta.id, 'approved');
    return carta;
  }

  beforeEach(() => {
    const dati = datiVuoti();
    dati.utenti.push(utente('ricco', 5000), utente('povero', 10), utente('autore', 0));
    archivio = archivioInMemoria(dati);
    n = 0;
  });

  const opzioni = () => ({
    archivio,
    casuale: () => 0,
    nuovoId: () => `ap${++n}`,
    adesso: () => '2026-11-15T12:00:00.000Z',
  });

  test('senza carte approvate il baule non si apre, e non si paga', async () => {
    await assert.rejects(() => apriBaule(opzioni(), 'ricco', 'ferro'), /vuoti/i);
    const dati = await archivio.leggi();
    assert.equal(dati.utenti.find((u) => u.id === 'ricco')!.oro, 5000, "l'oro non si tocca");
  });

  test('con una carta approvata il baule si apre', async () => {
    await conUnaCartaApprovata();
    const apertura = await apriBaule(opzioni(), 'ricco', 'ferro');
    assert.equal(apertura.carte.length, 3);
    assert.equal(apertura.prezzo, 300);
  });

  test('il prezzo viene scalato e i duplicati rimborsati', async () => {
    await conUnaCartaApprovata();
    const apertura = await apriBaule(opzioni(), 'ricco', 'ferro');

    // Tre estrazioni della stessa carta: le prime tre copie entrano in
    // collezione (una comune da 1 goccia ne ammette tre), nessun rimborso.
    const rimborso = apertura.carte.reduce((s, c) => s + c.oro, 0);
    assert.equal(apertura.oroRimasto, 5000 - 300 + rimborso);
    const dati = await archivio.leggi();
    assert.equal(dati.utenti.find((u) => u.id === 'ricco')!.oro, apertura.oroRimasto);
  });

  test('le carte entrano davvero in collezione', async () => {
    const carta = await conUnaCartaApprovata();
    await apriBaule(opzioni(), 'ricco', 'ferro');
    const dati = await archivio.leggi();
    // L'autore ne aveva gia' una per averla creata; il ricco parte da zero.
    assert.equal(dati.utenti.find((u) => u.id === 'ricco')!.collezione[carta.id], 3);
  });

  test('senza abbastanza oro non si apre niente', async () => {
    await conUnaCartaApprovata();
    await assert.rejects(() => apriBaule(opzioni(), 'povero', 'ferro'), /Servono 300/);
    const dati = await archivio.leggi();
    assert.equal(dati.utenti.find((u) => u.id === 'povero')!.oro, 10);
  });

  test('un baule inesistente da 404, non un addebito', async () => {
    await conUnaCartaApprovata();
    await assert.rejects(() => apriBaule(opzioni(), 'ricco', 'cartone'), /non esiste/i);
  });

  test('il baule a pagamento non si apre con le Gocce d Oro', async () => {
    await conUnaCartaApprovata();
    await assert.rejects(() => apriBaule(opzioni(), 'ricco', 'petrolio'), /Gocce d Oro/);
  });

  test('l apertura resta registrata nell archivio', async () => {
    await conUnaCartaApprovata();
    const apertura = await apriBaule(opzioni(), 'ricco', 'ferro');
    const dati = await archivio.leggi();
    assert.equal(dati.aperture.length, 1);
    assert.equal((dati.aperture[0] as { id: string }).id, apertura.id);
    assert.deepEqual((dati.aperture[0] as { carte: unknown }).carte, apertura.carte);
  });

  test('due aperture di fila scalano due volte', async () => {
    await conUnaCartaApprovata();
    await apriBaule(opzioni(), 'ricco', 'ferro');
    const seconda = await apriBaule(opzioni(), 'ricco', 'ferro');
    const dati = await archivio.leggi();
    assert.equal(dati.aperture.length, 2);
    assert.equal(dati.utenti.find((u) => u.id === 'ricco')!.oro, seconda.oroRimasto);
  });

  test('un utente sconosciuto non apre niente', async () => {
    await conUnaCartaApprovata();
    await assert.rejects(() => apriBaule(opzioni(), 'fantasma', 'ferro'), /sconosciuto/i);
  });
});
