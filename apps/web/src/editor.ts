import {
  CONFIG, calcolaCosto, calcolaPotenza, calcolaRarita, scomposizionePotenza, validaCarta,
  type Elemento, type TipoCarta,
} from '@bloodyfights/motore';
import {
  PALETTE, STRUMENTI, cronologiaIniziale, disegnaLinea, disegnaRettangolo, puoAnnullare,
  puoRipetere, riempi, telaCorrente, telaPiena,
  type Cronologia, type Punto, type Strumento, type Tela,
} from '@bloodyfights/pixel';
import { fuggi } from './vista.ts';

/**
 * EDITOR DI CARTE (cap. 7).
 *
 * A sinistra il disegno, a destra le statistiche. La pagina e' una funzione
 * pura come le altre: il canvas viene dipinto dopo, da main.ts, perche' per
 * disegnare serve un contesto grafico che in Node non esiste. Qui si produce
 * solo il contenitore e tutto il resto della pagina.
 */

export interface Bozza {
  nome: string;
  tipo: TipoCarta;
  elemento: Elemento;
  vita: number;
  attacco: number;
  cronologia: Cronologia;
  strumento: Strumento;
  /** Indice nella palette, non un colore. */
  colore: number;
}

export interface CartaCreata {
  nome: string;
  tipo: TipoCarta;
  elemento: Elemento;
  vita: number;
  attacco: number;
  potenza: number;
  costo: number;
  rarita: string;
  pixels: string;
  stato: 'pending' | 'approved' | 'rejected';
  inviataIl: string;
  /** Presente solo se rifiutata: uno dei motivi predefiniti del cap. 9. */
  motivoRifiuto?: string;
}

const ELEMENTI: Elemento[] = ['latte', 'veleno', 'acqua', 'fuoco', 'petrolio', 'sangue'];
const TIPI: TipoCarta[] = ['mischia', 'distanza', 'support'];

/**
 * Applica uno strumento a una tela. Pura: prende la tela di partenza e i due
 * estremi del tratto, restituisce la tela nuova. Sta qui e non in main.ts
 * proprio per poterla provare senza un browser.
 *
 * La gomma e' la matita che dipinge con il fondo: non serve un caso a parte.
 */
export function applicaStrumento(
  strumento: Strumento,
  da: Punto,
  a: Punto,
  base: Tela,
  colore: number,
): Tela {
  switch (strumento) {
    case 'matita':
      return disegnaLinea(base, da, a, colore);
    case 'gomma':
      return disegnaLinea(base, da, a, 0);
    case 'secchiello':
      return riempi(base, a, colore);
    case 'linea':
      return disegnaLinea(base, da, a, colore);
    case 'rettangolo':
      return disegnaRettangolo(base, da, a, colore);
    case 'contagocce':
      return base;
  }
}

export function bozzaIniziale(): Bozza {
  return {
    nome: '',
    tipo: 'mischia',
    elemento: 'sangue',
    vita: 4,
    attacco: 3,
    cronologia: cronologiaIniziale(),
    strumento: 'matita',
    colore: 4,
  };
}

/**
 * Riporta la bozza dentro le regole dopo una modifica.
 * Serve per il vincolo del latte: scegliendo quell'elemento con 8 punti vita
 * il selettore deve scendere a 5 da solo, non limitarsi a rifiutare.
 */
export function normalizzaBozza(bozza: Bozza): Bozza {
  const massimo = bozza.elemento === 'latte' ? CONFIG.carte.vitaMaxLatte : CONFIG.carte.vitaMax;
  const vita = Math.min(Math.max(CONFIG.carte.vitaMin, bozza.vita), massimo);
  return vita === bozza.vita ? bozza : { ...bozza, vita };
}

export function vitaMassimaPer(elemento: Elemento): number {
  return elemento === 'latte' ? CONFIG.carte.vitaMaxLatte : CONFIG.carte.vitaMax;
}

export interface StatoBozza {
  potenza: number;
  costo: number | null;
  rarita: string | null;
  oltreIlTetto: boolean;
  errori: string[];
  inviabile: boolean;
}

