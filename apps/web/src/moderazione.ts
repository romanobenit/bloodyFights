import { CONFIG } from '@bloodyfights/motore';
import type { CartaCreata } from './editor.ts';
import { fuggi } from './vista.ts';

/**
 * MODERAZIONE (cap. 9).
 *
 * Una carta creata da un utente non entra nel pool pubblico da sola: passa da
 * una coda di approvazione manuale. Il filtro automatico ferma solo nome e
 * tetto di potenza; il resto lo guarda una persona.
 *
 * Il motivo e' nel documento ed e' bene ricordarlo qui: una tela 32x32 a 16
 * colori e' piccola ma basta per disegnare simboli odiosi o immagini sessuali,
 * e nessun filtro automatico li riconosce in modo affidabile a quella
 * risoluzione. L'occhio umano in coda e' l'unica difesa reale.
 *
 * Come il resto del progetto: funzioni pure. La coda oggi e' locale, domani
 * arrivera' dal server, e queste regole non cambieranno.
 */

export type EsitoRevisione = 'approved' | 'rejected';

/** Le motivazioni predefinite del cap. 9. Elenco chiuso, non testo libero. */
export const MOTIVI_RIFIUTO = [
  { id: 'offensivo', testo: 'Contenuto offensivo' },
  { id: 'plagio', testo: 'Plagio di un personaggio esistente' },
  { id: 'illeggibile', testo: 'Disegno illeggibile' },
  { id: 'nome', testo: 'Nome inadeguato' },
] as const;

export type MotivoRifiuto = (typeof MOTIVI_RIFIUTO)[number]['id'];

export function testoDelMotivo(id: string): string {
  return MOTIVI_RIFIUTO.find((m) => m.id === id)?.testo ?? id;
}

export interface Decisione {
  /** Identificatore della carta giudicata. */
  cartaId: string;
  nomeCarta: string;
  creatore: string;
  esito: EsitoRevisione;
  motivo?: MotivoRifiuto;
  quando: string;
  /** Una decisione revocata resta nel registro: si vede che e' stata corretta. */
  revocata?: boolean;
}

/**
 * La coda, ordinata per data di invio: chi ha aspettato di piu' passa prima.
 * Non tocca l'array ricevuto.
 */
export function coda(carte: readonly CartaCreata[]): CartaCreata[] {
  return carte
    .filter((c) => c.stato === 'pending')
    .slice()
    .sort((a, b) => a.inviataIl.localeCompare(b.inviataIl));
}

export function approva(carta: CartaCreata, creatore: string, quando: string): {
  carta: CartaCreata;
  decisione: Decisione;
} {
  return {
    carta: { ...carta, stato: 'approved', motivoRifiuto: undefined },
    decisione: {
      cartaId: carta.nome,
      nomeCarta: carta.nome,
      creatore,
      esito: 'approved',
      quando,
    },
  };
}

export function rifiuta(
  carta: CartaCreata,
  motivo: MotivoRifiuto,
  creatore: string,
  quando: string,
): { carta: CartaCreata; decisione: Decisione } {
  return {
    carta: { ...carta, stato: 'rejected', motivoRifiuto: motivo },
    decisione: {
      cartaId: carta.nome,
      nomeCarta: carta.nome,
      creatore,
      esito: 'rejected',
      motivo,
      quando,
    },
  };
}

/**
 * Riporta una carta in coda annullando l'ultima decisione presa su di lei.
 * Il documento lo chiede esplicitamente: serve per tornare indietro su un
 * rifiuto sbagliato. La decisione non sparisce dal registro, viene segnata
 * come revocata: un registro che si puo' riscrivere non e' un registro.
 */
export function revoca(
  carta: CartaCreata,
  decisioni: readonly Decisione[],
): { carta: CartaCreata; decisioni: Decisione[] } {
  const ultima = [...decisioni].reverse().find((d) => d.cartaId === carta.nome && !d.revocata);
  if (!ultima) return { carta, decisioni: [...decisioni] };

  return {
    carta: { ...carta, stato: 'pending', motivoRifiuto: undefined },
    decisioni: decisioni.map((d) => (d === ultima ? { ...d, revocata: true } : d)),
  };
}

// ----------------------------------------------------------- scorciatoie

/**
 * Con centinaia di carte in coda la revisione si fa a tastiera, non a mouse:
 * una mano sola, senza mirare. Le cifre scelgono il motivo del rifiuto
 * nell'ordine in cui sono elencate.
 */
export const SCORCIATOIE: { tasto: string; cosa: string }[] = [
  { tasto: 'A', cosa: 'Approva' },
  { tasto: '1-4', cosa: 'Rifiuta con il motivo corrispondente' },
  { tasto: 'Z', cosa: 'Revoca l ultima decisione' },
];

/** Traduce un tasto in un comando. null se il tasto non fa niente. */
export function comandoDaTasto(
  tasto: string,
): { tipo: 'approva' } | { tipo: 'rifiuta'; motivo: MotivoRifiuto } | { tipo: 'revoca' } | null {
  const minuscolo = tasto.toLowerCase();
  if (minuscolo === 'a') return { tipo: 'approva' };
  if (minuscolo === 'z') return { tipo: 'revoca' };

  const cifra = Number(tasto);
  if (Number.isInteger(cifra) && cifra >= 1 && cifra <= MOTIVI_RIFIUTO.length) {
    return { tipo: 'rifiuta', motivo: MOTIVI_RIFIUTO[cifra - 1].id };
  }
  return null;
}

