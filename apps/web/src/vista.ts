import {
  CONFIG,
  colonnaDi,
  colonnaSpecchiata,
  lineaDi,
  casella,
  type CartaInCampo,
  type Fase,
  type IndiceGiocatore,
  type StatoPartitaConCatalogo,
  type VoceLog,
} from '@bloodyfights/motore';

/**
 * LA VISTA NON TOCCA IL DOM e non disegna niente: trasforma lo stato in
 * stringhe HTML. Cosi' si puo' verificare in Node, senza browser, allo stesso
 * modo in cui si verifica il motore: e' lo stesso motivo per cui il motore non
 * conosce React.
 *
 * Il disegno degli sprite arriva da fuori come funzione (`urlSprite`), perche'
 * per produrlo serve un canvas, che in Node non c'e'.
 */

export type Selezione =
  | { tipo: 'mano'; indice: number }
  | { tipo: 'carta'; casella: number }
  | { tipo: 'support'; casella: number }
  | null;

/**
 * ANIMAZIONI.
 *
 * La vista non anima niente da sola: riceve la descrizione di cosa e'
 * appena successo e mette sulle caselle le classi e le variabili che il CSS
 * usa per muoverle. I fotogrammi li decide stile.css, con steps(): il
 * movimento fluido stona con il pixel art (cap. 2 delle specifiche).
 *
 * Il vantaggio di passare per una descrizione invece che toccare il DOM e'
 * lo stesso di sempre: si puo' provare in Node che la casella giusta riceva
 * la classe giusta, senza browser.
 */
export interface ColpoAnimato {
  /** Chi colpisce. Il difensore e' l'altro. */
  giocatore: IndiceGiocatore;
  da: number;
  bersaglio: { genere: 'carta'; casella: number } | { genere: 'giocatore' };
  danno: number;
  moltiplicatore: number;
}

export interface MorteAnimata {
  giocatore: IndiceGiocatore;
  casella: number;
  /** La carta e' gia' sparita dallo stato: serve la sua copia per il fantasma. */
  carta: CartaInCampo;
}

export type Animazione =
  | { tipo: 'evocazione'; giocatore: IndiceGiocatore; casella: number }
  | { tipo: 'spostamento'; giocatore: IndiceGiocatore; da: number; a: number; scambio: boolean }
  | { tipo: 'attacco'; colpi: ColpoAnimato[]; morti: MorteAnimata[] };

/**
 * Quanto dura ogni animazione, in millisecondi. Questi numeri stanno anche in
 * stile.css: qui servono al sequenziatore per sapere quando ridisegnare senza
 * le classi, e per non far partire il bot sopra l'animazione precedente.
 */
export const DURATE: Record<Animazione['tipo'], number> = {
  evocazione: 340,
  spostamento: 300,
  attacco: 820,
};

export interface Schermata {
  stato: StatoPartitaConCatalogo;
  /** Quale dei due giocatori sta davanti allo schermo. */
  io: IndiceGiocatore;
  selezione: Selezione;
  messaggio: string;
  turnoDelBot: boolean;
  /** Cosa e' appena successo, da mostrare in movimento. */
  animazione: Animazione | null;
  /** Carta da mostrare nel pannello di dettaglio. */
  dettaglio: CartaInCampo | null;
  urlSprite: (cartaId: string) => string;
  /** Come si chiama chi sta di fronte. Contro la macchina resta 'Bot'. */
  nomeAvversario?: string;
  /**
   * Partita online: cambia i comandi (si abbandona, non si ricomincia) e
   * accende il contasecondi del turno.
   */
  online?: boolean;
  /** Secondi che restano al turno in corso, oppure null se non c'e' limite. */
  secondiRimasti?: number | null;
}

const NOMI_FASI: Record<Exclude<Fase, 'finita'>, string> = {
  evocazione: '1 Evocazione',
  riposizionamento: '2 Riposizionamento',
  support: '3 Support',
  attacco: '4 Attacco',
};

