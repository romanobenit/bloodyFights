import {
  type Azione, type CartaCompleta, type IndiceGiocatore, MossaIllegale,
  type StatoPartitaConCatalogo, applicaAzione, creaPartita, occulta, validaMazzo,
} from '@bloodyfights/motore';
import type { Archivio } from './archivio.ts';
import { type InAttesa, accoppia, nuovoMmr } from './elo.ts';

/**
 * L'ARENA: le partite online.
 *
 * Qui il server e' l'arbitro. Il client non calcola niente che conti: manda
 * mosse, riceve lo stato. Vale anche al contrario - un client modificato non
 * puo' inventarsi gocce di sangue, perche' chi tiene il punteggio e' questo
 * file.
 *
 * Il tempo entra da fuori, con `passaIlTempo(adesso)`. Niente setTimeout
 * sparsi per le partite: un solo battito che l'avvio chiama ogni secondo e i
 * test chiamano quando vogliono, anche saltando due minuti in una riga.
 */

/** Quanto dura un turno prima di passare da solo. */
export const TURNO_MS = 60_000;
/** Quanto si aspetta chi si e' disconnesso prima di dargli partita persa. */
export const RICONNESSIONE_MS = 30_000;

export type Avviso =
  | { tipo: 'inCoda'; da: number }
  | { tipo: 'partitaTrovata'; partitaId: string }
  | { tipo: 'stato' }
  | { tipo: 'finita' };

export interface PartitaOnline {
  id: string;
  /** Gli id utente, nell'ordine dei giocatori del motore. */
  utenti: [string, string];
  stato: StatoPartitaConCatalogo;
  /** Istante in cui il turno in corso scade. */
  scadeIl: number;
  /** Per ogni utente: da quando e' assente, oppure null se e' collegato. */
  assenteDa: Record<string, number | null>;
  esito: Esito | null;
}

export interface Esito {
  /** null a pareggio. */
  vincitoreId: string | null;
  motivo: 'regole' | 'tempo' | 'abbandono';
  /** Punteggio nuovo per ogni utente. */
  mmr: Record<string, number>;
}

export interface Ascoltatore {
  (avviso: Avviso): void;
}

export interface OpzioniArena {
  archivio: Archivio;
  carte: readonly CartaCompleta[];
  /** Sorgente dei semi: iniettabile per avere partite ripetibili nei test. */
  seme?: () => number;
  /** Generatore di identificativi, iniettabile per lo stesso motivo. */
  nuovoId?: () => string;
}

