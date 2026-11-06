import { CONFIG } from './config.ts';
import { dannoSuCarta, moltiplicatoreElementale } from './elementi.ts';
import { mischia, interoCasuale } from './rng.ts';
import { casella, colonnaDi, lineaDi, casellaValida, tabelloneVuoto } from './tabellone.ts';
import {
  MossaIllegale,
  ORDINE_FASI,
  type Azione,
  type CartaCompleta,
  type CartaInCampo,
  type Fase,
  type IndiceGiocatore,
  type StatoGiocatore,
  type StatoPartita,
  type VoceLog,
} from './types.ts';

/**
 * Catalogo delle carte usate nella partita: viaggia DENTRO lo stato.
 * Cosi' applicaAzione(stato, azione) non ha bisogno di nessuna dipendenza
 * esterna (ne' database, ne' variabili globali) e una partita salvata resta
 * rigiocabile anche dopo una ritaratura dei pesi del costo.
 */
export type Catalogo = Record<string, CartaCompleta>;

export interface StatoPartitaConCatalogo extends StatoPartita {
  catalogo: Catalogo;
}

export interface OpzioniNuovaPartita {
  idGiocatori: [string, string];
  mazzi: [readonly string[], readonly string[]];
  carte: readonly CartaCompleta[];
  seme: number;
  /** Se omesso, chi inizia e' sorteggiato dal seme. */
  primoGiocatore?: IndiceGiocatore;
}

// ---------------------------------------------------------------- validazione

/**
 * Quante copie della stessa carta stanno in un mazzo.
 *
 * Dipende dal costo: le carte economiche si possono ripetere di piu'. Con due
 * sole copie una carta da 1 goccia non riusciva a definire un mazzo, perche'
 * due carte su venti si pescano troppo di rado.
 */
export function copieMassime(costo: number): number {
  return CONFIG.mazzo.copieMassimePerCosto[costo] ?? CONFIG.mazzo.copieMassimeStessaCarta;
}

/** Il minimo indispensabile che validaMazzo deve sapere di una carta. */
export interface CartaPerMazzo {
  id: string;
  costo: number;
}

export function validaMazzo(mazzo: readonly string[], carte: readonly CartaPerMazzo[]): string[] {
  const errori: string[] = [];
  const m = CONFIG.mazzo;
  const perId = new Map(carte.map((c) => [c.id, c]));

  if (mazzo.length !== m.carteNelMazzo)
    errori.push(`Il mazzo deve contenere esattamente ${m.carteNelMazzo} carte (ne ha ${mazzo.length})`);

  const conteggio = new Map<string, number>();
  for (const id of mazzo) {
    if (!perId.has(id)) errori.push(`Carta sconosciuta nel mazzo: ${id}`);
    conteggio.set(id, (conteggio.get(id) ?? 0) + 1);
  }

  for (const [id, n] of conteggio) {
    const carta = perId.get(id);
    if (!carta) continue;
    const massimo = copieMassime(carta.costo);
    if (n > massimo) errori.push(`${id}: ${n} copie, il massimo e' ${massimo}`);
  }
  return errori;
}

// ------------------------------------------------------------ creazione stato

