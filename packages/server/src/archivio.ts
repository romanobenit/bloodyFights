import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * ARCHIVIO: dove vivono i dati del server.
 *
 * Il documento prevede PostgreSQL. Qui non e' installabile, quindi
 * l'implementazione scrive su un file JSON - ma dietro un'interfaccia, cosi'
 * la sostituzione e' una classe nuova e non una riscrittura. E' la stessa
 * idea del `Deposito` del client, per lo stesso motivo: chi applica le regole
 * non deve sapere dove finiscono i byte.
 *
 * Lo schema delle tabelle del cap. 10.4 e' riprodotto come raccolte.
 */

export interface Utente {
  id: string;
  email: string;
  /** Mai la password: solo la sua impronta e il sale. */
  impronta: string;
  sale: string;
  nickname: string;
  bio: string;
  oro: number;
  mmr: number;
  vittorie: number;
  sconfitte: number;
  cartaCreataId: string | null;
  creatoIl: string;
  /** Tentativi di accesso falliti di fila, per frenare chi prova a forza. */
  tentativiFalliti: number;
  ultimoTentativo: number;
}

export interface Sessione {
  /** Impronta del token, non il token: chi legge l'archivio non entra. */
  improntaToken: string;
  utenteId: string;
  creataIl: number;
  scadeIl: number;
}

export interface Dati {
  utenti: Utente[];
  sessioni: Sessione[];
  carte: Record<string, unknown>[];
  mazzi: Record<string, unknown>[];
  partite: Record<string, unknown>[];
}

export function datiVuoti(): Dati {
  return { utenti: [], sessioni: [], carte: [], mazzi: [], partite: [] };
}

export interface Archivio {
  leggi(): Promise<Dati>;
  /** Legge, applica la modifica e riscrive. Le chiamate non si accavallano. */
  modifica<T>(cambiamento: (dati: Dati) => T | Promise<T>): Promise<T>;
}

/** Archivio in memoria: per i test, e per avviare il server senza scrivere niente. */
export function archivioInMemoria(iniziali: Dati = datiVuoti()): Archivio {
  let dati = structuredClone(iniziali);
  let coda: Promise<unknown> = Promise.resolve();

  return {
    async leggi() {
      return structuredClone(dati);
    },
    modifica(cambiamento) {
      const prossima = coda.then(async () => {
        const copia = structuredClone(dati);
        const esito = await cambiamento(copia);
        dati = copia;
        return esito;
      });
      coda = prossima.catch(() => undefined);
      return prossima as Promise<never>;
    },
  };
}

/**
 * Archivio su file JSON.
 *
 * Due accortezze che sembrano eccessive e non lo sono:
 *
 * 1. Le modifiche passano da una coda. Node e' a thread singolo ma le
 *    operazioni su file sono asincrone: due richieste che leggono, cambiano e
 *    riscrivono in parallelo si sovrascriverebbero a vicenda, e la seconda
 *    cancellerebbe il lavoro della prima.
 *
 * 2. Si scrive su un file temporaneo e poi lo si rinomina. La rinomina e'
 *    atomica: se il processo muore a meta' scrittura, l'archivio precedente
 *    resta intatto invece di diventare un JSON troncato e illeggibile.
 */
export function archivioSuFile(percorso: string): Archivio {
  let coda: Promise<unknown> = Promise.resolve();

  const leggiDalDisco = async (): Promise<Dati> => {
    try {
      const testo = await readFile(percorso, 'utf8');
      return { ...datiVuoti(), ...(JSON.parse(testo) as Partial<Dati>) };
    } catch {
      return datiVuoti();
    }
  };

  const scriviSulDisco = async (dati: Dati): Promise<void> => {
    await mkdir(dirname(percorso), { recursive: true });
    const temporaneo = `${percorso}.tmp`;
    await writeFile(temporaneo, JSON.stringify(dati, null, 2));
    await rename(temporaneo, percorso);
  };

  return {
    leggi: leggiDalDisco,
    modifica(cambiamento) {
      const prossima = coda.then(async () => {
        const dati = await leggiDalDisco();
        const esito = await cambiamento(dati);
        await scriviSulDisco(dati);
        return esito;
      });
      coda = prossima.catch(() => undefined);
      return prossima as Promise<never>;
    },
  };
}
