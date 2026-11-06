import { CONFIG, type CartaCompleta, type Elemento, type TipoCarta } from '@bloodyfights/motore';
import {
  MAZZI_MASSIMI, carteNelMazzo, disponibili, erroriMazzo, nelMazzo, possedute,
  type Mazzo, type Profilo,
} from './profilo.ts';
import { fuggi } from './vista.ts';

/**
 * LE PAGINE FUORI DALLA PARTITA: mazzo, profilo, tutorial.
 *
 * Stessa disciplina della vista del tabellone: funzioni pure da contesto a
 * stringa HTML, nessun accesso al DOM, quindi verificabili in Node.
 */

export type Pagina = 'gioca' | 'mazzo' | 'crea' | 'moderazione' | 'profilo' | 'accesso' | 'tutorial';

export const PAGINE: { id: Pagina; nome: string }[] = [
  { id: 'gioca', nome: 'Gioca' },
  { id: 'mazzo', nome: 'Mazzo' },
  { id: 'crea', nome: 'Crea carta' },
  { id: 'moderazione', nome: 'Moderazione' },
  { id: 'profilo', nome: 'Profilo' },
  { id: 'accesso', nome: 'Accedi' },
  { id: 'tutorial', nome: 'Tutorial' },
];

export type Filtro = 'tutti' | Elemento | TipoCarta;

export interface ContestoPagine {
  pagina: Pagina;
  profilo: Profilo;
  /** Il mazzo aperto nell'editor. */
  mazzo: Mazzo;
  catalogo: readonly CartaCompleta[];
  filtro: Filtro;
  messaggio: string;
  /** false quando il browser non conserva i dati fra una visita e l'altra. */
  duraturo: boolean;
  urlSprite: (cartaId: string) => string;
}

const ELEMENTI: Elemento[] = ['latte', 'veleno', 'acqua', 'fuoco', 'petrolio', 'sangue'];
const TIPI: TipoCarta[] = ['mischia', 'distanza', 'support', 'oggetto'];

// ------------------------------------------------------------- navigazione

/**
 * `etichette` permette di cambiare il nome di una voce senza toccare l'elenco:
 * serve ad "Accedi", che diventa il nickname quando si e' connessi.
 */
export function barraNavigazione(
  pagina: Pagina,
  etichette: Partial<Record<Pagina, string>> = {},
): string {
  const voci = PAGINE.map(
    (v) =>
      `<a class="voce ${v.id === pagina ? 'corrente' : ''}" href="#${v.id}" data-pagina="${v.id}">${fuggi(etichette[v.id] ?? v.nome)}</a>`,
  );
  return `<nav class="navigazione"><span class="marchio">BLOODY<span>FIGHTS</span></span>${voci.join('')}</nav>`;
}

// ------------------------------------------------------------ editor mazzo

function passaIlFiltro(carta: CartaCompleta, filtro: Filtro): boolean {
  return filtro === 'tutti' || carta.elemento === filtro || carta.tipo === filtro;
}

function cartaCollezione(c: ContestoPagine, carta: CartaCompleta): string {
  const libere = disponibili(c.profilo, c.mazzo, carta.id);
  const dentro = nelMazzo(c.mazzo, carta.id);
  const etichetta = carta.tipo === 'support' ? '+' : '';

  return `
    <button type="button" class="carta-collezione ${libere === 0 ? 'esaurita' : ''}"
            data-aggiungi="${carta.id}" style="--elemento: var(--${carta.elemento})"
            title="${fuggi(carta.nome)}: ${fuggi(carta.descrizione)}">
      <span class="costo-angolo">${carta.costo}</span>
      <img src="${c.urlSprite(carta.id)}" width="64" height="64" alt="" />
      <span class="nome-carta">${fuggi(carta.nome)}</span>
      <span class="riga-stat">
        <span class="vita">${carta.vita}</span>
        <span>${carta.attacco}${etichetta}</span>
      </span>
      <span class="descrizione-corta">${fuggi(carta.descrizione)}</span>
      <span class="possesso">${dentro > 0 ? `${dentro} nel mazzo - ` : ''}${libere} libere</span>
    </button>`;
}