export function creaPartita(opzioni: OpzioniNuovaPartita): StatoPartitaConCatalogo {
  const catalogo: Catalogo = {};
  for (const c of opzioni.carte) catalogo[c.id] = c;

  for (const [i, mazzo] of opzioni.mazzi.entries()) {
    const errori = validaMazzo(mazzo, opzioni.carte);
    if (errori.length > 0)
      throw new MossaIllegale(`Mazzo del giocatore ${i} non valido: ${errori.join('; ')}`);
  }

  let seme = opzioni.seme;

  let primo: IndiceGiocatore;
  if (opzioni.primoGiocatore !== undefined) {
    primo = opzioni.primoGiocatore;
  } else {
    const sorteggio = interoCasuale(seme, 2);
    seme = sorteggio.seme;
    primo = sorteggio.valore as IndiceGiocatore;
  }

  const giocatori: StatoGiocatore[] = [];
  for (let i = 0; i < 2; i++) {
    const esito = mischia(opzioni.mazzi[i], seme);
    seme = esito.seme;
    const mazzoMischiato = esito.risultato;
    const mano = mazzoMischiato.splice(0, CONFIG.mazzo.manoIniziale);

    giocatori.push({
      id: opzioni.idGiocatori[i],
      mazzo: mazzoMischiato,
      mano,
      tabellone: tabelloneVuoto(),
      cimitero: [],
      vita: CONFIG.tabellone.vitaGiocatore,
      gocce: 0,
      riposizionamentoUsato: false,
      turniGiocati: 0,
    });
  }

  const stato: StatoPartitaConCatalogo = {
    giocatori: giocatori as [StatoGiocatore, StatoGiocatore],
    turnoDi: primo,
    primoGiocatore: primo,
    turno: 0,
    fase: 'evocazione',
    vincitore: null,
    seme,
    contatoreUid: 0,
    log: [],
    catalogo,
  };

  iniziaTurno(stato);
  return stato;
}

// ------------------------------------------------------------------ il turno

function iniziaTurno(stato: StatoPartitaConCatalogo): void {
  const p = stato.turnoDi;
  const g = stato.giocatori[p];

  stato.turno += 1;
  g.turniGiocati += 1;
  stato.fase = 'evocazione';
  g.riposizionamentoUsato = false;

  // Le carte evocate nel turno precedente diventano operative adesso.
  for (const carta of g.tabellone) {
    if (carta) {
      carta.fresca = false;
      carta.haAgito = false;
    }
  }

  g.gocce = Math.min(CONFIG.economia.tettoGocce, g.gocce + CONFIG.economia.gocceInizioTurno);
  stato.log.push({ tipo: 'inizioTurno', giocatore: p, turno: stato.turno, gocce: g.gocce });

  pesca(stato, p, CONFIG.mazzo.pescataPerTurno);
}

function pesca(stato: StatoPartitaConCatalogo, p: IndiceGiocatore, quante: number): void {
  const g = stato.giocatori[p];
  for (let i = 0; i < quante; i++) {
    if (g.mazzo.length === 0) {
      // Mazzo esaurito: non si pesca piu', nessun danno da fatica.
      stato.log.push({ tipo: 'mazzoEsaurito', giocatore: p });
      return;
    }
    const cartaId = g.mazzo.shift()!;
    if (g.mano.length >= CONFIG.mazzo.manoMassima) {
      g.cimitero.push(cartaId);
      stato.log.push({ tipo: 'pescataScartata', giocatore: p, cartaId, motivo: 'manoPiena' });
    } else {
      g.mano.push(cartaId);
      stato.log.push({ tipo: 'pescata', giocatore: p, cartaId });
    }
  }
}

function fineTurno(stato: StatoPartitaConCatalogo): void {
  stato.log.push({ tipo: 'fineTurno', giocatore: stato.turnoDi });
  stato.turnoDi = (1 - stato.turnoDi) as IndiceGiocatore;
  iniziaTurno(stato);
}

// ---------------------------------------------------------------- Fase 4

/**
 * Risoluzione "a fotografia" (cap. 4.4): il server decide TUTTI i bersagli
 * sullo stato precedente a qualunque danno, poi applica tutti i danni insieme
 * e solo alla fine rimuove le carte morte. Senza questa separazione l'ordine
 * in cui si scorrono le caselle cambierebbe l'esito della partita.
 */
