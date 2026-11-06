import {
  CARTE_BASE,
  statisticheDerivate,
  type CartaCompleta,
  type Elemento,
  type TipoCarta,
  applicaAzione,
  creaPartita,
  mazzoBaseCompleto,
  type Azione,
  type CartaInCampo,
  type IndiceGiocatore,
  type StatoPartitaConCatalogo,
} from '@bloodyfights/motore';
import { mossaBot } from '@bloodyfights/bot';
import { mazzoBaseCompleto as _mazzoBase } from '@bloodyfights/motore';
import {
  DIMENSIONE_TELA, PALETTE, codifica, decodifica, registra, segnapostoBase64, specchiaOrizzontale, svuota, telaCorrente, telaPiena,
  annulla as annullaTratto, ripeti as ripetiTratto, colorePixel, cronologiaIniziale,
  type Punto, type Strumento, type Tela,
} from '@bloodyfights/pixel';
import {
  applicaStrumento, bozzaIniziale, esaminaBozza, normalizzaBozza, paginaEditor,
  type Bozza, type CartaCreata, type ContestoEditor,
} from './editor.ts';
import {
  approva, coda, comandoDaTasto, paginaModerazione, revoca, rifiuta,
  type ContestoModerazione, type MotivoRifiuto,
} from './moderazione.ts';
import {
  ErroreServer, creaCliente, indirizzoServerPredefinito,
  type UtenteRemoto,
} from './cliente.ts';
import {
  etichettaAccesso, moduloVuoto, paginaAccesso,
  type ContestoAccesso, type ModoAccesso, type ModuloAccesso, type StatoServer,
} from './accesso.ts';
import { depositoLocale, type Deposito } from './deposito.ts';
import {
  PAGINE,
  barraNavigazione,
  disegnaPagina,
  type ContestoPagine,
  type Filtro,
  type Pagina,
} from './pagine.ts';
import {
  aggiungiAlMazzo,
  mazzoAttivo,
  mazzoComeLista,
  mazzoGiocabile,
  nuovoMazzo,
  profiloIniziale,
  registraEsito,
  sostituisciMazzo,
  togliDalMazzo,
  type Mazzo,
  type Profilo,
} from './profilo.ts';
import {
  DURATE,
  disegna,
  type Animazione,
  type ColpoAnimato,
  type MorteAnimata,
  type Schermata,
  type Selezione,
} from './vista.ts';

/**
 * Collegamento con la pagina: stato dell'interfaccia, eventi, turno del bot.
 * Tutto cio' che riguarda le regole sta nel motore; qui non c'e' una sola
 * regola di gioco, solo la traduzione dei clic in azioni.
 */

const IO: IndiceGiocatore = 0;
/** Pausa fra due mosse del bot quando non c'e' niente da guardare. */
const PAUSA_BOT = 420;
/** Pausa dopo una mossa gia' animata: l'animazione ha fatto da pausa. */
const PAUSA_CORTA = 130;

const radice = document.getElementById('radice');
if (!radice) throw new Error('Manca il contenitore #radice nella pagina');

// ------------------------------------------------------------------ sprite

const base64PerCarta = new Map(CARTE_BASE.map((c) => [c.id, segnapostoBase64(c)]));
const cacheSprite = new Map<string, string>();

/** La carta creata dall'utente vive accanto alle venti di base. */
export const ID_CARTA_UTENTE = 'utente-1';

function cartaUtente(): CartaCompleta | null {
  const creata = profilo?.cartaCreata;
  // Una carta respinta dalla revisione esce dal catalogo: non deve comparire
  // nella collezione ne' poter rientrare in un mazzo. Resta leggibile in
  // `profilo.cartaCreata`, perche' l'editor deve mostrarne il motivo e il
  // pannello deve poter revocare il rifiuto.
  if (!creata || creata.stato === 'rejected') return null;
  return {
    id: ID_CARTA_UTENTE,
    nome: creata.nome,
    tipo: creata.tipo,
    elemento: creata.elemento,
    vita: creata.vita,
    attacco: creata.attacco,
    // Il `?? ''` copre i profili salvati prima che la descrizione esistesse:
    // senza, la pagina del mazzo cadeva su un campo assente.
    descrizione: creata.descrizione ?? '',
    creatoreId: 'io',
    ...statisticheDerivate(creata),
  };
}

/**
 * Il catalogo della partita: le carte base piu' quella creata, se c'e'.
 * Il costo si ricalcola dalla formula anche per la carta dell'utente, cosi'
 * una ritaratura dei pesi la ribilancia come tutte le altre.
 */
function catalogo(): CartaCompleta[] {
  const mia = cartaUtente();
  return mia ? [...CARTE_BASE, mia] : [...CARTE_BASE];
}

/**
 * Da 1024 indici di palette a un'immagine PNG, una volta per carta.
 * Il risultato si tiene in cache: senza, ogni ridisegno rifarebbe venti
 * conversioni. L'indice 0 diventa trasparente, cosi' il fondo della carta
 * passa attraverso e la silhouette resta definita dal suo contorno.
 */
function urlSprite(cartaId: string): string {
  const inCache = cacheSprite.get(cartaId);
  if (inCache) return inCache;

  const base64 =
    cartaId === ID_CARTA_UTENTE ? profilo.cartaCreata?.pixels : base64PerCarta.get(cartaId);
  if (!base64) return '';

  const tela = decodifica(base64);
  const tavola = document.createElement('canvas');
  tavola.width = DIMENSIONE_TELA;
  tavola.height = DIMENSIONE_TELA;
  const contesto = tavola.getContext('2d');
  if (!contesto) return '';

  const immagine = contesto.createImageData(DIMENSIONE_TELA, DIMENSIONE_TELA);
  for (let i = 0; i < tela.length; i++) {
    const colore = PALETTE[tela[i]];
    immagine.data[i * 4] = parseInt(colore.slice(1, 3), 16);
    immagine.data[i * 4 + 1] = parseInt(colore.slice(3, 5), 16);
    immagine.data[i * 4 + 2] = parseInt(colore.slice(5, 7), 16);
    immagine.data[i * 4 + 3] = tela[i] === 0 ? 0 : 255;
  }
  contesto.putImageData(immagine, 0, 0);

  const url = tavola.toDataURL('image/png');
  cacheSprite.set(cartaId, url);
  return url;
}