export function esaminaBozza(bozza: Bozza): StatoBozza {
  const statistiche = {
    vita: bozza.vita,
    attacco: bozza.attacco,
    tipo: bozza.tipo,
    elemento: bozza.elemento,
  };
  const potenza = calcolaPotenza(statistiche);
  const oltreIlTetto = potenza > CONFIG.carte.potenzaMax;
  const esito = validaCarta({ ...statistiche, nome: bozza.nome });

  const errori = [...esito.errori];
  if (!telaPiena(telaCorrente(bozza.cronologia))) errori.push('La tela e ancora vuota');

  return {
    potenza,
    costo: oltreIlTetto ? null : calcolaCosto(potenza),
    rarita: oltreIlTetto ? null : calcolaRarita(potenza),
    oltreIlTetto,
    errori,
    inviabile: errori.length === 0,
  };
}

/** Quale statistica conviene abbassare per rientrare nel tetto. */
export function suggerimentoPerRientrare(bozza: Bozza): string {
  const eccesso = calcolaPotenza({
    vita: bozza.vita, attacco: bozza.attacco, tipo: bozza.tipo, elemento: bozza.elemento,
  }) - CONFIG.carte.potenzaMax;
  if (eccesso <= 0) return '';

  const peso = CONFIG.costo.pesoAttacco[bozza.tipo];
  const puntiAttacco = Math.ceil(eccesso / peso);
  const puntiVita = Math.ceil(eccesso);

  return puntiAttacco <= puntiVita
    ? `Abbassa l attacco di ${puntiAttacco} per rientrare.`
    : `Abbassa la vita di ${puntiVita} per rientrare.`;
}

// -------------------------------------------------------------------- vista

export interface ContestoEditor {
  bozza: Bozza;
  /** La carta gia' inviata, se c'e': una sola per account. */
  gia: CartaCreata | null;
  messaggio: string;
}

function selettoreNumerico(nome: string, attributo: string, valore: number, da: number, a: number, massimo: number): string {
  const pulsanti: string[] = [];
  for (let n = da; n <= a; n++) {
    const bloccato = n > massimo;
    pulsanti.push(
      `<button type="button" class="tacca ${n === valore ? 'corrente' : ''}"
               data-${attributo}="${n}" ${bloccato ? 'disabled' : ''}>${n}</button>`,
    );
  }
  return `<div class="selettore"><span class="etichetta">${nome}</span><div class="tacche">${pulsanti.join('')}</div></div>`;
}

function tavolozza(bozza: Bozza): string {
  const caselle = PALETTE.map(
    (colore, indice) =>
      `<button type="button" class="colore ${indice === bozza.colore ? 'corrente' : ''}"
               data-colore="${indice}" style="background: ${colore}"
               title="Colore ${indice}"></button>`,
  );
  return `<div class="tavolozza">${caselle.join('')}</div>`;
}

function strumenti(bozza: Bozza): string {
  const pulsanti = STRUMENTI.map(
    (s) =>
      `<button type="button" class="filtro ${s.id === bozza.strumento ? 'corrente' : ''}"
               data-strumento="${s.id}" title="${fuggi(s.suggerimento)}">${s.nome}</button>`,
  );
  return `<div class="barra-filtri">${pulsanti.join('')}</div>`;
}