export function creaArena(opzioni: OpzioniArena) {
  const seme = opzioni.seme ?? (() => Math.floor(Math.random() * 2 ** 31));
  const nuovoId = opzioni.nuovoId ?? (() => crypto.randomUUID());

  let coda: InAttesa[] = [];
  /** mazzo scelto da chi e' in coda */
  const mazzi = new Map<string, readonly string[]>();
  const partite = new Map<string, PartitaOnline>();
  /** utenteId -> partitaId, per non cercare fra tutte le partite ogni volta. */
  const doveSta = new Map<string, string>();
  const ascoltatori = new Map<string, Set<Ascoltatore>>();
  /**
   * Le scritture del punteggio in corso. La partita si chiude subito e
   * l'archivio si aggiorna dopo, ma qualcuno deve poter aspettare che sia
   * finito davvero: i test, e lo spegnimento del server.
   */
  let scritture: Promise<unknown> = Promise.resolve();

  function avvisa(utenteId: string, avviso: Avviso): void {
    for (const a of ascoltatori.get(utenteId) ?? []) {
      // Un ascoltatore che esplode non deve fermare la partita dell'altro.
      try {
        a(avviso);
      } catch (errore) {
        console.error('Ascoltatore in errore:', errore);
      }
    }
  }

  function ascolta(utenteId: string, fn: Ascoltatore): () => void {
    const insieme = ascoltatori.get(utenteId) ?? new Set<Ascoltatore>();
    insieme.add(fn);
    ascoltatori.set(utenteId, insieme);
    return () => {
      insieme.delete(fn);
      if (insieme.size === 0) ascoltatori.delete(utenteId);
    };
  }

  function partitaDi(utenteId: string): PartitaOnline | null {
    const id = doveSta.get(utenteId);
    return id ? partite.get(id) ?? null : null;
  }

  function indiceDi(partita: PartitaOnline, utenteId: string): IndiceGiocatore {
    return partita.utenti[0] === utenteId ? 0 : 1;
  }

  /** Lo stato come lo vede un giocatore: senza le carte che non deve vedere. */
  function vista(utenteId: string) {
    const partita = partitaDi(utenteId);
    if (!partita) return null;
    const io = indiceDi(partita, utenteId);
    return {
      partitaId: partita.id,
      io,
      avversario: partita.utenti[1 - io],
      stato: occulta(partita.stato, io),
      scadeIl: partita.scadeIl,
      esito: partita.esito,
    };
  }

  // ------------------------------------------------------------------- coda

  function entra(utenteId: string, mmr: number, mazzo: readonly string[], adesso: number) {
    const corrente = partitaDi(utenteId);
    if (corrente && !corrente.esito) throw new MossaIllegale('Hai gia una partita in corso');

    // validaMazzo restituisce un ELENCO di errori: va guardata la lunghezza.
    // Un array vuoto e' vero in JavaScript, e `if (errori)` passerebbe sempre.
    const errori = validaMazzo(mazzo, opzioni.carte);
    if (errori.length > 0) throw new MossaIllegale(errori.join('; '));

    if (corrente?.esito) doveSta.delete(utenteId);
    coda = coda.filter((x) => x.utenteId !== utenteId);
    coda.push({ utenteId, mmr, da: adesso });
    mazzi.set(utenteId, [...mazzo]);
    avvisa(utenteId, { tipo: 'inCoda', da: adesso });
  }

  function esci(utenteId: string): void {
    coda = coda.filter((x) => x.utenteId !== utenteId);
    mazzi.delete(utenteId);
  }

  function inCoda(utenteId: string): InAttesa | null {
    return coda.find((x) => x.utenteId === utenteId) ?? null;
  }

  function apriPartita(primo: string, secondo: string, adesso: number): PartitaOnline {
    const partita: PartitaOnline = {
      id: nuovoId(),
      utenti: [primo, secondo],
      stato: creaPartita({
        idGiocatori: [primo, secondo],
        mazzi: [mazzi.get(primo) ?? [], mazzi.get(secondo) ?? []],
        carte: opzioni.carte,
        seme: seme(),
      }),
      scadeIl: adesso + TURNO_MS,
      // Si parte da assenti: chi non apre il flusso entro mezzo minuto non
      // tiene l'altro in attesa per sempre.
      assenteDa: { [primo]: adesso, [secondo]: adesso },
      esito: null,
    };

    partite.set(partita.id, partita);
    doveSta.set(primo, partita.id);
    doveSta.set(secondo, partita.id);
    mazzi.delete(primo);
    mazzi.delete(secondo);

    for (const u of partita.utenti) avvisa(u, { tipo: 'partitaTrovata', partitaId: partita.id });
    return partita;
  }

  // ------------------------------------------------------------- presenza

  function presente(utenteId: string, _adesso: number): void {
    const partita = partitaDi(utenteId);
    if (partita) partita.assenteDa[utenteId] = null;
  }

  function assente(utenteId: string, adesso: number): void {
    const partita = partitaDi(utenteId);
    if (partita && partita.assenteDa[utenteId] === null) partita.assenteDa[utenteId] = adesso;
  }

  // ---------------------------------------------------------------- mosse

  function agisci(utenteId: string, azione: Azione, adesso: number) {
    const partita = partitaDi(utenteId);
    if (!partita) throw new MossaIllegale('Non hai partite in corso');
    if (partita.esito) throw new MossaIllegale('La partita e finita');

    const io = indiceDi(partita, utenteId);
    if (partita.stato.turnoDi !== io) throw new MossaIllegale('Non e il tuo turno');

    const prima = partita.stato.turnoDi;
    partita.stato = applicaAzione(partita.stato, azione);
    // Il cronometro riparte solo quando il turno cambia davvero: altrimenti
    // basterebbe spostare una carta avanti e indietro per non scadere mai.
    if (partita.stato.turnoDi !== prima) partita.scadeIl = adesso + TURNO_MS;

    concludiSeFinita(partita, 'regole');
    for (const u of partita.utenti) avvisa(u, { tipo: 'stato' });
    return vista(utenteId);
  }

  // --------------------------------------------------------------- battito

  /**
   * Il battito. Fa tre cose: accoppia chi aspetta, fa passare i turni
   * scaduti, assegna a tavolino le partite abbandonate.
   */
  function passaIlTempo(adesso: number): void {
    for (const accoppiamento of accoppia(coda, adesso)) {
      const { primo, secondo } = accoppiamento;
      coda = coda.filter((x) => x.utenteId !== primo.utenteId && x.utenteId !== secondo.utenteId);
      apriPartita(primo.utenteId, secondo.utenteId, adesso);
    }

    for (const partita of partite.values()) {
      if (partita.esito) continue;

      // Abbandono: prima si guarda questo, perche' chi e' sparito non deve
      // nemmeno far scorrere i turni.
      const sparito = partita.utenti.find((u) => {
        const da = partita.assenteDa[u];
        return da !== null && adesso - da >= RICONNESSIONE_MS;
      });

      if (sparito) {
        const altro = partita.utenti.find((u) => u !== sparito)!;
        const entrambi = partita.utenti.every((u) => {
          const da = partita.assenteDa[u];
          return da !== null && adesso - da >= RICONNESSIONE_MS;
        });
        chiudi(partita, entrambi ? null : altro, 'abbandono');
        continue;
      }

      if (adesso >= partita.scadeIl) {
        // Turno scaduto: si bruciano le fasi che restano fino a cambiare
        // giocatore. Il turno passa, non la partita.
        const chiEra = partita.stato.turnoDi;
        let giri = 0;
        while (partita.stato.turnoDi === chiEra && partita.stato.fase !== 'finita' && giri++ < 10) {
          partita.stato = applicaAzione(partita.stato, { tipo: 'passaFase' });
        }
        partita.scadeIl = adesso + TURNO_MS;
        if (!concludiSeFinita(partita, 'tempo')) {
          for (const u of partita.utenti) avvisa(u, { tipo: 'stato' });
        }
      }
    }
  }

  function concludiSeFinita(partita: PartitaOnline, motivo: Esito['motivo']): boolean {
    if (partita.stato.fase !== 'finita') return false;
    const vincitore = partita.stato.vincitore;
    chiudi(partita, vincitore === null ? null : partita.utenti[vincitore], motivo);
    return true;
  }

  function chiudi(partita: PartitaOnline, vincitoreId: string | null, motivo: Esito['motivo']) {
    const [a, b] = partita.utenti;
    partita.esito = { vincitoreId, motivo, mmr: {} };

    // Il punteggio si aggiorna nell'archivio, ma la partita e' chiusa subito:
    // un archivio lento non deve tenere i due giocatori in attesa.
    scritture = scritture.then(() =>
      registraEsito(partita, vincitoreId).catch((errore) => {
        console.error('Punteggio non aggiornato:', errore);
      }),
    );

    // Il collegamento utente -> partita NON si taglia qui: i due devono
    // poter leggere il tabellone finale e di quanto si e' mosso il punteggio.
    // Se ne occupa `pulisci`, qualche minuto dopo.
    for (const u of [a, b]) avvisa(u, { tipo: 'finita' });
  }

  async function registraEsito(partita: PartitaOnline, vincitoreId: string | null) {
    const [a, b] = partita.utenti;
    const aggiornati = await opzioni.archivio.modifica((dati) => {
      const ua = dati.utenti.find((u) => u.id === a);
      const ub = dati.utenti.find((u) => u.id === b);
      if (!ua || !ub) return {};

      const mmrA = ua.mmr;
      const mmrB = ub.mmr;
      if (vincitoreId === null) {
        // Pareggio: nessuno dei due ha vinto, i punteggi non si muovono.
        return { [a]: mmrA, [b]: mmrB };
      }

      const aHaVinto = vincitoreId === a;
      ua.mmr = nuovoMmr(mmrA, mmrB, aHaVinto);
      ub.mmr = nuovoMmr(mmrB, mmrA, !aHaVinto);
      if (aHaVinto) {
        ua.vittorie += 1;
        ub.sconfitte += 1;
      } else {
        ub.vittorie += 1;
        ua.sconfitte += 1;
      }
      return { [a]: ua.mmr, [b]: ub.mmr };
    });

    if (partita.esito) partita.esito.mmr = aggiornati as Record<string, number>;
    for (const u of partita.utenti) avvisa(u, { tipo: 'finita' });
  }

  /** Abbandono volontario: vince l'altro, subito. */
  function abbandona(utenteId: string): void {
    esci(utenteId);
    const partita = partitaDi(utenteId);
    if (!partita || partita.esito) return;
    chiudi(partita, partita.utenti.find((u) => u !== utenteId)!, 'abbandono');
  }

  /** Dimentica le partite concluse da un po': l'arena non cresce all'infinito. */
  function pulisci(adesso: number, dopoMs = 5 * 60_000): void {
    for (const [id, partita] of partite) {
      if (partita.esito && adesso - partita.scadeIl > dopoMs) {
        partite.delete(id);
        for (const u of partita.utenti) if (doveSta.get(u) === id) doveSta.delete(u);
      }
    }
  }

  return {
    entra, esci, inCoda, agisci, abbandona, passaIlTempo, pulisci,
    presente, assente, ascolta, partitaDi, vista,
    quantiInCoda: () => coda.length,
    /** Aspetta che i punteggi siano finiti nell'archivio. */
    attendiScritture: () => scritture,
    partita: (id: string) => partite.get(id) ?? null,
  };
}

export type Arena = ReturnType<typeof creaArena>;