// ------------------------------------------------------- stato dell'interfaccia

// ------------------------------------------------- profilo e navigazione

const CHIAVE_PROFILO = 'profilo';
const deposito: Deposito = depositoLocale();

let profilo: Profilo = caricaProfilo();
let pagina: Pagina = paginaDallIndirizzo();
let mazzoApertoId: string = profilo.mazzoAttivoId;
let filtro: Filtro = 'tutti';

// Stato dell'editor di carte. `telaLavoro` e' il tratto in corso, non ancora
// registrato nella cronologia: si registra al rilascio, cosi' un annulla
// riporta indietro di un tratto intero e non di un pixel.
// ------------------------------------------------------- account remoto

const CHIAVE_TOKEN = 'token';
const cliente = creaCliente(indirizzoServerPredefinito());

let statoServer: StatoServer = 'sconosciuto';
let utenteRemoto: UtenteRemoto | null = null;
let modulo: ModuloAccesso = moduloVuoto();
let erroreAccesso = '';
let accessoInCorso = false;

function token(): string | null {
  return deposito.leggi<string>(CHIAVE_TOKEN);
}

/**
 * All'avvio si chiede al server se c'e'. Se non risponde l'app resta in
 * modalita' locale: non e' un guasto, e' il caso normale di una copia
 * pubblicata su un sito statico.
 */
async function risvegliaSessione(): Promise<void> {
  if (!cliente.base) {
    statoServer = 'assente';
    rendi();
    return;
  }

  statoServer = (await cliente.salute()) ? 'presente' : 'assente';

  const salvato = token();
  if (statoServer === 'presente' && salvato) {
    try {
      utenteRemoto = await cliente.io(salvato);
    } catch (errore) {
      // Token scaduto o revocato: si butta via invece di riprovare all infinito.
      if (errore instanceof ErroreServer && !errore.irraggiungibile) {
        deposito.scrivi(CHIAVE_TOKEN, null);
      }
    }
  }
  rendi();
}

let bozza: Bozza = bozzaIniziale();
let telaLavoro: Tela | null = null;
let inizioTratto: Punto | null = null;
let ultimoPunto: Punto | null = null;

function caricaProfilo(): Profilo {
  const salvato = deposito.leggi<Profilo>(CHIAVE_PROFILO);
  // Un profilo salvato da una versione precedente potrebbe non avere tutti i
  // campi: si riparte da uno nuovo invece di rompersi su una proprieta assente.
  if (salvato && Array.isArray(salvato.mazzi) && salvato.collezione) return salvato;
  return profiloIniziale(CARTE_BASE);
}

function salvaProfilo(): void {
  deposito.scrivi(CHIAVE_PROFILO, profilo);
}

function paginaDallIndirizzo(): Pagina {
  const grezza = (globalThis.location?.hash ?? '').replace('#', '');
  return PAGINE.some((v) => v.id === grezza) ? (grezza as Pagina) : 'gioca';
}

function mazzoAperto(): Mazzo {
  return profilo.mazzi.find((m) => m.id === mazzoApertoId) ?? profilo.mazzi[0];
}

// ------------------------------------------------- stato della partita

// Dichiarata PRIMA di `stato`: nuovaPartita() la assegna, e `let` non e'
// leggibile ne' scrivibile finche' la sua riga non e' stata eseguita.
let esitoRegistrato = false;

let stato = nuovaPartita();
let selezione: Selezione = null;
let messaggio = '';
let turnoDelBot = false;
let animazione: Animazione | null = null;
let dettaglio: CartaInCampo | null = null;

function nuovaPartita(): StatoPartitaConCatalogo {
  const carte = catalogo();
  const mio = mazzoAttivo(profilo);

  // Se il mazzo attivo non e' giocabile si scende in campo con quello base
  // invece di lasciare il giocatore davanti a una schermata bloccata: il
  // messaggio dice cosa e' successo e la pagina Mazzo spiega perche'.
  const mazzoGiocatore =
    mio && mazzoGiocabile(profilo, mio, carte) ? mazzoComeLista(mio) : _mazzoBase();

  esitoRegistrato = false;

  return creaPartita({
    idGiocatori: [profilo.nickname || 'Tu', 'Bot'],
    mazzi: [mazzoGiocatore, _mazzoBase()],
    carte,
    seme: Date.now() & 0x7fffffff,
    primoGiocatore: Math.random() < 0.5 ? 0 : 1,
  });
}

/** A partita finita il risultato entra nel profilo, una volta sola. */
function registraSeFinita(): void {
  if (stato.fase !== 'finita' || esitoRegistrato) return;
  esitoRegistrato = true;
  profilo = registraEsito(profilo, stato.vincitore === IO);
  salvaProfilo();
}

function messaggioDiFase(): string {
  if (stato.fase === 'finita') return stato.vincitore === IO ? 'Hai vinto.' : 'Hai perso.';
  if (stato.turnoDi !== IO) return 'Turno del bot.';

  switch (stato.fase) {
    case 'evocazione':
      return 'Fase 1: scegli una carta dalla mano, poi la casella dove schierarla.';
    case 'riposizionamento':
      return stato.giocatori[IO].riposizionamentoUsato
        ? 'Riposizionamento usato: passa alla fase support.'
        : 'Fase 2: una sola mossa. Scegli una tua carta, poi la destinazione.';
    case 'support':
      return 'Fase 3: per ogni support scegli cura oppure una goccia.';
    default:
      return '';
  }
}

/** La voce "Accedi" porta il nickname quando si e' connessi. */
function barra(): string {
  return barraNavigazione(pagina, {
    accesso: etichettaAccesso({ utente: utenteRemoto, statoServer }),
  });
}

