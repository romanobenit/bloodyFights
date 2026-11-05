/**
 * DEPOSITO: dove finiscono i dati del giocatore.
 *
 * Un'interfaccia sola, due implementazioni. Oggi i dati restano nel browser;
 * quando arrivera' il server della fase 4 si scrive una terza implementazione
 * che parla con lui e la UI non se ne accorge. E' la stessa idea del motore
 * che non conosce il database: chi decide le regole non deve sapere dove
 * finiscono i byte.
 */
export interface Deposito {
  leggi<T>(chiave: string): T | null;
  scrivi<T>(chiave: string, valore: T): boolean;
  /** false quando i dati non sopravvivono alla chiusura della pagina. */
  readonly duraturo: boolean;
}

/** Deposito in memoria: per i test, e come rete di salvataggio. */
export function depositoInMemoria(): Deposito {
  const dati = new Map<string, string>();
  return {
    duraturo: false,
    leggi<T>(chiave: string): T | null {
      const grezzo = dati.get(chiave);
      return grezzo === undefined ? null : (JSON.parse(grezzo) as T);
    },
    scrivi<T>(chiave: string, valore: T): boolean {
      dati.set(chiave, JSON.stringify(valore));
      return true;
    },
  };
}

/**
 * Deposito su localStorage.
 *
 * Ogni accesso e' protetto: in navigazione privata, con i cookie di terze
 * parti bloccati o con la quota esaurita, localStorage non e' assente ma
 * SOLLEVA. Un'eccezione non gestita qui farebbe morire tutta la pagina per
 * una preferenza del browser. Se non e' utilizzabile si ripiega sulla
 * memoria: si gioca lo stesso, solo senza ritrovare il mazzo domani.
 */
export function depositoLocale(prefisso = 'bloodyfights:'): Deposito {
  const riserva = depositoInMemoria();

  const magazzino = ((): Storage | null => {
    try {
      const prova = globalThis.localStorage;
      const chiave = `${prefisso}prova`;
      prova.setItem(chiave, '1');
      prova.removeItem(chiave);
      return prova;
    } catch {
      return null;
    }
  })();

  if (!magazzino) return riserva;

  return {
    duraturo: true,
    leggi<T>(chiave: string): T | null {
      try {
        const grezzo = magazzino.getItem(prefisso + chiave);
        return grezzo === null ? null : (JSON.parse(grezzo) as T);
      } catch {
        // Dato corrotto o illeggibile: meglio ricominciare che bloccarsi.
        return null;
      }
    },
    scrivi<T>(chiave: string, valore: T): boolean {
      try {
        magazzino.setItem(prefisso + chiave, JSON.stringify(valore));
        return true;
      } catch {
        return false;
      }
    },
  };
}