const SIMBOLO_TIPO: Record<string, string> = {
  mischia: 'Mischia',
  distanza: 'Distanza',
  support: 'Support',
  oggetto: 'Oggetto',
};

export function fuggi(testo: string): string {
  return testo
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ------------------------------------------------------------ mosse possibili

/** Caselle su cui la selezione corrente puo' agire: la UI le accende. */
export function caselleBersagliabili(s: Schermata): Set<number> {
  const bersagli = new Set<number>();
  const { stato, selezione, io } = s;
  if (stato.turnoDi !== io || stato.fase === 'finita' || !selezione) return bersagli;

  const mio = stato.giocatori[io];

  if (selezione.tipo === 'mano' && stato.fase === 'evocazione') {
    const def = stato.catalogo[mio.mano[selezione.indice]];
    if (!def || def.costo > mio.gocce) return bersagli;
    for (let slot = 0; slot < mio.tabellone.length; slot++) {
      if (mio.tabellone[slot] === null) bersagli.add(slot);
    }
  }

  if (selezione.tipo === 'carta' && stato.fase === 'riposizionamento' && !mio.riposizionamentoUsato) {
    for (let slot = 0; slot < mio.tabellone.length; slot++) {
      if (slot !== selezione.casella) bersagli.add(slot);
    }
  }

  if (selezione.tipo === 'support' && stato.fase === 'support') {
    for (let slot = 0; slot < mio.tabellone.length; slot++) {
      const carta = mio.tabellone[slot];
      if (carta && carta.vita < carta.vitaMax) bersagli.add(slot);
    }
  }

  return bersagli;
}

/** Una carta da mischia in 2a linea non attacca: la UI lo dice a vista. */
export function inattivaInSecondaLinea(carta: CartaInCampo, slot: number): boolean {
  return carta.tipo === 'mischia' && lineaDi(slot) === 1;
}

// ------------------------------------------------------------------- pezzi

/** Riga sullo schermo: le linee dell'avversario sono disegnate capovolte. */
function rigaSuSchermo(s: Schermata, giocatore: IndiceGiocatore, slot: number): number {
  const linea = lineaDi(slot);
  return giocatore === s.io ? linea : 1 - linea;
}

/**
 * Classi e variabili CSS che l'animazione corrente mette su una casella.
 * Le distanze sono espresse in NUMERO di caselle (--dcol, --driga): la
 * geometria in pixel la calcola il CSS, che gia' conosce la larghezza di una
 * casella. Cosi' qui non si duplicano misure che vivono nel foglio di stile.
 */
function animazioneSuCasella(
  s: Schermata,
  giocatore: IndiceGiocatore,
  slot: number,
): { classi: string[]; stile: string[] } {
  const classi: string[] = [];
  const stile: string[] = [];
  const a = s.animazione;
  if (!a) return { classi, stile };

  if (a.tipo === 'evocazione' && a.giocatore === giocatore && a.casella === slot) {
    classi.push('appare');
  }

  if (a.tipo === 'spostamento' && a.giocatore === giocatore) {
    // La carta parte dalla casella di origine e arriva qui: l'animazione va
    // all'indietro, da dove era a dove e' adesso.
    const origine = slot === a.a ? a.da : a.scambio && slot === a.da ? a.a : null;
    if (origine !== null) {
      classi.push('arriva');
      stile.push(`--dcol: ${colonnaDi(origine) - colonnaDi(slot)}`);
      stile.push(`--driga: ${rigaSuSchermo(s, giocatore, origine) - rigaSuSchermo(s, giocatore, slot)}`);
    }
  }

  if (a.tipo === 'attacco') {
    if (a.colpi.some((c) => c.giocatore === giocatore && c.da === slot)) {
      classi.push('attacca');
      // Si slancia verso l'avversario: in su se e' il mio schieramento, in giu'
      // se e' quello di fronte.
      stile.push(`--verso: ${giocatore === s.io ? 1 : -1}`);
    }
    if (colpiSuCasella(a.colpi, giocatore, slot).length > 0) classi.push('impatto');
    if (a.morti.some((m) => m.giocatore === giocatore && m.casella === slot)) classi.push('impatto');
  }

  return { classi, stile };
}

/** I colpi che atterrano su questa casella di questo giocatore. */
function colpiSuCasella(
  colpi: readonly ColpoAnimato[],
  giocatore: IndiceGiocatore,
  slot: number,
): ColpoAnimato[] {
  return colpi.filter(
    (c) => c.bersaglio.genere === 'carta' && c.bersaglio.casella === slot && 1 - c.giocatore === giocatore,
  );
}

/** Numeri di danno che salgono dalla casella colpita. */
function numeriDanno(colpi: readonly ColpoAnimato[]): string {
  if (colpi.length === 0) return '';
  const totale = colpi.reduce((somma, c) => somma + c.danno, 0);
  const critico = colpi.some((c) => c.moltiplicatore > 1);
  return `<span class="danno ${critico ? 'critico' : ''}">-${totale}</span>`;
}

function carta(
  s: Schermata,
  istanza: CartaInCampo,
  slot: number,
  giocatore: IndiceGiocatore,
  classiExtra: readonly string[] = [],
): string {
  const mia = giocatore === s.io;
  const classi = ['carta', ...classiExtra];
  if (mia) classi.push('mia');
  if (istanza.fresca) classi.push('fresca');
  if (inattivaInSecondaLinea(istanza, slot)) classi.push('inattiva');

  const etichettaAttacco = istanza.tipo === 'support' ? 'cura' : 'atk';
  const bollino = istanza.fresca
    ? '<span class="bollino">FRESCA</span>'
    : inattivaInSecondaLinea(istanza, slot)
      ? '<span class="bollino">NON ATTACCA</span>'
      : '';

  return `
    <div class="${classi.join(' ')}" style="--elemento: var(--${istanza.elemento})">
      ${bollino}
      <img class="ritratto" src="${s.urlSprite(istanza.cartaId)}" width="64" height="64" alt="" />
      <div class="nome-carta">${fuggi(istanza.nome)}</div>
      <div class="stat">
        <span class="vita">${istanza.vita}/${istanza.vitaMax}</span>
        <span>${istanza.attacco}${etichettaAttacco === 'cura' ? '+' : ''}</span>
      </div>
    </div>`;
}

function slotVuoto(coordinata: string): string {
  return `<span class="coordinata">${coordinata}</span>`;
}

function linea(
  s: Schermata,
  giocatore: IndiceGiocatore,
  numeroLinea: 0 | 1,
  nomeLinea: string,
): string {
  const bersagli = caselleBersagliabili(s);
  const tabellone = s.stato.giocatori[giocatore].tabellone;
  const celle: string[] = [];

  for (let colonna = 0; colonna < CONFIG.tabellone.colonne; colonna++) {
    const slot = casella(numeroLinea, colonna);
    const istanza = tabellone[slot];
    const mio = giocatore === s.io;

    // La coordinata e' quella dello schieramento di chi possiede la casella:
    // per l'avversario le colonne sono numerate a specchio (cap. 4.1).
    const numeroColonna = mio ? colonna + 1 : colonnaSpecchiata(colonna) + 1;
    const coordinata = `${mio ? 'p' : 'k'}${numeroLinea + 1}${numeroColonna}`;

    const animata = animazioneSuCasella(s, giocatore, slot);
    const classi = ['slot', ...animata.classi];
    if (mio && bersagli.has(slot)) classi.push('bersagliabile');
    if (
      mio &&
      s.selezione &&
      s.selezione.tipo !== 'mano' &&
      s.selezione.casella === slot
    )
      classi.push('scelto');

    // La carta morta e' gia' sparita dallo stato: si ridisegna come fantasma
    // il tempo dell'animazione, altrimenti sparirebbe di colpo e il giocatore
    // non capirebbe chi ha perso.
    const morta =
      s.animazione?.tipo === 'attacco'
        ? s.animazione.morti.find((m) => m.giocatore === giocatore && m.casella === slot)
        : undefined;

    const colpi =
      s.animazione?.tipo === 'attacco' ? colpiSuCasella(s.animazione.colpi, giocatore, slot) : [];

    let contenuto: string;
    if (istanza) contenuto = carta(s, istanza, slot, giocatore);
    else if (morta) contenuto = carta(s, morta.carta, slot, giocatore, ['muore']);
    else contenuto = slotVuoto(coordinata);

    const stile = animata.stile.length > 0 ? ` style="${animata.stile.join('; ')}"` : '';
    const attributi = `class="${classi.join(' ')}" data-giocatore="${giocatore}" data-casella="${slot}"`;
    celle.push(
      `<button type="button" ${attributi}${stile} title="${coordinata}">
         ${contenuto}${numeriDanno(colpi)}
       </button>`,
    );
  }

  return `<div class="linea"><div class="nome-linea">${nomeLinea}</div>${celle.join('')}</div>`;
}

/** Pastiglie delle gocce: dieci caselle, piene fino al valore corrente. */
function pastiglieGocce(gocce: number): string {
  const pastiglie: string[] = [];
  for (let i = 0; i < CONFIG.economia.tettoGocce; i++) {
    pastiglie.push(`<i class="pastiglia ${i < gocce ? 'piena' : ''}"></i>`);
  }
  return `<span class="pastiglie">${pastiglie.join('')}</span>`;
}

function testata(s: Schermata, giocatore: IndiceGiocatore, nome: string): string {
  const g = s.stato.giocatori[giocatore];
  const mio = giocatore === s.io;
  const diTurno = s.stato.turnoDi === giocatore && s.stato.fase !== 'finita';

  // Colpi arrivati in faccia al giocatore: colonna sfondata, nessuna carta a
  // fare da scudo. E' il momento piu' importante della partita, si vede.
  const diretti =
    s.animazione?.tipo === 'attacco'
      ? s.animazione.colpi.filter((c) => c.bersaglio.genere === 'giocatore' && 1 - c.giocatore === giocatore)
      : [];
  const dannoDiretto = diretti.reduce((somma, c) => somma + c.danno, 0);

  // La vita come barra e le gocce come pastiglie: due numeri accanto a un
  // nome si leggono, ma non si colgono. Una barra che si accorcia si capisce
  // senza leggerla, ed e' quello che serve mentre si decide una mossa.
  const vitaMax = CONFIG.tabellone.vitaGiocatore;
  const quota = Math.max(0, Math.min(100, (g.vita / vitaMax) * 100));
  const agonia = g.vita <= vitaMax * 0.25;

  return `
    <div class="testata ${mio ? 'mio' : 'suo'} ${diretti.length > 0 ? 'ferito' : ''} ${diTurno ? 'di-turno' : ''}">
      ${dannoDiretto > 0 ? `<span class="danno critico">-${dannoDiretto}</span>` : ''}
      <span class="identita">
        <span class="nome">${fuggi(nome)}</span>
        ${diTurno ? '<span class="marca-turno">di turno</span>' : ''}
      </span>

      <span class="misure">
        <span class="misura-vita ${agonia ? 'agonia' : ''}">
          <span class="etichetta">vita</span>
          <span class="barra-vita" title="${g.vita} su ${vitaMax}"><span style="width: ${quota}%"></span></span>
          <span class="numero-grosso">${g.vita}</span>
        </span>

        <span class="misura-gocce">
          <span class="etichetta">gocce</span>
          ${pastiglieGocce(g.gocce)}
          <span class="numero-grosso">${g.gocce}</span>
        </span>

        <span class="misura"><span class="etichetta">mano</span>${g.mano.length}</span>
        <span class="misura"><span class="etichetta">mazzo</span>${g.mazzo.length}</span>
      </span>
    </div>`;
}

function mano(s: Schermata): string {
  const mio = s.stato.giocatori[s.io];
  if (mio.mano.length === 0) return '<p class="nota">Mano vuota.</p>';

  const mioTurno = s.stato.turnoDi === s.io && s.stato.fase !== 'finita';
  const inEvocazione = mioTurno && s.stato.fase === 'evocazione';

  const carte = mio.mano.map((cartaId, indice) => {
    const def = s.stato.catalogo[cartaId];
    if (!def) return '';

    const oggetto = def.tipo === 'oggetto';
    const pagabile = def.costo <= mio.gocce;
    // Le creature si schierano solo in fase di evocazione; le carte oggetto
    // si giocano in qualunque fase del proprio turno.
    const giocabile = pagabile && (oggetto ? mioTurno : inEvocazione);
    const scelta = s.selezione?.tipo === 'mano' && s.selezione.indice === indice;
    const etichetta = def.tipo === 'support' ? 'cura' : 'atk';

    const attributo = oggetto ? `data-gioca-oggetto="${indice}"` : `data-mano="${indice}"`;
    // Classi filtrate e non concatenate: due ternari di fila lasciano doppi
    // spazi, e un selettore come ".carta-mano.scelta" smette di combaciare.
    const classi = ['carta-mano', oggetto ? 'oggetto' : '', scelta ? 'scelta' : ''].filter(Boolean);

    return `
      <button type="button" class="${classi.join(' ')}"
              ${attributo} ${giocabile ? '' : 'disabled'}
              style="--elemento: var(--${def.elemento})"
              title="${fuggi(def.nome)} - ${fuggi(def.descrizione)}">
        <img src="${s.urlSprite(def.id)}" width="96" height="96" alt="" />
        <div class="nome-carta">${fuggi(def.nome)}</div>
        <div class="tipo-elemento">${SIMBOLO_TIPO[def.tipo]}${oggetto ? '' : ` - ${def.elemento}`}</div>
        <div class="riga-stat">
          ${oggetto ? '<span class="usa">GIOCA</span>' : `<span class="vita">${def.vita}</span><span>${def.attacco}${etichetta === 'cura' ? '+' : ''}</span>`}
          <span class="costo">${def.costo}</span>
        </div>
      </button>`;
  });

  return `<div class="mano">${carte.join('')}</div>`;
}

function contasecondi(s: Schermata): string {
  if (s.secondiRimasti === undefined || s.secondiRimasti === null) return '';
  const secondi = Math.max(0, Math.ceil(s.secondiRimasti));
  // Sotto i dieci secondi diventa urgente: lo stesso numero, letto diverso.
  return `<span class="contasecondi ${secondi <= 10 ? 'urgente' : ''}">${secondi}s</span>`;
}

function barraFasi(s: Schermata): string {
  const fasi = (Object.keys(NOMI_FASI) as Exclude<Fase, 'finita'>[]).map((fase) => {
    const corrente = s.stato.fase === fase;
    return `<span class="fase ${corrente ? 'corrente' : ''}">${NOMI_FASI[fase]}</span>`;
  });
  return `<div class="barra-fasi">${fasi.join('')}${contasecondi(s)}</div>`;
}

function comandi(s: Schermata): string {
  const mioTurno = s.stato.turnoDi === s.io && s.stato.fase !== 'finita' && !s.turnoDelBot;
  const inSupport = s.stato.fase === 'support';
  const etichetta = inSupport ? 'Attacca e passa il turno' : 'Passa fase';

  const scelteSupport =
    mioTurno && inSupport && s.selezione?.tipo === 'support'
      ? `<button type="button" class="bottone secondario" data-azione="goccia">Produci 1 goccia</button>`
      : '';

  return `
    <div class="barra-fasi">
      <button type="button" class="bottone" data-azione="passa" ${mioTurno ? '' : 'disabled'}>
        ${etichetta}
      </button>
      ${scelteSupport}
      ${
        s.online
          ? `<button type="button" class="bottone secondario" data-azione="abbandona">Abbandona</button>`
          : `<button type="button" class="bottone secondario" data-azione="nuova">Nuova partita</button>`
      }
    </div>`;
}

// -------------------------------------------------------------- il registro

export function descriviVoce(voce: VoceLog, s: Schermata): { testo: string; rilievo: boolean } | null {
  const chi = (g: IndiceGiocatore) => (g === s.io ? 'Tu' : s.nomeAvversario ?? 'Il bot');
  const nomeIn = (g: IndiceGiocatore, slot: number) =>
    s.stato.giocatori[g].tabellone[slot]?.nome ?? 'una carta';
  const nomeCarta = (cartaId: string) => s.stato.catalogo[cartaId]?.nome ?? cartaId;
  const posizione = (slot: number) => `${lineaDi(slot) + 1}a linea col. ${colonnaDi(slot) + 1}`;

  switch (voce.tipo) {
    case 'inizioTurno':
      return { testo: `--- Turno ${voce.turno}: ${chi(voce.giocatore)} (${voce.gocce} gocce)`, rilievo: true };
    case 'pescata':
      return voce.giocatore === s.io
        ? { testo: `Peschi ${nomeCarta(voce.cartaId)}.`, rilievo: false }
        : { testo: 'Il bot pesca una carta.', rilievo: false };
    case 'pescataScartata':
      return { testo: `${chi(voce.giocatore)}: mano piena, ${nomeCarta(voce.cartaId)} scartata.`, rilievo: false };
    case 'mazzoEsaurito':
      return { testo: `${chi(voce.giocatore)}: mazzo esaurito, non si pesca piu'.`, rilievo: true };
    case 'evocazione':
      return {
        testo: `${chi(voce.giocatore)} evoca ${nomeCarta(voce.cartaId)} in ${posizione(voce.casella)} per ${voce.costo}.`,
        rilievo: false,
      };
    case 'riposizionamento':
      return {
        testo: `${chi(voce.giocatore)} ${voce.scambio ? 'scambia' : 'sposta'}: ${posizione(voce.da)} -> ${posizione(voce.a)}.`,
        rilievo: false,
      };
    case 'cura':
      return {
        testo: `${chi(voce.giocatore)}: ${nomeIn(voce.giocatore, voce.curatore)} cura ${voce.punti} a ${nomeIn(voce.giocatore, voce.bersaglio)}.`,
        rilievo: false,
      };
    case 'oggetto':
      return {
        testo: `${chi(voce.giocatore)} gioca ${nomeCarta(voce.cartaId)}: +1 goccia.`,
        rilievo: false,
      };
    case 'gocciaProdotta':
      return { testo: `${chi(voce.giocatore)}: un support produce 1 goccia.`, rilievo: false };
    case 'attaccoSaltato':
      return { testo: `${chi(voce.giocatore)} salta la Fase 4: compensazione del primo giocatore.`, rilievo: true };
    case 'colpo': {
      if (voce.bersaglio.genere === 'giocatore')
        return {
          testo: `${chi(voce.giocatore)} colpisce direttamente per ${voce.danno}: colonna sfondata.`,
          rilievo: true,
        };
      const extra = voce.moltiplicatore !== 1 ? ` (x${voce.moltiplicatore} elementale)` : '';
      return { testo: `${chi(voce.giocatore)} infligge ${voce.danno}${extra}.`, rilievo: false };
    }
    case 'morte':
      return { testo: `${nomeCarta(voce.cartaId)} va nel cimitero.`, rilievo: true };
    case 'vittoria':
      return { testo: voce.vincitore === s.io ? 'Hai vinto.' : 'Hai perso.', rilievo: true };
    case 'cambioFase':
    case 'fineTurno':
      return null;
  }
}

function registro(s: Schermata): string {
  const voci: string[] = [];
  for (let i = s.stato.log.length - 1; i >= 0 && voci.length < 16; i--) {
    const voce = s.stato.log[i];
    const descrizione = descriviVoce(voce, s);
    if (!descrizione) continue;
    const mio = 'giocatore' in voce && voce.giocatore === s.io;
    voci.push(
      `<li class="${mio ? 'mio' : ''} ${descrizione.rilievo ? 'rilievo' : ''}">${fuggi(descrizione.testo)}</li>`,
    );
  }
  return `<ul class="registro">${voci.join('')}</ul>`;
}

function dettaglio(s: Schermata): string {
  const istanza = s.dettaglio;
  if (!istanza)
    return '<p class="nota">Passa il puntatore su una carta per vederne le statistiche.</p>';

  return `
    <div class="dettaglio" style="--elemento: var(--${istanza.elemento})">
      <img src="${s.urlSprite(istanza.cartaId)}" width="192" height="192" alt="" />
      <div class="nome-carta">${fuggi(istanza.nome)}</div>
      ${istanza.descrizione ? `<p class="descrizione">${fuggi(istanza.descrizione)}</p>` : ''}
      <dl>
        <dt>Tipo</dt><dd>${SIMBOLO_TIPO[istanza.tipo]}</dd>
        <dt>Elemento</dt><dd>${istanza.elemento}</dd>
        <dt>Vita</dt><dd class="vita">${istanza.vita} / ${istanza.vitaMax}</dd>
        <dt>${istanza.tipo === 'support' ? 'Cura' : 'Attacco'}</dt><dd>${istanza.attacco}</dd>
        <dt>Costo</dt><dd class="costo">${istanza.costo}</dd>
      </dl>
    </div>`;
}

function esito(s: Schermata): string {
  if (s.stato.fase !== 'finita') return '';
  const vinto = s.stato.vincitore === s.io;
  const pari = s.stato.vincitore === null;
  return `
    <div class="esito">
      <h1>${pari ? 'PAREGGIO' : vinto ? 'VITTORIA' : 'SCONFITTA'}</h1>
      <p>Partita chiusa al turno ${s.stato.turno}.</p>
      ${
        s.online
          ? `<button type="button" class="bottone" data-azione="torna-in-coda">Cerca un'altra partita</button>`
          : `<button type="button" class="bottone" data-azione="nuova">Nuova partita</button>`
      }
    </div>`;
}

// --------------------------------------------------------------- la schermata

export function disegna(s: Schermata): string {
  return `
    <div class="partita">
      <div class="colonna-gioco">
        ${testata(s, (1 - s.io) as IndiceGiocatore, s.nomeAvversario ?? 'Bot')}
        <div class="tabellone">
          ${linea(s, (1 - s.io) as IndiceGiocatore, 1, 'avversario<br />2a linea')}
          ${linea(s, (1 - s.io) as IndiceGiocatore, 0, 'avversario<br />1a linea')}
          <div class="separatore"></div>
          ${linea(s, s.io, 0, 'tu<br />1a linea')}
          ${linea(s, s.io, 1, 'tu<br />2a linea')}
        </div>
        ${testata(s, s.io, 'Tu')}
        ${barraFasi(s)}
        <div class="messaggio">${fuggi(s.messaggio)}</div>
        ${comandi(s)}
        <div class="pannello"><h2>La tua mano</h2>${mano(s)}</div>
      </div>

      <div class="fianco">
        <div class="pannello"><h2>Carta</h2>${dettaglio(s)}</div>
        <div class="pannello"><h2>Registro</h2>${registro(s)}</div>
      </div>
    </div>
    ${esito(s)}`;
}