function rendi(): void {
  if (pagina === 'accesso') {
    const contesto: ContestoAccesso = {
      statoServer,
      utente: utenteRemoto,
      modulo,
      errore: erroreAccesso,
      inCorso: accessoInCorso,
    };
    radice.innerHTML = barra() + paginaAccesso(contesto);
    return;
  }

  if (pagina === 'moderazione') {
    const mia = profilo.cartaCreata ? [profilo.cartaCreata] : [];
    const contesto: ContestoModerazione = {
      coda: coda(mia),
      decisioni: profilo.decisioni ?? [],
      giudicate: mia.filter((c) => c.stato !== 'pending'),
      creatore: profilo.nickname || 'Tu',
      messaggio,
    };
    radice.innerHTML = barra() +
      (messaggio ? `<div class="messaggio">${messaggio}</div>` : '') +
      paginaModerazione(contesto);
    dipingiTele();
    return;
  }

  if (pagina === 'crea') {
    const contesto: ContestoEditor = { bozza, gia: profilo.cartaCreata ?? null, messaggio };
    radice.innerHTML = barra() +
      (messaggio ? `<div class="messaggio">${messaggio}</div>` : '') +
      paginaEditor(contesto);
    dipingiTele();
    return;
  }

  if (pagina !== 'gioca') {
    const contesto: ContestoPagine = {
      pagina,
      profilo,
      mazzo: mazzoAperto(),
      catalogo: catalogo(),
      filtro,
      messaggio,
      duraturo: deposito.duraturo,
      urlSprite,
    };
    radice.innerHTML = barra() + disegnaPagina(contesto);
    return;
  }

  registraSeFinita();

  const schermata: Schermata = {
    stato,
    io: IO,
    selezione,
    messaggio,
    turnoDelBot,
    animazione,
    dettaglio,
    urlSprite,
  };
  radice.innerHTML = barra() + disegna(schermata);
}

/**
 * Ridisegna senza far perdere il filo a chi sta scrivendo.
 *
 * Senza questo, durante la digitazione si poteva scegliere fra due difetti:
 * non ridisegnare, e allora il pulsante "Invia" restava grigio anche dopo
 * aver scritto il nome; oppure ridisegnare, e allora il campo veniva
 * ricostruito e il cursore saltava alla fine a ogni lettera. Si ridisegna, e
 * poi si rimette il fuoco e il cursore dov'erano.
 */
function rendiMantenendoIlFuoco(): void {
  const documento = globalThis.document as Document | undefined;
  const attivo = documento?.activeElement as HTMLInputElement | null;
  const campo = attivo?.dataset?.campo;
  const inizio = attivo?.selectionStart ?? null;
  const fine = attivo?.selectionEnd ?? null;

  rendi();

  if (!campo) return;
  const tornato = radice.querySelector?.(`[data-campo="${campo}"]`) as HTMLInputElement | null;
  if (!tornato) return;
  tornato.focus?.();
  if (inizio !== null && fine !== null) tornato.setSelectionRange?.(inizio, fine);
}

function vaiA(nuova: Pagina): void {
  pagina = nuova;
  messaggio = nuova === 'gioca' ? messaggioDiFase() : '';
  if (globalThis.location) globalThis.location.hash = nuova;
  rendi();
}

// --------------------------------------------------------------- le azioni

/**
 * Legge nel registro cosa ha appena fatto l'azione e ne ricava l'animazione.
 *
 * L'attacco ha la precedenza su tutto: nello stesso passaggio di fase il
 * motore risolve i colpi, toglie i morti, chiude il turno e fa pescare
 * l'avversario, ma cio' che il giocatore deve vedere e' il combattimento.
 *
 * I colpi si mostrano TUTTI INSIEME, non uno dopo l'altro. Non e' una
 * scorciatoia: la Fase 4 si risolve a fotografia, i danni si applicano
 * simultaneamente (cap. 4.4), e mostrarli in fila racconterebbe una regola
 * diversa da quella che il motore applica.
 */
function costruisciAnimazione(
  statoPrima: StatoPartitaConCatalogo,
  daIndice: number,
): Animazione | null {
  const colpi: ColpoAnimato[] = [];
  const morti: MorteAnimata[] = [];
  let evocazione: Animazione | null = null;
  let spostamento: Animazione | null = null;

  for (const voce of stato.log.slice(daIndice)) {
    switch (voce.tipo) {
      case 'evocazione':
        evocazione = { tipo: 'evocazione', giocatore: voce.giocatore, casella: voce.casella };
        break;
      case 'riposizionamento':
        spostamento = {
          tipo: 'spostamento',
          giocatore: voce.giocatore,
          da: voce.da,
          a: voce.a,
          scambio: voce.scambio,
        };
        break;
      case 'colpo':
        colpi.push({
          giocatore: voce.giocatore,
          da: voce.da,
          bersaglio: voce.bersaglio,
          danno: voce.danno,
          moltiplicatore: voce.moltiplicatore,
        });
        break;
      case 'morte': {
        // La carta non c'e' piu' nello stato nuovo: la copia serve a
        // disegnarne il fantasma mentre si sfalda.
        const carta = statoPrima.giocatori[voce.giocatore].tabellone[voce.casella];
        if (carta) morti.push({ giocatore: voce.giocatore, casella: voce.casella, carta });
        break;
      }
      default:
        break;
    }
  }

  if (colpi.length > 0 || morti.length > 0) return { tipo: 'attacco', colpi, morti };
  return evocazione ?? spostamento;
}

function applica(azione: Azione): boolean {
  const statoPrima = stato;
  const primaDelLog = stato.log.length;
  try {
    stato = applicaAzione(stato, azione);
  } catch (errore) {
    messaggio = errore instanceof Error ? errore.message : 'Mossa non valida.';
    animazione = null;
    rendi();
    return false;
  }
  animazione = costruisciAnimazione(statoPrima, primaDelLog);
  return true;
}

