/**
 * DOM MINIMO PER I TEST.
 *
 * main.ts ha bisogno di un documento, di un canvas e di window.setTimeout.
 * Qui ce n'e' quel tanto che basta per caricarlo, leggere cosa disegna e
 * simulare un clic: serve a verificare il collegamento fra clic e azioni,
 * non a emulare un browser.
 */

export interface ElementoFinto {
  tagName: string;
  dataset: Record<string, string>;
  genitore: ElementoFinto | null;
  closest(selettore: string): ElementoFinto | null;
}

export class ElementoBase implements ElementoFinto {
  tagName: string;
  dataset: Record<string, string>;
  genitore: ElementoFinto | null = null;

  constructor(tagName: string, dataset: Record<string, string> = {}) {
    this.tagName = tagName;
    this.dataset = dataset;
  }

  /** Riconosce solo i selettori di attributo usati dall'app: [data-xxx]. */
  closest(selettore: string): ElementoFinto | null {
    const nome = selettore.replace(/^\[data-|\]$/g, '');
    const chiave = nome.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    let corrente: ElementoFinto | null = this;
    while (corrente) {
      if (chiave in corrente.dataset) return corrente;
      corrente = corrente.genitore;
    }
    return null;
  }
}

export interface Radice extends ElementoBase {
  innerHTML: string;
  /** Nessun canvas nel DOM finto: chi lo cerca non lo trova, e va bene cosi. */
  querySelector(selettore: string): null;
  addEventListener(tipo: string, gestore: (evento: { target: unknown }) => void): void;
  scatena(tipo: string, bersaglio: unknown): void;
}

export interface Impalcatura {
  radice: Radice;
  /** Quante volte la pagina e' stata ridisegnata. */
  ridisegni(): number;
  /** Esegue i timer in attesa: e' cosi' che si fa giocare il bot. */
  scorriTimer(quanti?: number): number;
  timerInAttesa(): number;
}

export function installaDomFinto(semeFisso = 0.0): Impalcatura {
  const gestori = new Map<string, ((evento: { target: unknown }) => void)[]>();
  const timer: (() => void)[] = [];

  let ridisegni = 0;

  let html = '';

  const radice = Object.assign(new ElementoBase('div', { radice: 'si' }), {
    querySelector: () => null,
    addEventListener(tipo: string, gestore: (evento: { target: unknown }) => void) {
      const lista = gestori.get(tipo) ?? [];
      lista.push(gestore);
      gestori.set(tipo, lista);
    },
    scatena(tipo: string, bersaglio: unknown) {
      for (const gestore of gestori.get(tipo) ?? []) gestore({ target: bersaglio });
    },
  }) as Radice;

  // Definita DOPO Object.assign, e con defineProperty: Object.assign legge le
  // proprieta della sorgente con il loro getter e ne copia il valore, quindi
  // un accessore dichiarato nell'oggetto letterale verrebbe perso per strada
  // e il contatore dei ridisegni non conterebbe niente.
  Object.defineProperty(radice, 'innerHTML', {
    get: () => html,
    set: (valore: string) => {
      ridisegni++;
      html = valore;
    },
  });

  const contesto = {
    createImageData: (l: number, a: number) => ({ data: new Uint8ClampedArray(l * a * 4) }),
    putImageData: () => undefined,
  };

  const globale = globalThis as Record<string, unknown>;
  globale.Element = ElementoBase;
  // Dichiarato perche' main.ts registra i gestori del puntatore solo dove
  // esistono: senza, il disegno sulla tela non verrebbe mai collegato.
  globale.PointerEvent = class PointerEventFinto {};
  globale.document = {
    getElementById: (id: string) => (id === 'radice' ? radice : null),
    createElement: (tag: string) =>
      tag === 'canvas'
        ? { width: 0, height: 0, getContext: () => contesto, toDataURL: () => 'data:image/png;base64,FINTO' }
        : new ElementoBase(tag),
  };
  globale.window = {
    setTimeout: (fn: () => void) => {
      timer.push(fn);
      return timer.length;
    },
  };

  // Partita riproducibile: il seme viene da Date.now e chi inizia da Math.random.
  Math.random = () => semeFisso;
  Date.now = () => 1_700_000_000_000;

  return {
    radice,
    ridisegni: () => ridisegni,
    timerInAttesa: () => timer.length,
    scorriTimer(quanti = 200) {
      let eseguiti = 0;
      while (timer.length > 0 && eseguiti < quanti) {
        const prossimo = timer.shift();
        prossimo?.();
        eseguiti++;
      }
      return eseguiti;
    },
  };
}