/** Curva dei costi: dove pesa il mazzo, da 1 a 5 gocce. */
function curvaDeiCosti(c: ContestoPagine): string {
  const perCosto = new Map<number, number>();
  for (const [cartaId, quante] of Object.entries(c.mazzo.carte)) {
    const carta = c.catalogo.find((x) => x.id === cartaId);
    if (!carta) continue;
    perCosto.set(carta.costo, (perCosto.get(carta.costo) ?? 0) + quante);
  }
  const massimo = Math.max(1, ...perCosto.values());

  const colonne = [1, 2, 3, 4, 5].map((costo) => {
    const quante = perCosto.get(costo) ?? 0;
    const altezza = Math.round((quante / massimo) * 100);
    return `
      <div class="colonna-curva" title="${quante} carte da ${costo} gocce">
        <span class="quanto">${quante || ''}</span>
        <span class="barra" style="height: ${altezza}%"></span>
        <span class="costo">${costo}</span>
      </div>`;
  });

  return `<div class="curva">${colonne.join('')}</div>`;
}

function listaMazzo(c: ContestoPagine): string {
  const voci = Object.entries(c.mazzo.carte)
    .map(([cartaId, quante]) => ({ carta: c.catalogo.find((x) => x.id === cartaId), quante }))
    .filter((v): v is { carta: CartaCompleta; quante: number } => v.carta !== undefined)
    .sort((a, b) => a.carta.costo - b.carta.costo || a.carta.nome.localeCompare(b.carta.nome))
    .map(
      ({ carta, quante }) => `
      <button type="button" class="voce-mazzo" data-togli="${carta.id}"
              style="--elemento: var(--${carta.elemento})" title="Togli una copia">
        <span class="costo-angolo">${carta.costo}</span>
        <img src="${c.urlSprite(carta.id)}" width="32" height="32" alt="" />
        <span class="nome-carta">${fuggi(carta.nome)}</span>
        <span class="quante">x${quante}</span>
      </button>`,
    );

  if (voci.length === 0) return '<p class="nota">Il mazzo e vuoto. Scegli le carte dalla collezione.</p>';
  return `<div class="lista-mazzo">${voci.join('')}</div>`;
}

function paginaMazzo(c: ContestoPagine): string {
  const errori = erroriMazzo(c.profilo, c.mazzo, c.catalogo);
  const quante = carteNelMazzo(c.mazzo);
  const pieno = quante >= CONFIG.mazzo.carteNelMazzo;

  const filtri = (['tutti', ...TIPI, ...ELEMENTI] as Filtro[]).map(
    (f) =>
      `<button type="button" class="filtro ${f === c.filtro ? 'corrente' : ''}" data-filtro="${f}">${f}</button>`,
  );

  const collezione = c.catalogo
    .filter((carta) => passaIlFiltro(carta, c.filtro))
    .map((carta) => cartaCollezione(c, carta));

  const sceltaMazzi = c.profilo.mazzi
    .map(
      (m) =>
        `<button type="button" class="filtro ${m.id === c.mazzo.id ? 'corrente' : ''}" data-mazzo="${m.id}">
           ${fuggi(m.nome)}${m.id === c.profilo.mazzoAttivoId ? ' *' : ''}
         </button>`,
    )
    .join('');

  return `
    <div class="pagina due-colonne">
      <section class="pannello">
        <h2>Collezione</h2>
        <div class="barra-filtri">${filtri.join('')}</div>
        <div class="griglia-collezione">${collezione.join('')}</div>
      </section>

      <section class="pannello colonna-mazzo">
        <h2>Mazzo</h2>
        <div class="barra-filtri">
          ${sceltaMazzi}
          <button type="button" class="filtro" data-azione="nuovo-mazzo"
                  ${c.profilo.mazzi.length >= MAZZI_MASSIMI ? 'disabled' : ''}>+ nuovo</button>
        </div>

        <label class="campo">
          <span>Nome</span>
          <input type="text" data-campo="nome-mazzo" value="${fuggi(c.mazzo.nome)}" maxlength="24" />
        </label>

        <div class="conteggio ${pieno ? 'completo' : ''}">
          <span class="numero">${quante}</span> / ${CONFIG.mazzo.carteNelMazzo} carte
          <span class="barra-riempimento"><span style="width: ${Math.min(100, (quante / CONFIG.mazzo.carteNelMazzo) * 100)}%"></span></span>
        </div>

        ${curvaDeiCosti(c)}
        ${listaMazzo(c)}

        ${
          errori.length === 0
            ? `<p class="esito-mazzo valido">Mazzo giocabile.</p>
               <button type="button" class="bottone" data-azione="attiva-mazzo"
                       ${c.mazzo.id === c.profilo.mazzoAttivoId ? 'disabled' : ''}>
                 ${c.mazzo.id === c.profilo.mazzoAttivoId ? 'Gia attivo' : 'Rendi attivo'}
               </button>`
            : `<ul class="esito-mazzo non-valido">${errori.map((e) => `<li>${fuggi(e)}</li>`).join('')}</ul>`
        }
      </section>
    </div>`;
}