function risolviAttacco(stato: StatoPartitaConCatalogo): void {
  const a = stato.turnoDi;
  const d = (1 - a) as IndiceGiocatore;
  const attaccante = stato.giocatori[a];
  const difensore = stato.giocatori[d];

  if (
    CONFIG.partita.compensazionePrimoGiocatore &&
    a === stato.primoGiocatore &&
    attaccante.turniGiocati === 1
  ) {
    stato.log.push({ tipo: 'attaccoSaltato', giocatore: a, motivo: 'compensazionePrimoGiocatore' });
    return;
  }

  type Colpo = {
    da: number;
    bersaglio: { genere: 'carta'; casella: number } | { genere: 'giocatore' };
    danno: number;
    moltiplicatore: number;
  };
  const colpi: Colpo[] = [];

  // --- scatto della fotografia -------------------------------------------
  for (let i = 0; i < attaccante.tabellone.length; i++) {
    const carta = attaccante.tabellone[i];
    if (!carta) continue;
    if (carta.fresca) continue;
    if (carta.tipo === 'support') continue; // i support non attaccano mai
    if (lineaDi(i) === 1 && carta.tipo === 'mischia') continue; // mischia in 2a linea: inattiva

    const colonna = colonnaDi(i);
    const primaLinea = difensore.tabellone[casella(0, colonna)];
    const secondaLinea = difensore.tabellone[casella(1, colonna)];

    if (primaLinea) {
      colpi.push({
        da: i,
        bersaglio: { genere: 'carta', casella: casella(0, colonna) },
        danno: dannoSuCarta(carta.attacco, carta.elemento, primaLinea.elemento),
        moltiplicatore: moltiplicatoreElementale(carta.elemento, primaLinea.elemento),
      });
    } else if (secondaLinea) {
      colpi.push({
        da: i,
        bersaglio: { genere: 'carta', casella: casella(1, colonna) },
        danno: dannoSuCarta(carta.attacco, carta.elemento, secondaLinea.elemento),
        moltiplicatore: moltiplicatoreElementale(carta.elemento, secondaLinea.elemento),
      });
    } else {
      // Colonna completamente vuota: il danno passa al giocatore, a valore
      // pieno, senza moltiplicatore elementale (il giocatore non ha elemento).
      colpi.push({ da: i, bersaglio: { genere: 'giocatore' }, danno: carta.attacco, moltiplicatore: 1 });
    }
  }

  // --- applicazione simultanea -------------------------------------------
  for (const colpo of colpi) {
    stato.log.push({
      tipo: 'colpo',
      giocatore: a,
      da: colpo.da,
      bersaglio: colpo.bersaglio,
      danno: colpo.danno,
      moltiplicatore: colpo.moltiplicatore,
    });
    if (colpo.bersaglio.genere === 'carta') {
      const bersaglio = difensore.tabellone[colpo.bersaglio.casella];
      // Il danno in eccesso non trabocca: si limita a portare la vita sotto zero.
      if (bersaglio) bersaglio.vita -= colpo.danno;
    } else {
      difensore.vita -= colpo.danno;
    }
  }

  // --- rimozione dei morti ------------------------------------------------
  for (let i = 0; i < difensore.tabellone.length; i++) {
    const carta = difensore.tabellone[i];
    if (carta && carta.vita <= 0) {
      difensore.cimitero.push(carta.cartaId);
      difensore.tabellone[i] = null;
      stato.log.push({ tipo: 'morte', giocatore: d, casella: i, cartaId: carta.cartaId });
    }
  }

  if (difensore.vita <= 0) {
    stato.vincitore = a;
    stato.fase = 'finita';
    stato.log.push({ tipo: 'vittoria', vincitore: a });
  }
}

// ------------------------------------------------------------- le azioni

function esigiFase(stato: StatoPartita, attesa: Fase): void {
  if (stato.fase === 'finita') throw new MossaIllegale('La partita e finita');
  if (stato.fase !== attesa)
    throw new MossaIllegale(`Azione valida solo in fase ${attesa}, siamo in fase ${stato.fase}`);
}