// ---------------------------------------------------------------- vista

export interface ContestoModerazione {
  coda: CartaCreata[];
  decisioni: Decisione[];
  /** Carte gia' giudicate, per poter revocare. */
  giudicate: CartaCreata[];
  creatore: string;
  messaggio: string;
}

function schedaCarta(carta: CartaCreata, creatore: string, posizione: number): string {
  const bottoni = MOTIVI_RIFIUTO.map(
    (m, i) =>
      `<button type="button" class="filtro" data-rifiuta="${m.id}">
         <span class="tasto">${i + 1}</span> ${fuggi(m.testo)}
       </button>`,
  );

  return `
    <article class="scheda-revisione" style="--elemento: var(--${carta.elemento})">
      <div class="posizione">#${posizione + 1} in coda</div>

      <div class="revisione-corpo">
        <figure class="anteprima-carta">
          <span class="costo-angolo">${carta.costo}</span>
          <canvas data-anteprima width="32" height="32" class="ritratto-grande"></canvas>
          <figcaption class="nome-carta">${fuggi(carta.nome)}</figcaption>
        </figure>

        <dl class="statistiche">
          <dt>Creatore</dt><dd>${fuggi(creatore)}</dd>
          <dt>Tipo</dt><dd>${carta.tipo}</dd>
          <dt>Elemento</dt><dd>${carta.elemento}</dd>
          <dt>Vita</dt><dd class="vita">${carta.vita}</dd>
          <dt>${carta.tipo === 'support' ? 'Cura' : 'Attacco'}</dt><dd>${carta.attacco}</dd>
          <dt>Potenza</dt><dd>${String(carta.potenza).replace('.', ',')} / ${CONFIG.carte.potenzaMax}</dd>
          <dt>Costo</dt><dd class="costo">${carta.costo}</dd>
          <dt>Rarita</dt><dd>${carta.rarita}</dd>
          <dt>Inviata il</dt><dd>${fuggi(carta.inviataIl)}</dd>
        </dl>
      </div>

      <div class="decisione">
        <button type="button" class="bottone" data-approva="si">
          <span class="tasto">A</span> Approva
        </button>
        <div class="barra-filtri">${bottoni.join('')}</div>
      </div>
    </article>`;
}

function registro(c: ContestoModerazione): string {
  if (c.decisioni.length === 0) return '<p class="nota">Nessuna decisione presa finora.</p>';

  const voci = [...c.decisioni].reverse().map((d) => {
    const esito = d.esito === 'approved' ? 'approvata' : `rifiutata - ${testoDelMotivo(d.motivo ?? '')}`;
    return `<li class="${d.revocata ? 'revocata' : d.esito}">
        <span>${fuggi(d.quando)} - <strong>${fuggi(d.nomeCarta)}</strong> ${fuggi(esito)}</span>
        ${d.revocata ? '<em>revocata</em>' : ''}
      </li>`;
  });

  return `<ul class="registro-decisioni">${voci.join('')}</ul>`;
}

export function paginaModerazione(c: ContestoModerazione): string {
  const inCoda = c.coda.length;
  const revocabili = c.giudicate.filter((carta) =>
    c.decisioni.some((d) => d.cartaId === carta.nome && !d.revocata),
  );

  return `
    <div class="pagina">
      <section class="pannello">
        <h2>Coda di revisione - ${inCoda} ${inCoda === 1 ? 'carta' : 'carte'}</h2>
        ${
          inCoda === 0
            ? `<p class="nota">
                 Niente da revisionare. La coda si riempie quando qualcuno invia
                 una carta dall editor.
               </p>`
            : schedaCarta(c.coda[0], c.creatore, 0)
        }
        <p class="nota">
          Scorciatoie: ${SCORCIATOIE.map((s) => `<kbd>${s.tasto}</kbd> ${fuggi(s.cosa)}`).join(' - ')}.
          Con centinaia di carte in coda la revisione si fa a tastiera.
        </p>
      </section>

      ${
        revocabili.length > 0
          ? `<section class="pannello">
               <h2>Tornare indietro</h2>
               ${revocabili
                 .map(
                   (carta) => `
                 <div class="riga-revoca">
                   <span><strong>${fuggi(carta.nome)}</strong> - ${
                     carta.stato === 'approved'
                       ? 'approvata'
                       : `rifiutata (${fuggi(testoDelMotivo(carta.motivoRifiuto ?? ''))})`
                   }</span>
                   <button type="button" class="filtro" data-revoca="${fuggi(carta.nome)}">
                     <span class="tasto">Z</span> Rimetti in coda
                   </button>
                 </div>`,
                 )
                 .join('')}
             </section>`
          : ''
      }

      <section class="pannello">
        <h2>Registro delle decisioni</h2>
        ${registro(c)}
      </section>

      <section class="pannello">
        <h2>Come funzionera davvero</h2>
        <p class="nota">
          Questo pannello lavora sulla coda di questo browser, quindi vedi solo
          le tue carte e sei insieme creatore e moderatore: serve a provare il
          flusso, non a validare niente. Con il server della fase 4 la coda
          diventa condivisa, l accesso al pannello sara riservato ai moderatori,
          e la carta approvata entrera nel pool pubblico, estraibile dai bauli e
          visibile nel feed della home.
        </p>
      </section>
    </div>`;
}