function barraPotenza(stato: StatoBozza, bozza: Bozza): string {
  const massimo = CONFIG.carte.potenzaMax;
  const quota = Math.min(100, (stato.potenza / massimo) * 100);
  const colore = stato.oltreIlTetto ? 'rossa' : stato.potenza > 16 ? 'gialla' : 'verde';

  const voci = scomposizionePotenza({
    vita: bozza.vita, attacco: bozza.attacco, tipo: bozza.tipo, elemento: bozza.elemento,
  }).voci.map(
    (v) =>
      `<li><span>${fuggi(v.etichetta)}${v.dettaglio ? ` <em>(${fuggi(v.dettaglio)})</em>` : ''}</span>
           <span class="numero-grosso">${String(v.valore).replace('.', ',')}</span></li>`,
  );

  return `
    <div class="potenza">
      <div class="conteggio">
        <span class="numero">${String(stato.potenza).replace('.', ',')}</span> / ${massimo} punti potenza
        <span class="barra-riempimento ${colore}"><span style="width: ${quota}%"></span></span>
      </div>
      <ul class="scomposizione">${voci.join('')}</ul>
      ${
        stato.oltreIlTetto
          ? `<p class="esito-mazzo non-valido">Oltre il tetto. ${fuggi(suggerimentoPerRientrare(bozza))}</p>`
          : `<p class="esito-mazzo valido">Costo <span class="costo">${stato.costo}</span> gocce - rarita ${stato.rarita}</p>`
      }
    </div>`;
}

function anteprima(bozza: Bozza, stato: StatoBozza): string {
  const etichetta = bozza.tipo === 'support' ? 'cura' : 'atk';
  return `
    <figure class="anteprima-carta" style="--elemento: var(--${bozza.elemento})">
      <span class="costo-angolo">${stato.costo ?? '!'}</span>
      <canvas data-anteprima width="32" height="32" class="ritratto-grande"></canvas>
      <figcaption class="nome-carta">${fuggi(bozza.nome || 'Senza nome')}</figcaption>
      <div class="riga-stat">
        <span class="vita">${bozza.vita}</span>
        <span>${bozza.attacco}${etichetta === 'cura' ? '+' : ''}</span>
      </div>
      <div class="tipo-elemento">${bozza.tipo} - ${bozza.elemento}</div>
    </figure>`;
}

export function paginaEditor(c: ContestoEditor): string {
  if (c.gia) return cartaGiaInviata(c.gia);

  const bozza = c.bozza;
  const stato = esaminaBozza(bozza);
  const massimoVita = vitaMassimaPer(bozza.elemento);

  const tipi = TIPI.map(
    (t) => `<button type="button" class="filtro ${t === bozza.tipo ? 'corrente' : ''}" data-tipo="${t}">${t}</button>`,
  );
  const elementi = ELEMENTI.map(
    (e) =>
      `<button type="button" class="filtro elemento ${e === bozza.elemento ? 'corrente' : ''}"
               data-elemento="${e}" style="--elemento: var(--${e})">${e}</button>`,
  );

  return `
    <div class="pagina due-colonne">
      <section class="pannello">
        <h2>Disegno</h2>
        ${strumenti(bozza)}
        ${tavolozza(bozza)}
        <div class="area-tela">
          <canvas data-tela width="32" height="32" class="tela"></canvas>
        </div>
        <div class="barra-filtri">
          <button type="button" class="filtro" data-azione="annulla"
                  ${puoAnnullare(bozza.cronologia) ? '' : 'disabled'}>Annulla</button>
          <button type="button" class="filtro" data-azione="ripeti"
                  ${puoRipetere(bozza.cronologia) ? '' : 'disabled'}>Ripeti</button>
          <button type="button" class="filtro" data-azione="specchia">Specchia</button>
          <button type="button" class="filtro" data-azione="svuota">Svuota</button>
        </div>
        <p class="nota">
          Tela 32x32, 16 colori. Il disegno si salva come 512 byte di testo,
          non come immagine: e cio che permette di caricarne cinquanta in una
          sola richiesta.
        </p>
      </section>

      <section class="pannello">
        <h2>Statistiche</h2>

        <label class="campo">
          <span>Nome (max ${CONFIG.carte.nomeMaxCaratteri})</span>
          <input type="text" data-campo="nome-carta" value="${fuggi(bozza.nome)}"
                 maxlength="${CONFIG.carte.nomeMaxCaratteri}" placeholder="Come si chiama" />
        </label>

        <div class="barra-filtri">${tipi.join('')}</div>
        <div class="barra-filtri">${elementi.join('')}</div>

        ${selettoreNumerico('Vita', 'vita', bozza.vita, CONFIG.carte.vitaMin, CONFIG.carte.vitaMax, massimoVita)}
        ${
          bozza.elemento === 'latte'
            ? `<p class="nota">Le carte latte si fermano a ${CONFIG.carte.vitaMaxLatte} punti vita.</p>`
            : ''
        }
        ${selettoreNumerico(
          bozza.tipo === 'support' ? 'Cura' : 'Attacco',
          'attacco',
          bozza.attacco,
          CONFIG.carte.attaccoMin,
          CONFIG.carte.attaccoMax,
          CONFIG.carte.attaccoMax,
        )}

        ${barraPotenza(stato, bozza)}
        ${anteprima(bozza, stato)}

        ${
          stato.errori.length > 0
            ? `<ul class="esito-mazzo non-valido">${stato.errori.map((e) => `<li>${fuggi(e)}</li>`).join('')}</ul>`
            : ''
        }
        <button type="button" class="bottone" data-azione="invia-carta" ${stato.inviabile ? '' : 'disabled'}>
          Invia la carta
        </button>
        <p class="nota">
          Una sola carta per account. Dopo l invio non si modifica: se finisce
          nelle collezioni di altri giocatori, cambiarla cambierebbe le loro carte.
        </p>
      </section>
    </div>`;
}