function evoca(stato: StatoPartitaConCatalogo, indiceMano: number, slot: number): void {
  esigiFase(stato, 'evocazione');
  const g = stato.giocatori[stato.turnoDi];

  if (!Number.isInteger(indiceMano) || indiceMano < 0 || indiceMano >= g.mano.length)
    throw new MossaIllegale(`Indice di mano fuori intervallo: ${indiceMano}`);
  if (!casellaValida(slot)) throw new MossaIllegale(`Casella non valida: ${slot}`);
  if (g.tabellone[slot] !== null) throw new MossaIllegale(`La casella ${slot} e gia occupata`);

  const cartaId = g.mano[indiceMano];
  const def = stato.catalogo[cartaId];
  if (!def) throw new MossaIllegale(`Carta non nel catalogo della partita: ${cartaId}`);
  if (def.tipo === 'oggetto')
    throw new MossaIllegale(`${def.nome} e una carta oggetto: si gioca, non si schiera`);
  if (g.gocce < def.costo)
    throw new MossaIllegale(`Gocce insufficienti: servono ${def.costo}, ne hai ${g.gocce}`);

  g.gocce -= def.costo;
  g.mano.splice(indiceMano, 1);
  stato.contatoreUid += 1;

  const istanza: CartaInCampo = {
    uid: `c${stato.contatoreUid}`,
    cartaId: def.id,
    nome: def.nome,
    tipo: def.tipo,
    elemento: def.elemento,
    vita: def.vita,
    vitaMax: def.vita,
    attacco: def.attacco,
    costo: def.costo,
    descrizione: def.descrizione,
    fresca: true, // non attacca e non cura nel turno in cui entra in campo
    haAgito: false,
  };
  g.tabellone[slot] = istanza;
  stato.log.push({
    tipo: 'evocazione',
    giocatore: stato.turnoDi,
    cartaId: def.id,
    casella: slot,
    costo: def.costo,
  });
}

/**
 * Gioca una carta oggetto dalla mano.
 *
 * A differenza dell'evocazione non ha una fase sua: si puo' fare in qualunque
 * momento del proprio turno. E' il motivo per cui questa funzione non chiama
 * `esigiFase` ma controlla solo che la partita non sia finita.
 */
function giocaOggetto(stato: StatoPartitaConCatalogo, indiceMano: number): void {
  if (stato.fase === 'finita') throw new MossaIllegale('La partita e finita');

  const g = stato.giocatori[stato.turnoDi];
  if (!Number.isInteger(indiceMano) || indiceMano < 0 || indiceMano >= g.mano.length)
    throw new MossaIllegale(`Indice di mano fuori intervallo: ${indiceMano}`);

  const cartaId = g.mano[indiceMano];
  const def = stato.catalogo[cartaId];
  if (!def) throw new MossaIllegale(`Carta non nel catalogo della partita: ${cartaId}`);
  if (def.tipo !== 'oggetto') throw new MossaIllegale(`${def.nome} non e una carta oggetto`);
  if (g.gocce < def.costo)
    throw new MossaIllegale(`Gocce insufficienti: servono ${def.costo}, ne hai ${g.gocce}`);
  if (!def.effetto) throw new MossaIllegale(`${def.nome} non ha un effetto`);

  g.gocce -= def.costo;
  g.mano.splice(indiceMano, 1);
  g.cimitero.push(cartaId);

  switch (def.effetto) {
    case 'goccia':
      g.gocce = Math.min(CONFIG.economia.tettoGocce, g.gocce + 1);
      break;
    default: {
      const mai: never = def.effetto;
      throw new MossaIllegale(`Effetto sconosciuto: ${String(mai)}`);
    }
  }

  stato.log.push({
    tipo: 'oggetto',
    giocatore: stato.turnoDi,
    cartaId,
    effetto: def.effetto,
  });
}