/**
 * Disegna con l'animazione in corso, poi la toglie e prosegue. Le classi
 * restano sulla pagina per tutta la durata dichiarata in DURATE, che e' la
 * stessa scritta in stile.css.
 */
function riproduci(dopo?: () => void): void {
  rendi();
  if (!animazione) {
    dopo?.();
    return;
  }
  const durata = DURATE[animazione.tipo];
  window.setTimeout(() => {
    animazione = null;
    rendi();
    dopo?.();
  }, durata);
}

function dopoLaMiaMossa(): void {
  messaggio = messaggioDiFase();
  riproduci(() => {
    if (stato.fase !== 'finita' && stato.turnoDi !== IO) giocaIlBot();
  });
}

function giocaIlBot(): void {
  turnoDelBot = true;
  selezione = null;

  const passo = (): void => {
    if (stato.fase === 'finita' || stato.turnoDi === IO) {
      turnoDelBot = false;
      messaggio = messaggioDiFase();
      rendi();
      return;
    }
    if (!applica(mossaBot(stato))) {
      turnoDelBot = false;
      return;
    }
    // Una mossa animata si e' gia' presa il suo tempo: non serve aspettare
    // ancora, o il turno del bot diventa interminabile.
    const eraAnimata = animazione !== null;
    riproduci(() => window.setTimeout(passo, eraAnimata ? PAUSA_CORTA : PAUSA_BOT));
  };

  rendi();
  window.setTimeout(passo, PAUSA_BOT);
}

// ------------------------------------------------------------------- eventi

function clicSuCasella(giocatore: number, slot: number): void {
  if (giocatore !== IO) {
    messaggio = 'Puoi agire solo sul tuo schieramento.';
    rendi();
    return;
  }

  const mio = stato.giocatori[IO];
  const istanza = mio.tabellone[slot];

  if (stato.fase === 'evocazione') {
    if (selezione?.tipo !== 'mano') {
      messaggio = 'Scegli prima una carta dalla mano.';
      rendi();
      return;
    }
    if (applica({ tipo: 'evoca', indiceMano: selezione.indice, casella: slot })) {
      selezione = null;
      dopoLaMiaMossa();
    }
    return;
  }

  if (stato.fase === 'riposizionamento') {
    if (selezione?.tipo === 'carta') {
      if (selezione.casella === slot) {
        selezione = null;
        messaggio = messaggioDiFase();
        rendi();
        return;
      }
      if (applica({ tipo: 'riposiziona', da: selezione.casella, a: slot })) {
        selezione = null;
        dopoLaMiaMossa();
      }
      return;
    }
    if (!istanza) {
      messaggio = 'Scegli una tua carta da spostare.';
      rendi();
      return;
    }
    selezione = { tipo: 'carta', casella: slot };
    messaggio = `${istanza.nome}: scegli dove spostarla, o un alleato con cui scambiarla.`;
    rendi();
    return;
  }

  if (stato.fase === 'support') {
    if (selezione?.tipo === 'support') {
      if (selezione.casella === slot) {
        selezione = null;
        messaggio = messaggioDiFase();
        rendi();
        return;
      }
      if (applica({ tipo: 'supportCura', casella: selezione.casella, bersaglio: slot })) {
        selezione = null;
        dopoLaMiaMossa();
      }
      return;
    }
    if (!istanza || istanza.tipo !== 'support') {
      messaggio = 'In questa fase agiscono solo le carte support.';
      rendi();
      return;
    }
    if (istanza.fresca) {
      messaggio = `${istanza.nome} e' fresca: agira' dal prossimo turno.`;
      rendi();
      return;
    }
    if (istanza.haAgito) {
      messaggio = `${istanza.nome} ha gia' agito in questo turno.`;
      rendi();
      return;
    }
    selezione = { tipo: 'support', casella: slot };
    messaggio = `${istanza.nome}: cura ${istanza.attacco} a un alleato, o produce 1 goccia.`;
    rendi();
  }
}

/**
 * Riconosce un canvas senza nominare HTMLCanvasElement.
 *
 * `instanceof HTMLCanvasElement` solleva dove quel globale non esiste, e fa
 * cadere tutta la pagina. Qui si controlla cio' che serve davvero: che
 * l'elemento sappia dare un contesto di disegno.
 */
function comeCanvas(elemento: unknown): HTMLCanvasElement | null {
  const forse = elemento as HTMLCanvasElement | null;
  return forse && typeof forse.getContext === 'function' ? forse : null;
}

/** La tela mostrata in questo momento: il tratto in corso, o l'ultimo registrato. */
function telaVisibile(): Tela {
  return telaLavoro ?? telaCorrente(bozza.cronologia);
}

/** Dipinge una tela dentro un canvas 32x32. Il CSS la ingrandisce a scatti. */
function dipingiCanvas(canvas: HTMLCanvasElement, tela: Tela): void {
  const contesto = canvas.getContext('2d');
  if (!contesto) return;
  const immagine = contesto.createImageData(DIMENSIONE_TELA, DIMENSIONE_TELA);
  for (let i = 0; i < tela.length; i++) {
    const colore = PALETTE[tela[i]];
    immagine.data[i * 4] = parseInt(colore.slice(1, 3), 16);
    immagine.data[i * 4 + 1] = parseInt(colore.slice(3, 5), 16);
    immagine.data[i * 4 + 2] = parseInt(colore.slice(5, 7), 16);
    immagine.data[i * 4 + 3] = tela[i] === 0 ? 0 : 255;
  }
  contesto.putImageData(immagine, 0, 0);
}

/**
 * I canvas non si possono riempire dall'HTML: vanno dipinti dopo ogni
 * disegno della pagina. E' l'unico punto in cui la vista non basta a se
 * stessa, ed e' per questo che sta qui e non in editor.ts.
 */
