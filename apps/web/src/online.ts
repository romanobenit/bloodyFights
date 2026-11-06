import { fuggi } from './vista.ts';
import type { PartitaRemota, StatoCoda } from './cliente.ts';

/**
 * LA PAGINA ONLINE: coda, attesa, partita contro una persona.
 *
 * Come il resto della vista: una funzione pura da contesto a stringa. Il
 * tabellone vero e proprio lo disegna `disegna` di vista.ts, che e' lo stesso
 * usato contro il bot - la partita online non e' un'altra schermata, e' la
 * stessa con un avversario diverso.
 */

export type StatoOnline =
  /** Server assente: online non si puo' giocare, e va detto. */
  | { tipo: 'senzaServer' }
  /** Server c'e' ma non si e' entrati: online serve un conto. */
  | { tipo: 'senzaConto' }
  | { tipo: 'fermo' }
  | { tipo: 'inCoda'; da: number }
  | { tipo: 'inPartita'; partita: PartitaRemota }
  | { tipo: 'errore'; messaggio: string };

export interface ContestoOnline {
  statoOnline: StatoOnline;
  /** Quanto dura l'attesa in corso, in millisecondi. */
  attesaMs: number;
  /** Errori del mazzo: con un mazzo non valido in coda non si entra. */
  erroriMazzo: readonly string[];
  nickname: string;
  mmr: number;
  vittorie: number;
  sconfitte: number;
  messaggio: string;
}

function tempo(ms: number): string {
  const secondi = Math.max(0, Math.floor(ms / 1000));
  const minuti = Math.floor(secondi / 60);
  return minuti > 0 ? `${minuti}m ${String(secondi % 60).padStart(2, '0')}s` : `${secondi}s`;
}

function scheda(c: ContestoOnline): string {
  const partite = c.vittorie + c.sconfitte;
  return `
    <div class="pannello scheda-online">
      <h2>${fuggi(c.nickname || 'Senza nome')}</h2>
      <p class="punteggio">${c.mmr} <span>MMR</span></p>
      <p class="minuto">${c.vittorie} vinte · ${c.sconfitte} perse${
        partite > 0 ? ` · ${Math.round((c.vittorie / partite) * 100)}%` : ''
      }</p>
    </div>`;
}

export function paginaOnline(c: ContestoOnline): string {
  const s = c.statoOnline;

  if (s.tipo === 'senzaServer') {
    return `
      <div class="pannello avviso-online">
        <h2>Online non disponibile</h2>
        <p>Il server non risponde. Le partite contro una persona passano da lui:
        tiene il punto, mescola i mazzi e decide chi ha vinto, cose che non si
        possono lasciare a due browser che si fidano l'uno dell'altro.</p>
        <p class="minuto">Intanto puoi giocare contro il bot dalla pagina Gioca,
        costruire mazzi e disegnare carte: tutto resta sul tuo dispositivo.</p>
      </div>`;
  }

  if (s.tipo === 'senzaConto') {
    return `
      <div class="pannello avviso-online">
        <h2>Serve un conto</h2>
        <p>Il punteggio e le partite online stanno sul server, quindi per giocare
        contro una persona bisogna prima entrare.</p>
        <a class="bottone" href="#accesso" data-pagina="accesso">Vai all'accesso</a>
      </div>`;
  }

  if (s.tipo === 'errore') {
    return `
      <div class="pannello avviso-online">
        <h2>Qualcosa non ha funzionato</h2>
        <p>${fuggi(s.messaggio)}</p>
        <button type="button" class="bottone" data-azione="cerca-partita">Riprova</button>
      </div>`;
  }

  if (s.tipo === 'inCoda') {
    return `
      ${c.messaggio ? `<div class="messaggio">${fuggi(c.messaggio)}</div>` : ''}
      <div class="attesa-online">
        ${scheda(c)}
        <div class="pannello">
          <h2>In cerca di avversario</h2>
          <p class="attesa-tempo">${tempo(c.attesaMs)}</p>
          <p class="minuto">Si parte cercando chi ha un punteggio vicino al tuo.
          Piu' passa il tempo, piu' la ricerca si allarga: meglio una partita un
          po' squilibrata che nessuna partita.</p>
          <div class="pulsanti-coda">
            <button type="button" class="bottone secondario" data-azione="esci-coda">Annulla</button>
          </div>
        </div>
      </div>`;
  }

  const bloccato = c.erroriMazzo.length > 0;
  return `
    ${c.messaggio ? `<div class="messaggio">${fuggi(c.messaggio)}</div>` : ''}
    <div class="attesa-online">
      ${scheda(c)}
      <div class="pannello">
        <h2>Partita classificata</h2>
        <p class="minuto">Un turno dura un minuto: scaduto, passa all'altro.
        Se cade la connessione hai mezzo minuto per tornare.</p>
        ${
          bloccato
            ? `<ul class="errori">${c.erroriMazzo.map((e) => `<li>${fuggi(e)}</li>`).join('')}</ul>
               <p class="minuto">Sistema il mazzo nella pagina Mazzo e torna qui.</p>`
            : ''
        }
        <div class="pulsanti-coda">
          <button type="button" class="bottone" data-azione="cerca-partita" ${bloccato ? 'disabled' : ''}>
            Cerca partita
          </button>
        </div>
      </div>
    </div>`;
}

/** Secondi che restano al turno, dalla scadenza che manda il server. */
export function secondiAlTurno(partita: PartitaRemota | null, adesso: number): number | null {
  if (!partita || partita.esito) return null;
  return Math.max(0, (partita.scadeIl - adesso) / 1000);
}

/** Riassunto dell'esito, con il punteggio nuovo se il server l'ha mandato. */
export function riassuntoEsito(partita: PartitaRemota, mioId: string): string {
  const esito = partita.esito;
  if (!esito) return '';
  const motivi: Record<string, string> = {
    regole: 'ai punti',
    tempo: 'a tempo scaduto',
    abbandono: 'per abbandono',
  };
  const come = motivi[esito.motivo] ?? '';
  const mmr = esito.mmr?.[mioId];
  const punteggio = typeof mmr === 'number' ? ` Nuovo punteggio: ${mmr}.` : '';

  if (esito.vincitoreId === null) return `Pareggio ${come}.${punteggio}`;
  return esito.vincitoreId === mioId
    ? `Hai vinto ${come}.${punteggio}`
    : `Hai perso ${come}.${punteggio}`;
}

export type { StatoCoda };