// ---------------------------------------------------------------- profilo

function paginaProfilo(c: ContestoPagine): string {
  const p = c.profilo;
  const partite = p.vittorie + p.sconfitte;
  const percentuale = partite === 0 ? '-' : `${Math.round((p.vittorie / partite) * 100)}%`;
  const copie = Object.values(p.collezione).reduce((s, n) => s + n, 0);

  return `
    <div class="pagina due-colonne">
      <section class="pannello">
        <h2>Dati pubblici</h2>
        <label class="campo">
          <span>Nickname</span>
          <input type="text" data-campo="nickname" value="${fuggi(p.nickname)}" maxlength="20" />
        </label>
        <label class="campo">
          <span>Bio</span>
          <textarea data-campo="bio" rows="3" maxlength="160">${fuggi(p.bio)}</textarea>
        </label>

        <h2>La tua carta</h2>
        <p class="nota">
          ${
            p.cartaCreata
              ? 'Hai gia creato la tua carta.'
              : 'Non hai ancora creato la tua carta. L editor arriva con la fase 3: una sola carta per account, poi passa dalla moderazione.'
          }
        </p>
      </section>

      <section class="pannello">
        <h2>Statistiche</h2>
        <dl class="statistiche">
          <dt>Vittorie</dt><dd class="vita">${p.vittorie}</dd>
          <dt>Sconfitte</dt><dd>${p.sconfitte}</dd>
          <dt>Partite</dt><dd>${partite}</dd>
          <dt>Percentuale</dt><dd class="costo">${percentuale}</dd>
          <dt>Carte in collezione</dt><dd>${copie}</dd>
          <dt>Mazzi</dt><dd>${p.mazzi.length} / ${MAZZI_MASSIMI}</dd>
        </dl>

        <h2>Dove stanno questi dati</h2>
        <p class="nota">
          ${
            c.duraturo
              ? 'Nel tuo browser, su questo computer. Non c e ancora un account: il server arriva con la fase 4, e allora il profilo ti seguira ovunque.'
              : 'Solo in memoria: questo browser non conserva i dati fra una visita e l altra, quindi chiudendo la pagina il profilo riparte da zero.'
          }
        </p>
      </section>
    </div>`;
}

// --------------------------------------------------------------- tutorial

/** Tabellino schematico 4x2 usato per spiegare le regole. */
function schema(caselle: Record<number, string>, titolo: string): string {
  const righe = [0, 1].map((linea) => {
    const celle = [0, 1, 2, 3].map((colonna) => {
      const indice = linea * 4 + colonna;
      const contenuto = caselle[indice] ?? '';
      return `<span class="cella ${contenuto ? 'piena' : ''}">${fuggi(contenuto)}</span>`;
    });
    return `<div class="riga-schema">${celle.join('')}</div>`;
  });
  return `<figure class="schema"><figcaption>${fuggi(titolo)}</figcaption>${righe.join('')}</figure>`;
}

/**
 * TUTORIAL.
 *
 * Riscritto in frasi brevi. Il font pixel regge una riga asciutta e affonda
 * su un periodo lungo: l'occhio deve poter saltare da una frase alla
 * successiva senza rileggere. Ogni paragrafo dice una cosa sola.
 */