function dipingiTele(): void {
  // In moderazione e nella scheda della carta inviata si mostra il disegno
  // salvato; nell'editor, il tratto in corso.
  const tela =
    pagina !== 'crea' || profilo.cartaCreata
      ? profilo.cartaCreata
        ? decodifica(profilo.cartaCreata.pixels)
        : telaVisibile()
      : telaVisibile();

  for (const nome of ['tela', 'anteprima']) {
    const canvas = comeCanvas(radice.querySelector(`[data-${nome}]`));
    if (canvas) dipingiCanvas(canvas, tela);
  }
}

/** Da coordinate del puntatore a coordinate della tela. */
function puntoSullaTela(canvas: HTMLCanvasElement, evento: PointerEvent): Punto {
  const riquadro = canvas.getBoundingClientRect();
  const lato = riquadro.width / DIMENSIONE_TELA;
  return {
    x: Math.floor((evento.clientX - riquadro.left) / lato),
    y: Math.floor((evento.clientY - riquadro.top) / lato),
  };
}

function avviaTratto(canvas: HTMLCanvasElement, evento: PointerEvent): void {
  const punto = puntoSullaTela(canvas, evento);

  if (bozza.strumento === 'contagocce') {
    bozza = { ...bozza, colore: colorePixel(telaVisibile(), punto) };
    rendi();
    return;
  }

  inizioTratto = punto;
  ultimoPunto = punto;
  telaLavoro = applicaStrumento(bozza.strumento, punto, punto, telaCorrente(bozza.cronologia), bozza.colore);
  dipingiCanvas(canvas, telaLavoro);
}

function continuaTratto(canvas: HTMLCanvasElement, evento: PointerEvent): void {
  if (!inizioTratto || !telaLavoro) return;
  const punto = puntoSullaTela(canvas, evento);

  // Matita e gomma proseguono dall'ultimo punto: un trascinamento veloce
  // salta dei pixel, e senza la linea di raccordo il tratto verrebbe bucato.
  // Linea e rettangolo ripartono sempre dall'inizio, sulla tela registrata.
  const continuo = bozza.strumento === 'matita' || bozza.strumento === 'gomma';
  const base = continuo ? telaLavoro : telaCorrente(bozza.cronologia);
  const da = continuo ? (ultimoPunto ?? punto) : inizioTratto;

  telaLavoro = applicaStrumento(bozza.strumento, da, punto, base, bozza.colore);
  ultimoPunto = punto;
  dipingiCanvas(canvas, telaLavoro);
}

/**
 * Chiude il tratto in corso, SE ce n'e' uno.
 *
 * La guardia non e' una cautela di troppo: il gestore del rilascio sta su
 * tutta la pagina, quindi scatta anche premendo un pulsante della tavolozza.
 * Senza guardia ridisegnava la pagina fra il `pointerup` e il `click`, e il
 * browser emette il clic solo se l'elemento premuto esiste ancora al
 * rilascio: sparendo sotto il dito, il clic non arrivava mai e ogni pulsante
 * dell'editor sembrava morto.
 */
function chiudiTratto(): void {
  if (!inizioTratto && !telaLavoro) return;

  if (telaLavoro) {
    bozza = { ...bozza, cronologia: registra(bozza.cronologia, telaLavoro) };
  }
  telaLavoro = null;
  inizioTratto = null;
  ultimoPunto = null;
  rendi();
}

if (typeof PointerEvent !== 'undefined') {
  radice.addEventListener('pointerdown', (evento) => {
    const bersaglio = comeCanvas(evento.target);
    if (pagina !== 'crea' || !bersaglio || !bersaglio.hasAttribute('data-tela')) return;
    bersaglio.setPointerCapture(evento.pointerId);
    avviaTratto(bersaglio, evento);
  });

  radice.addEventListener('pointermove', (evento) => {
    const bersaglio = comeCanvas(evento.target);
    if (pagina !== 'crea' || !bersaglio || !bersaglio.hasAttribute('data-tela')) return;
    continuaTratto(bersaglio, evento);
  });

  radice.addEventListener('pointerup', () => {
    if (pagina === 'crea') chiudiTratto();
  });

  radice.addEventListener('pointercancel', () => {
    if (pagina === 'crea') chiudiTratto();
  });
}

/** Invio della carta: una sola per account, e il costo lo ricalcola il motore. */
function inviaCarta(): void {
  const stato = esaminaBozza(bozza);
  if (!stato.inviabile || profilo.cartaCreata) {
    messaggio = stato.errori[0] ?? 'Hai gia creato la tua carta.';
    rendi();
    return;
  }

  const derivate = statisticheDerivate({
    vita: bozza.vita, attacco: bozza.attacco, tipo: bozza.tipo, elemento: bozza.elemento,
  });

  const carta: CartaCreata = {
    nome: bozza.nome.trim(),
    descrizione: bozza.descrizione.trim(),
    tipo: bozza.tipo,
    elemento: bozza.elemento,
    vita: bozza.vita,
    attacco: bozza.attacco,
    potenza: derivate.potenza,
    costo: derivate.costo,
    rarita: derivate.rarita,
    pixels: codifica(telaCorrente(bozza.cronologia)),
    stato: 'pending',
    inviataIl: new Date().toISOString().slice(0, 10),
  };

  // Entra nella collezione cosi' la si puo' provare in locale, con due copie
  // come le altre. Nel pool pubblico ci entra solo dopo l'approvazione.
  profilo = {
    ...profilo,
    cartaCreata: carta,
    collezione: { ...profilo.collezione, [ID_CARTA_UTENTE]: 2 },
  };
  salvaProfilo();
  messaggio = 'Carta inviata. Resta in attesa di revisione; intanto e nella tua collezione.';
  rendi();
}

/**
 * Applica una decisione di revisione. Il registro non si riscrive: una
 * decisione revocata resta, segnata come tale.
 */