function riposiziona(stato: StatoPartitaConCatalogo, da: number, a: number): void {
  esigiFase(stato, 'riposizionamento');
  const g = stato.giocatori[stato.turnoDi];

  if (g.riposizionamentoUsato)
    throw new MossaIllegale('Riposizionamento gia usato: una sola azione per turno');
  if (!casellaValida(da) || !casellaValida(a)) throw new MossaIllegale('Casella non valida');
  if (da === a) throw new MossaIllegale('Origine e destinazione coincidono');
  if (g.tabellone[da] === null) throw new MossaIllegale(`Nessuna carta nella casella ${da}`);

  const scambio = g.tabellone[a] !== null;
  const temp = g.tabellone[da];
  g.tabellone[da] = g.tabellone[a];
  g.tabellone[a] = temp;

  g.riposizionamentoUsato = true;
  stato.log.push({ tipo: 'riposizionamento', giocatore: stato.turnoDi, da, a, scambio });
}

function supportCarta(stato: StatoPartitaConCatalogo, slot: number): CartaInCampo {
  esigiFase(stato, 'support');
  const g = stato.giocatori[stato.turnoDi];
  if (!casellaValida(slot)) throw new MossaIllegale(`Casella non valida: ${slot}`);
  const carta = g.tabellone[slot];
  if (!carta) throw new MossaIllegale(`Nessuna carta nella casella ${slot}`);
  if (carta.tipo !== 'support') throw new MossaIllegale(`${carta.nome} non e una carta support`);
  if (carta.fresca) throw new MossaIllegale(`${carta.nome} e fresca: agisce dal prossimo turno`);
  if (carta.haAgito) throw new MossaIllegale(`${carta.nome} ha gia agito in questo turno`);
  return carta;
}

function supportCura(stato: StatoPartitaConCatalogo, slot: number, bersaglioSlot: number): void {
  const curatore = supportCarta(stato, slot);
  const g = stato.giocatori[stato.turnoDi];

  if (!casellaValida(bersaglioSlot)) throw new MossaIllegale(`Casella non valida: ${bersaglioSlot}`);
  const bersaglio = g.tabellone[bersaglioSlot];
  if (!bersaglio) throw new MossaIllegale(`Nessun alleato nella casella ${bersaglioSlot}`);

  // La cura non supera la vita massima della carta bersaglio.
  const punti = Math.min(curatore.attacco, bersaglio.vitaMax - bersaglio.vita);
  bersaglio.vita += punti;
  curatore.haAgito = true;
  stato.log.push({
    tipo: 'cura',
    giocatore: stato.turnoDi,
    curatore: slot,
    bersaglio: bersaglioSlot,
    punti,
  });
}

function supportGoccia(stato: StatoPartitaConCatalogo, slot: number): void {
  const carta = supportCarta(stato, slot);
  const g = stato.giocatori[stato.turnoDi];
  g.gocce = Math.min(CONFIG.economia.tettoGocce, g.gocce + CONFIG.economia.goccePerSupport);
  carta.haAgito = true;
  stato.log.push({ tipo: 'gocciaProdotta', giocatore: stato.turnoDi, casella: slot });
}

function passaFase(stato: StatoPartitaConCatalogo): void {
  if (stato.fase === 'finita') throw new MossaIllegale('La partita e finita');

  const indice = ORDINE_FASI.indexOf(stato.fase);
  const prossima = ORDINE_FASI[indice + 1];

  if (prossima === undefined || prossima === 'attacco') {
    // Fase 4: nessuna decisione da prendere, si risolve e il turno passa.
    stato.fase = 'attacco';
    stato.log.push({ tipo: 'cambioFase', giocatore: stato.turnoDi, fase: 'attacco' });
    risolviAttacco(stato);
    if (stato.fase !== 'finita') fineTurno(stato);
    return;
  }

  stato.fase = prossima;
  stato.log.push({ tipo: 'cambioFase', giocatore: stato.turnoDi, fase: prossima });
}

// --------------------------------------------------------- funzione pura