function cartaGiaInviata(carta: CartaCreata): string {
  const stato = {
    pending: { etichetta: 'in moderazione', classe: 'costo' },
    approved: { etichetta: 'approvata', classe: 'vita' },
    rejected: { etichetta: 'rifiutata', classe: 'costo' },
  }[carta.stato];

  const spiegazione =
    carta.stato === 'pending'
      ? `<p class="nota">
           La revisione e manuale e passa dal pannello di moderazione. Nel
           frattempo la carta e nella tua collezione e la puoi mettere nel
           mazzo per giocare in locale, contrassegnata come non approvata.
         </p>
         <p class="nota">
           Nessun filtro automatico riconosce in modo affidabile un disegno
           offensivo a 32x32: l occhio umano in coda e l unica difesa reale,
           ed e il motivo per cui l approvazione e manuale.
         </p>`
      : carta.stato === 'approved'
        ? `<p class="nota">
             Approvata: la carta e entrata nel pool. Quando ci sara il server
             sara estraibile dai bauli e comparira nel feed della home.
           </p>`
        : `<div class="esito-mazzo non-valido">
             <strong>Rifiutata:</strong> ${fuggi(carta.motivoRifiuto ?? 'motivo non indicato')}
           </div>
           <p class="nota">
             Il tentativo torna disponibile: puoi disegnarne un altra. La carta
             rifiutata esce dalla tua collezione e dai mazzi in cui l avevi messa.
           </p>
           <button type="button" class="bottone" data-azione="rifai-carta">Rifai la carta</button>`;

  return `
    <div class="pagina">
      <section class="pannello">
        <h2>La tua carta</h2>
        <div class="due-colonne">
          <figure class="anteprima-carta" style="--elemento: var(--${carta.elemento})">
            <span class="costo-angolo">${carta.costo}</span>
            <canvas data-anteprima width="32" height="32" class="ritratto-grande"></canvas>
            <figcaption class="nome-carta">${fuggi(carta.nome)}</figcaption>
            <div class="riga-stat">
              <span class="vita">${carta.vita}</span>
              <span>${carta.attacco}${carta.tipo === 'support' ? '+' : ''}</span>
            </div>
            <div class="tipo-elemento">${carta.tipo} - ${carta.elemento}</div>
          </figure>
          <div>
            <dl class="statistiche">
              <dt>Stato</dt><dd class="${stato.classe}">${stato.etichetta}</dd>
              <dt>Potenza</dt><dd>${String(carta.potenza).replace('.', ',')} / ${CONFIG.carte.potenzaMax}</dd>
              <dt>Costo</dt><dd>${carta.costo}</dd>
              <dt>Rarita</dt><dd>${carta.rarita}</dd>
              <dt>Inviata il</dt><dd>${fuggi(carta.inviataIl)}</dd>
            </dl>
            ${spiegazione}
          </div>
        </div>
      </section>
    </div>`;
}