function decidi(comando: { tipo: 'approva' } | { tipo: 'rifiuta'; motivo: MotivoRifiuto } | { tipo: 'revoca' }): void {
  const carta = profilo.cartaCreata;
  if (!carta) {
    messaggio = 'Non c e niente da revisionare.';
    rendi();
    return;
  }

  const quando = new Date().toISOString().slice(0, 10);
  const creatore = profilo.nickname || 'Tu';
  const decisioni = profilo.decisioni ?? [];

  if (comando.tipo === 'revoca') {
    if (carta.stato === 'pending') {
      messaggio = 'Questa carta e gia in coda.';
      rendi();
      return;
    }
    const esito = revoca(carta, decisioni);
    profilo = {
      ...profilo,
      cartaCreata: esito.carta,
      decisioni: esito.decisioni,
      // Rimessa in coda, torna utilizzabile in locale come quando fu inviata.
      collezione: { ...profilo.collezione, [ID_CARTA_UTENTE]: 2 },
    };
    messaggio = `"${esito.carta.nome}" e tornata in coda.`;
    salvaProfilo();
    rendi();
    return;
  }

  if (carta.stato !== 'pending') {
    messaggio = 'Questa carta e gia stata giudicata.';
    rendi();
    return;
  }

  const esito =
    comando.tipo === 'approva'
      ? approva(carta, creatore, quando)
      : rifiuta(carta, comando.motivo, creatore, quando);

  // Una carta rifiutata esce dalla collezione e dai mazzi: non si puo'
  // continuare a giocare una carta che la revisione ha respinto.
  const collezione = { ...profilo.collezione };
  const mazzi = profilo.mazzi.map((m) => {
    if (!(ID_CARTA_UTENTE in m.carte)) return m;
    const carte = { ...m.carte };
    delete carte[ID_CARTA_UTENTE];
    return { ...m, carte };
  });

  if (esito.carta.stato === 'rejected') {
    delete collezione[ID_CARTA_UTENTE];
  }

  profilo = {
    ...profilo,
    cartaCreata: esito.carta,
    decisioni: [...decisioni, esito.decisione],
    collezione,
    mazzi: esito.carta.stato === 'rejected' ? mazzi : profilo.mazzi,
  };
  salvaProfilo();

  messaggio =
    esito.carta.stato === 'approved'
      ? `"${esito.carta.nome}" approvata.`
      : `"${esito.carta.nome}" rifiutata. Il creatore recupera il suo tentativo.`;
  rendi();
}

/**
 * Invia il modulo di accesso o di registrazione.
 *
 * La password sta solo in memoria per il tempo della chiamata: non finisce
 * nel deposito, non viene ridisegnata nel campo e non compare in nessun log.
 */
async function inviaAccesso(): Promise<void> {
  if (accessoInCorso) return;
  accessoInCorso = true;
  erroreAccesso = '';
  rendi();

  try {
    const esito =
      modulo.modo === 'registrazione'
        ? await cliente.registrazione(modulo.email, modulo.password, modulo.nickname)
        : await cliente.accesso(modulo.email, modulo.password);

    deposito.scrivi(CHIAVE_TOKEN, esito.token);
    utenteRemoto = esito.utente;
    statoServer = 'presente';
    modulo = moduloVuoto();

    // Il nickname dell'account diventa quello del profilo locale: e' lo
    // stesso giocatore, e vedersi due nomi diversi sarebbe sconcertante.
    profilo = { ...profilo, nickname: esito.utente.nickname };
    salvaProfilo();
  } catch (errore) {
    erroreAccesso =
      errore instanceof ErroreServer ? errore.message : 'Qualcosa e andato storto';
    if (errore instanceof ErroreServer && errore.irraggiungibile) statoServer = 'assente';
  } finally {
    accessoInCorso = false;
    modulo = { ...modulo, password: '' };
    rendi();
  }
}

async function esciDallAccount(): Promise<void> {
  const salvato = token();
  utenteRemoto = null;
  deposito.scrivi(CHIAVE_TOKEN, null);
  rendi();
  // Il token si revoca anche sul server, non solo qui: dimenticarlo nel
  // browser lo lascerebbe valido per chiunque altro ce l'avesse.
  if (salvato) await cliente.uscita(salvato).catch(() => undefined);
}

/** Clic dentro la pagina di accesso. */
function clicSullAccesso(bersaglio: Element): boolean {
  const modo = bersaglio.closest<HTMLElement>('[data-modo]');
  if (modo) {
    modulo = { ...moduloVuoto(), modo: modo.dataset.modo as ModoAccesso, email: modulo.email };
    erroreAccesso = '';
    rendi();
    return true;
  }

  const comando = bersaglio.closest<HTMLElement>('[data-azione]');
  if (comando?.dataset.azione === 'invia-accesso') {
    void inviaAccesso();
    return true;
  }
  if (comando?.dataset.azione === 'esci') {
    void esciDallAccount();
    return true;
  }
  return false;
}

/** Clic dentro il pannello di moderazione. */
function clicSullaModerazione(bersaglio: Element): boolean {
  if (bersaglio.closest('[data-approva]')) {
    decidi({ tipo: 'approva' });
    return true;
  }
  const rifiuto = bersaglio.closest<HTMLElement>('[data-rifiuta]');
  if (rifiuto) {
    decidi({ tipo: 'rifiuta', motivo: rifiuto.dataset.rifiuta as MotivoRifiuto });
    return true;
  }
  if (bersaglio.closest('[data-revoca]')) {
    decidi({ tipo: 'revoca' });
    return true;
  }
  return false;
}

