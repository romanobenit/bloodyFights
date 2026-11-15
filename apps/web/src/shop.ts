import { fuggi } from './vista.ts';
import type { AperturaRemota, BauleRemoto, CartaEstratta } from './cliente.ts';

/**
 * LO SHOP E L'APERTURA DEI BAULI.
 *
 * Funzione pura da contesto a stringa, come il resto della vista.
 *
 * L'apertura e' TEATRO: quando questa pagina comincia a scoprire le carte,
 * il server le ha gia' decise e registrate. Qui non si sorteggia niente - se
 * si sorteggiasse, ricaricare la pagina darebbe un baule diverso.
 */

export type StatoShop =
  | { tipo: 'senzaServer' }
  | { tipo: 'senzaConto' }
  | { tipo: 'listino' }
  | { tipo: 'apertura'; apertura: AperturaRemota; scoperte: number };

export interface ContestoShop {
  statoShop: StatoShop;
  bauli: readonly BauleRemoto[];
  oro: number;
  /** Quante carte della community sono approvate: se zero, i bauli sono vuoti. */
  carteNelPool: number;
  inCorso: boolean;
  errore: string;
}

const NOMI_RARITA: Record<string, string> = {
  comune: 'Comune',
  raro: 'Raro',
  epico: 'Epico',
  leggendario: 'Leggendario',
};

function probabilita(baule: BauleRemoto): string {
  const voci = Object.entries(baule.probabilita)
    .filter(([, p]) => p > 0)
    .map(([rarita, p]) => `<li><span>${NOMI_RARITA[rarita] ?? rarita}</span><b>${p}%</b></li>`);
  return `<ul class="probabilita">${voci.join('')}</ul>`;
}

function scheda(baule: BauleRemoto, c: ContestoShop): string {
  const comprabile = baule.prezzoOro !== null;
  const abbastanza = comprabile && c.oro >= baule.prezzoOro!;
  const poolVuoto = c.carteNelPool === 0;
  const spento = !comprabile || !abbastanza || poolVuoto || c.inCorso;

  const motivo = !comprabile
    ? 'Si comprera con denaro reale, quando i pagamenti saranno aperti.'
    : poolVuoto
      ? 'Nessuna carta della community e ancora approvata: i bauli sono vuoti.'
      : !abbastanza
        ? `Ti mancano ${baule.prezzoOro! - c.oro} Gocce d Oro.`
        : '';

  return `
    <div class="pannello baule ${spento ? 'spento' : ''}">
      <h2>${fuggi(baule.nome)}</h2>
      <p class="prezzo">${
        comprabile ? `${baule.prezzoOro} <span>GO</span>` : `${baule.prezzoEuro?.toFixed(2)} <span>EUR</span>`
      }</p>
      <p class="minuto">${baule.quanteCarte} carte${
        baule.garantita ? ` · 1 ${NOMI_RARITA[baule.garantita] ?? baule.garantita} garantito` : ''
      }</p>
      ${probabilita(baule)}
      ${motivo ? `<p class="minuto motivo">${fuggi(motivo)}</p>` : ''}
      <button type="button" class="bottone" data-apri-baule="${fuggi(baule.id)}" ${spento ? 'disabled' : ''}>
        ${c.inCorso ? 'Apro...' : 'Apri'}
      </button>
    </div>`;
}

function cartaScoperta(carta: CartaEstratta, girata: boolean): string {
  if (!girata) return '<div class="estratta coperta"><span>?</span></div>';
  return `
    <div class="estratta ${carta.rarita} ${carta.duplicata ? 'duplicata' : ''}">
      <span class="rarita">${NOMI_RARITA[carta.rarita] ?? carta.rarita}</span>
      <span class="nome-carta">${fuggi(carta.nome)}</span>
      ${carta.duplicata ? `<span class="rimborso">+${carta.oro} GO</span>` : '<span class="nuova">NUOVA</span>'}
    </div>`;
}

export function paginaShop(c: ContestoShop): string {
  const s = c.statoShop;

  if (s.tipo === 'senzaServer') {
    return `
      <div class="pannello avviso-online">
        <h2>Shop non disponibile</h2>
        <p>Le Gocce d Oro e le carte si guadagnano giocando online, e di
        quelle tiene il conto il server. Senza, lo shop non ha niente da
        vendere ne dove consegnarlo.</p>
      </div>`;
  }

  if (s.tipo === 'senzaConto') {
    return `
      <div class="pannello avviso-online">
        <h2>Serve un conto</h2>
        <p>Le Gocce d Oro e la collezione stanno sul tuo account.</p>
        <a class="bottone" href="#accesso" data-pagina="accesso">Vai all accesso</a>
      </div>`;
  }

  if (s.tipo === 'apertura') {
    const tutte = s.scoperte >= s.apertura.carte.length;
    const guadagnato = s.apertura.carte
      .slice(0, s.scoperte)
      .reduce((somma, carta) => somma + carta.oro, 0);

    return `
      <div class="apertura">
        <div class="pannello">
          <h2>${fuggi(s.apertura.bauleId === 'ferro' ? 'Baule di Ferro' : 'Baule di Sangue')}</h2>
          <div class="estratte">
            ${s.apertura.carte.map((carta, i) => cartaScoperta(carta, i < s.scoperte)).join('')}
          </div>
          ${
            tutte
              ? `<p class="minuto">${
                  guadagnato > 0 ? `Duplicati rimborsati: +${guadagnato} GO. ` : ''
                }Ti restano ${s.apertura.oroRimasto} Gocce d Oro.</p>
                 <button type="button" class="bottone" data-azione="chiudi-apertura">Chiudi</button>`
              : `<p class="minuto">Le carte sono gia decise: le sta solo scoprendo.</p>
                 <button type="button" class="bottone secondario" data-azione="scopri-tutto">Scopri tutto</button>`
          }
        </div>
      </div>`;
  }

  return `
    ${c.errore ? `<div class="messaggio">${fuggi(c.errore)}</div>` : ''}
    <div class="pannello saldo">
      <h2>Gocce d Oro</h2>
      <p class="punteggio">${c.oro} <span>GO</span></p>
      <p class="minuto">Vittoria 50 · Sconfitta 15 · Prima vittoria del giorno 100</p>
    </div>
    <div class="vetrina">
      ${c.bauli.map((b) => scheda(b, c)).join('')}
    </div>
    <p class="minuto nota-pool">${
      c.carteNelPool === 0
        ? 'I bauli contengono le carte create dalla community. Nessuna e ancora stata approvata, quindi per ora sono vuoti.'
        : `Nel pool ci sono ${c.carteNelPool} carte della community. Le venti carte base ce le hai gia tutte: i bauli non le contengono.`
    }</p>`;
}