function paginaTutorial(): string {
  return `
    <div class="pagina">
      <section class="pannello prosa">
        <h2>In breve</h2>
        <p>Due giocatori. Turni alterni.</p>
        <p>
          Otto caselle a testa: quattro colonne, due linee. Vince chi porta a
          zero i ${CONFIG.tabellone.vitaGiocatore} punti vita dell altro.
        </p>
        <p>La posizione conta quanto le statistiche.</p>
        ${schema({ 0: 'mischia', 1: 'mischia', 5: 'distanza' }, 'Prima linea sopra, seconda sotto')}
        <p>Una carta da mischia in seconda linea non attacca. Resta nascosta.</p>
        <p>Una carta a distanza invece colpisce scavalcando, al riparo.</p>
        <p>
          Le colonne si fronteggiano a specchio. La tua prima colonna sta
          davanti alla quarta dell avversario.
        </p>
        <p>Ogni carta attacca la propria colonna. Mai di sbieco.</p>
      </section>

      <section class="pannello prosa">
        <h2>Il turno</h2>
        <p>Si apre con una goccia di sangue e una carta pescata.</p>
        <p>Poi quattro fasi, in ordine. Non si torna indietro.</p>

        <h3>1. Evocazione</h3>
        <p>Giochi quante carte vuoi, finche hai gocce e caselle libere.</p>
        <p>Una carta appena evocata e <em>fresca</em>: non attacca e non cura.</p>
        <p>Diventa operativa dal turno dopo.</p>

        <h3>2. Riposizionamento</h3>
        <p>Una sola mossa per turno.</p>
        <p>Scambi due tue carte, oppure ne sposti una su una casella libera.</p>
        ${schema({ 0: 'vuota', 4: 'mischia ->' }, 'La mischia sale in prima linea')}

        <h3>3. Support</h3>
        <p>Ogni support in campo sceglie: cura un alleato, oppure fa una goccia.</p>
        <p>Cura di tanti punti quanto il suo attacco. Le due cose si escludono.</p>

        <h3>4. Attacco</h3>
        <p>Tutte le tue carte non fresche attaccano insieme.</p>
        <p>Il difensore non risponde. Subisce e basta.</p>
        <p>Il colpo cerca la prima linea. Se e vuota, la seconda.</p>
        <p>Se sono vuote entrambe, arriva al giocatore.</p>
        ${schema({ 0: 'bersaglio', 4: '(al riparo)' }, 'Si colpisce la prima linea finche c e')}
        <p>Il danno in eccesso non trabocca sulla carta dietro.</p>
      </section>

      <section class="pannello prosa">
        <h2>Gli elementi</h2>
        <p>Cinque elementi in catena. Il sesto sta fuori.</p>
        <p class="catena">latte &rarr; veleno &rarr; acqua &rarr; fuoco &rarr; petrolio</p>
        <p>Chi ha il vantaggio infligge il 50% in piu.</p>
        <p>Il petrolio fa eccezione: +20%, ma contro tre elementi su sei.</p>
        <p>Il fuoco e immune al petrolio. Il sangue e neutro da entrambi i lati.</p>
        <p>
          Il vantaggio agisce <strong>solo sul danno inflitto</strong>. Chi e in
          svantaggio non subisce di piu: colpisce di meno.
        </p>
      </section>

      <section class="pannello prosa">
        <h2>Le gocce</h2>
        <p>Una goccia a turno. Si accumulano fino a ${CONFIG.economia.tettoGocce}.</p>
        <p>Evocare costa da 1 a 5 gocce.</p>
        <p>Il costo non lo sceglie chi crea la carta. Lo calcola una formula.</p>
        <p>Al turno n hai n gocce, se non hai speso niente.</p>
        <p>La prima carta da 5 arriva cosi al turno 5.</p>
        <p>Il tetto evita che qualcuno stia fermo dieci turni e poi svuoti la mano.</p>
      </section>

      <section class="pannello prosa">
        <h2>Le carte oggetto</h2>
        <p>Non vanno in campo. Si giocano dalla mano e fanno effetto subito.</p>
        <p>Si possono giocare in qualunque fase del tuo turno.</p>
        <p>La Goccia di Sangue costa 0 e ti da una goccia.</p>
        <p>
          <a class="bottone" href="#gioca" data-pagina="gioca">Prova contro il bot</a>
        </p>
      </section>
    </div>`;
}

// ------------------------------------------------------------------ uscita

/**
 * Il corpo della pagina, SENZA la barra di navigazione: quella la mette
 * sempre chi disegna, in un punto solo. Averla anche qui significava
 * disegnarla due volte e doverne togliere una a forza di sostituzioni.
 */
export function disegnaPagina(c: ContestoPagine): string {
  const corpo =
    c.pagina === 'mazzo' ? paginaMazzo(c) : c.pagina === 'profilo' ? paginaProfilo(c) : paginaTutorial();

  return `
    ${c.messaggio ? `<div class="messaggio">${fuggi(c.messaggio)}</div>` : ''}
    ${corpo}`;
}