/** Clic dentro l'editor di carte. */
function clicSullEditor(bersaglio: Element): boolean {
  const scelte: [string, (valore: string) => void][] = [
    ['strumento', (v) => (bozza = { ...bozza, strumento: v as Strumento })],
    ['colore', (v) => (bozza = { ...bozza, colore: Number(v) })],
    ['tipo', (v) => (bozza = { ...bozza, tipo: v as TipoCarta })],
    ['elemento', (v) => (bozza = normalizzaBozza({ ...bozza, elemento: v as Elemento }))],
    ['vita', (v) => (bozza = { ...bozza, vita: Number(v) })],
    ['attacco', (v) => (bozza = { ...bozza, attacco: Number(v) })],
  ];

  for (const [attributo, applica] of scelte) {
    const elemento = bersaglio.closest<HTMLElement>(`[data-${attributo}]`);
    if (elemento) {
      applica(elemento.dataset[attributo] ?? '');
      messaggio = '';
      rendi();
      return true;
    }
  }

  const comando = bersaglio.closest<HTMLElement>('[data-azione]');
  const azione = comando?.dataset.azione;
  if (!azione) return false;

  switch (azione) {
    case 'annulla':
      bozza = { ...bozza, cronologia: annullaTratto(bozza.cronologia) };
      break;
    case 'ripeti':
      bozza = { ...bozza, cronologia: ripetiTratto(bozza.cronologia) };
      break;
    case 'specchia':
      bozza = { ...bozza, cronologia: registra(bozza.cronologia, specchiaOrizzontale(telaCorrente(bozza.cronologia))) };
      break;
    case 'svuota':
      bozza = { ...bozza, cronologia: registra(bozza.cronologia, svuota()) };
      break;
    case 'invia-carta':
      inviaCarta();
      return true;
    case 'rifai-carta': {
      // Il tentativo torna disponibile solo dopo un rifiuto: una carta
      // approvata non si rifa', o cambierebbe sotto chi gia' ce l'ha.
      if (profilo.cartaCreata?.stato !== 'rejected') return true;
      profilo = { ...profilo, cartaCreata: null };
      bozza = bozzaIniziale();
      salvaProfilo();
      messaggio = 'Puoi disegnare una carta nuova.';
      rendi();
      return true;
    }
    default:
      return false;
  }
  messaggio = '';
  rendi();
  return true;
}

/** Clic sulle pagine fuori dalla partita. Restituisce true se ha gestito. */
function clicSullePagine(bersaglio: Element): boolean {
  const voce = bersaglio.closest<HTMLElement>('[data-pagina]');
  if (voce) {
    vaiA(voce.dataset.pagina as Pagina);
    return true;
  }

  if (pagina !== 'mazzo') return false;

  const daAggiungere = bersaglio.closest<HTMLElement>('[data-aggiungi]');
  if (daAggiungere) {
    const esito = aggiungiAlMazzo(profilo, mazzoAperto(), daAggiungere.dataset.aggiungi ?? '', catalogo());
    messaggio = esito.rifiuto ?? '';
    if (!esito.rifiuto) {
      profilo = sostituisciMazzo(profilo, esito.mazzo);
      salvaProfilo();
    }
    rendi();
    return true;
  }

  const daTogliere = bersaglio.closest<HTMLElement>('[data-togli]');
  if (daTogliere) {
    const esito = togliDalMazzo(mazzoAperto(), daTogliere.dataset.togli ?? '');
    messaggio = esito.rifiuto ?? '';
    if (!esito.rifiuto) {
      profilo = sostituisciMazzo(profilo, esito.mazzo);
      salvaProfilo();
    }
    rendi();
    return true;
  }

  const filtroScelto = bersaglio.closest<HTMLElement>('[data-filtro]');
  if (filtroScelto) {
    filtro = filtroScelto.dataset.filtro as Filtro;
    rendi();
    return true;
  }

  const mazzoScelto = bersaglio.closest<HTMLElement>('[data-mazzo]');
  if (mazzoScelto) {
    mazzoApertoId = mazzoScelto.dataset.mazzo ?? mazzoApertoId;
    messaggio = '';
    rendi();
    return true;
  }

  const comando = bersaglio.closest<HTMLElement>('[data-azione]');
  if (comando?.dataset.azione === 'nuovo-mazzo') {
    const esito = nuovoMazzo(profilo);
    messaggio = esito.rifiuto ?? '';
    if (!esito.rifiuto) {
      profilo = esito.profilo;
      mazzoApertoId = profilo.mazzoAttivoId;
      salvaProfilo();
    }
    rendi();
    return true;
  }

  if (comando?.dataset.azione === 'attiva-mazzo') {
    profilo = { ...profilo, mazzoAttivoId: mazzoAperto().id };
    salvaProfilo();
    messaggio = `"${mazzoAperto().nome}" e' il mazzo con cui giocherai.`;
    rendi();
    return true;
  }

  return false;
}

radice.addEventListener('click', (evento) => {
  const bersaglio = evento.target;
  if (!(bersaglio instanceof Element)) return;

  if (pagina === 'crea' || pagina === 'moderazione' || pagina === 'accesso') {
    const voce = bersaglio.closest<HTMLElement>('[data-pagina]');
    if (voce) {
      vaiA(voce.dataset.pagina as Pagina);
      return;
    }
    if (pagina === 'moderazione') clicSullaModerazione(bersaglio);
    else if (pagina === 'accesso') clicSullAccesso(bersaglio);
    else clicSullEditor(bersaglio);
    return;
  }

  if (clicSullePagine(bersaglio)) return;
  if (pagina !== 'gioca') return;

  const comando = bersaglio.closest<HTMLElement>('[data-azione]');
  if (comando) {
    const azione = comando.dataset.azione;
    if (azione === 'nuova') {
      stato = nuovaPartita();
      selezione = null;
      animazione = null;
      dettaglio = null;
      turnoDelBot = false;
      messaggio = messaggioDiFase();
      rendi();
      if (stato.turnoDi !== IO) giocaIlBot();
      return;
    }
    if (turnoDelBot || stato.turnoDi !== IO || stato.fase === 'finita') return;
    if (azione === 'passa') {
      selezione = null;
      if (applica({ tipo: 'passaFase' })) dopoLaMiaMossa();
      return;
    }
    if (azione === 'goccia' && selezione?.tipo === 'support') {
      if (applica({ tipo: 'supportGoccia', casella: selezione.casella })) {
        selezione = null;
        dopoLaMiaMossa();
      }
      return;
    }
    return;
  }

  if (turnoDelBot || stato.fase === 'finita') return;

  const oggetto = bersaglio.closest<HTMLElement>('[data-gioca-oggetto]');
  if (oggetto) {
    // Una carta oggetto non chiede una casella: si gioca e basta.
    selezione = null;
    if (applica({ tipo: 'giocaOggetto', indiceMano: Number(oggetto.dataset.giocaOggetto) })) {
      dopoLaMiaMossa();
    }
    return;
  }

  const inMano = bersaglio.closest<HTMLElement>('[data-mano]');
  if (inMano) {
    const indice = Number(inMano.dataset.mano);
    selezione = selezione?.tipo === 'mano' && selezione.indice === indice
      ? null
      : { tipo: 'mano', indice };
    const def = stato.catalogo[stato.giocatori[IO].mano[indice]];
    messaggio = selezione && def ? `${def.nome}: scegli la casella.` : messaggioDiFase();
    rendi();
    return;
  }

  const casellaCliccata = bersaglio.closest<HTMLElement>('[data-casella]');
  if (casellaCliccata) {
    clicSuCasella(
      Number(casellaCliccata.dataset.giocatore),
      Number(casellaCliccata.dataset.casella),
    );
  }
});