/**
 * applicaAzione(stato, azione): StatoPartita
 *
 * Nessuna variabile globale, nessuna chiamata al database, nessun riferimento
 * al DOM. Dato uno stato e un'azione restituisce il NUOVO stato: lo stato
 * ricevuto non viene mai modificato, cosi' due chiamate identiche danno
 * sempre lo stesso risultato e una partita si puo' rigiocare dal log.
 */
export function applicaAzione(
  stato: StatoPartitaConCatalogo,
  azione: Azione,
): StatoPartitaConCatalogo {
  const nuovo = structuredClone(stato);

  switch (azione.tipo) {
    case 'evoca':
      evoca(nuovo, azione.indiceMano, azione.casella);
      break;
    case 'giocaOggetto':
      giocaOggetto(nuovo, azione.indiceMano);
      break;
    case 'riposiziona':
      riposiziona(nuovo, azione.da, azione.a);
      break;
    case 'supportCura':
      supportCura(nuovo, azione.casella, azione.bersaglio);
      break;
    case 'supportGoccia':
      supportGoccia(nuovo, azione.casella);
      break;
    case 'passaFase':
      passaFase(nuovo);
      break;
    default: {
      const mai: never = azione;
      throw new MossaIllegale(`Azione sconosciuta: ${JSON.stringify(mai)}`);
    }
  }

  return nuovo;
}

/** Rigioca una partita dalla sequenza delle azioni: serve ai replay e al debug. */
export function rigioca(
  iniziale: StatoPartitaConCatalogo,
  azioni: readonly Azione[],
): StatoPartitaConCatalogo {
  return azioni.reduce<StatoPartitaConCatalogo>((s, a) => applicaAzione(s, a), iniziale);
}

// ----------------------------------------------------- mosse legali (UI/bot)

/**
 * Tutte le azioni legali nello stato corrente. Serve all'interfaccia per
 * accendere le caselle valide e al bot della fase 1 per scegliere.
 */
export function azioniLegali(stato: StatoPartitaConCatalogo): Azione[] {
  if (stato.fase === 'finita') return [];
  const g = stato.giocatori[stato.turnoDi];
  const azioni: Azione[] = [{ tipo: 'passaFase' }];

  // Gli oggetti non hanno una fase: si possono giocare sempre.
  for (let i = 0; i < g.mano.length; i++) {
    const def = stato.catalogo[g.mano[i]];
    if (def?.tipo === 'oggetto' && def.costo <= g.gocce) {
      azioni.push({ tipo: 'giocaOggetto', indiceMano: i });
    }
  }

  if (stato.fase === 'evocazione') {
    for (let i = 0; i < g.mano.length; i++) {
      const def = stato.catalogo[g.mano[i]];
      if (!def || def.tipo === 'oggetto' || def.costo > g.gocce) continue;
      for (let slot = 0; slot < g.tabellone.length; slot++) {
        if (g.tabellone[slot] === null) azioni.push({ tipo: 'evoca', indiceMano: i, casella: slot });
      }
    }
  }

  if (stato.fase === 'riposizionamento' && !g.riposizionamentoUsato) {
    for (let da = 0; da < g.tabellone.length; da++) {
      if (!g.tabellone[da]) continue;
      for (let a = 0; a < g.tabellone.length; a++) {
        if (a !== da) azioni.push({ tipo: 'riposiziona', da, a });
      }
    }
  }

  if (stato.fase === 'support') {
    for (let slot = 0; slot < g.tabellone.length; slot++) {
      const c = g.tabellone[slot];
      if (!c || c.tipo !== 'support' || c.fresca || c.haAgito) continue;
      azioni.push({ tipo: 'supportGoccia', casella: slot });
      for (let b = 0; b < g.tabellone.length; b++) {
        const bers = g.tabellone[b];
        if (bers && bers.vita < bers.vitaMax) azioni.push({ tipo: 'supportCura', casella: slot, bersaglio: b });
      }
    }
  }

  return azioni;
}