/** Il pannello di dettaglio segue il puntatore: serve a leggere le statistiche. */
radice.addEventListener('mouseover', (evento) => {
  const bersaglio = evento.target;
  if (!(bersaglio instanceof Element)) return;

  const oggetto = bersaglio.closest<HTMLElement>('[data-gioca-oggetto]');
  if (oggetto) {
    // Una carta oggetto non chiede una casella: si gioca e basta.
    selezione = null;
    if (applica({ tipo: 'giocaOggetto', indiceMano: Number(oggetto.dataset.giocaOggetto) })) {
      dopoLaMiaMossa();
    }
    return;
  }

  const inMano = bersaglio.closest<HTMLElement>('[data-mano]');
  if (inMano) {
    const def = stato.catalogo[stato.giocatori[IO].mano[Number(inMano.dataset.mano)]];
    if (!def) return;
    const nuovo: CartaInCampo = {
      uid: 'anteprima',
      cartaId: def.id,
      nome: def.nome,
      tipo: def.tipo,
      elemento: def.elemento,
      vita: def.vita,
      vitaMax: def.vita,
      attacco: def.attacco,
      costo: def.costo,
      descrizione: def.descrizione,
      fresca: false,
      haAgito: false,
    };
    if (dettaglio?.cartaId !== nuovo.cartaId || dettaglio.uid !== 'anteprima') {
      dettaglio = nuovo;
      rendi();
    }
    return;
  }

  const casellaPuntata = bersaglio.closest<HTMLElement>('[data-casella]');
  if (casellaPuntata) {
    const giocatore = Number(casellaPuntata.dataset.giocatore) as IndiceGiocatore;
    const istanza = stato.giocatori[giocatore].tabellone[Number(casellaPuntata.dataset.casella)];
    if (istanza && dettaglio?.uid !== istanza.uid) {
      dettaglio = istanza;
      rendi();
    }
  }
});

/** I campi di testo di profilo e mazzo si salvano mentre si scrive. */
radice.addEventListener('input', (evento) => {
  const bersaglio = evento.target;
  if (!(bersaglio instanceof Element)) return;
  const campo = bersaglio.closest<HTMLElement>('[data-campo]');
  if (!campo) return;

  const valore = (campo as HTMLInputElement).value ?? '';
  switch (campo.dataset.campo) {
    case 'nickname':
      profilo = { ...profilo, nickname: valore };
      break;
    case 'bio':
      profilo = { ...profilo, bio: valore };
      break;
    case 'email-accesso':
      modulo = { ...modulo, email: valore };
      return; // niente ridisegno: il valore e gia nel campo
    case 'password-accesso':
      modulo = { ...modulo, password: valore };
      return;
    case 'nickname-accesso':
      modulo = { ...modulo, nickname: valore };
      return;
    case 'descrizione-carta':
      bozza = { ...bozza, descrizione: valore };
      rendiMantenendoIlFuoco();
      return;
    case 'nome-carta':
      // La bozza vive finche' non si invia: niente da salvare, ma la pagina
      // va ridisegnata perche' il nome sblocca l'invio e compare nell'anteprima.
      bozza = { ...bozza, nome: valore };
      rendiMantenendoIlFuoco();
      return;
    case 'nome-mazzo':
      profilo = sostituisciMazzo(profilo, { ...mazzoAperto(), nome: valore });
      break;
    default:
      return;
  }
  salvaProfilo();
  rendiMantenendoIlFuoco();
});

/**
 * Revisione a tastiera. Attiva solo nel pannello, e mai mentre si scrive in
 * un campo di testo: altrimenti digitare "a" in un nome approverebbe una carta.
 */
globalThis.addEventListener?.('keydown', (evento: Event) => {
  if (pagina !== 'moderazione') return;
  const tastiera = evento as KeyboardEvent;
  if (tastiera.ctrlKey || tastiera.metaKey || tastiera.altKey) return;

  const attivo = (globalThis as { document?: { activeElement?: { tagName?: string } } }).document
    ?.activeElement?.tagName;
  if (attivo === 'INPUT' || attivo === 'TEXTAREA') return;

  const comando = comandoDaTasto(tastiera.key);
  if (!comando) return;
  tastiera.preventDefault?.();
  decidi(comando);
});

/** Indietro e avanti del browser cambiano pagina. */
globalThis.addEventListener?.('hashchange', () => {
  pagina = paginaDallIndirizzo();
  messaggio = pagina === 'gioca' ? messaggioDiFase() : '';
  rendi();
});

messaggio = pagina === 'gioca' ? messaggioDiFase() : '';
rendi();
if (pagina === 'gioca' && stato.turnoDi !== IO) giocaIlBot();

// Si disegna subito e si chiede al server dopo: la pagina non deve restare
// bianca per due secondi aspettando una risposta che potrebbe non arrivare.
void risvegliaSessione();
