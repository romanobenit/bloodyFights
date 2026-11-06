import { fuggi } from './vista.ts';
import type { UtenteRemoto } from './cliente.ts';

/**
 * PAGINA DI ACCESSO.
 *
 * Tre stati, e tutti e tre vanno detti con chiarezza: connesso, non connesso
 * con il server disponibile, e server assente. L'ultimo non e' un errore: il
 * gioco funziona lo stesso in locale, e la pagina lo spiega invece di mostrare
 * un modulo che non potrebbe funzionare.
 */

export type ModoAccesso = 'accesso' | 'registrazione';

export interface ModuloAccesso {
  modo: ModoAccesso;
  email: string;
  password: string;
  nickname: string;
}

export function moduloVuoto(): ModuloAccesso {
  return { modo: 'accesso', email: '', password: '', nickname: '' };
}

export type StatoServer = 'sconosciuto' | 'presente' | 'assente';

export interface ContestoAccesso {
  statoServer: StatoServer;
  utente: UtenteRemoto | null;
  modulo: ModuloAccesso;
  errore: string;
  inCorso: boolean;
}

function pannelloAccount(utente: UtenteRemoto): string {
  const partite = utente.vittorie + utente.sconfitte;
  const percentuale = partite === 0 ? '-' : `${Math.round((utente.vittorie / partite) * 100)}%`;

  return `
    <div class="pagina due-colonne">
      <section class="pannello">
        <h2>Connesso</h2>
        <p class="benvenuto">${fuggi(utente.nickname)}</p>
        <dl class="statistiche">
          <dt>MMR</dt><dd class="costo">${utente.mmr}</dd>
          <dt>Vittorie</dt><dd class="vita">${utente.vittorie}</dd>
          <dt>Sconfitte</dt><dd>${utente.sconfitte}</dd>
          <dt>Percentuale</dt><dd>${percentuale}</dd>
          <dt>Gocce d oro</dt><dd>${utente.oro}</dd>
          <dt>Iscritto dal</dt><dd>${fuggi(utente.creatoIl.slice(0, 10))}</dd>
        </dl>
        <button type="button" class="bottone secondario" data-azione="esci">Esci</button>
      </section>

      <section class="pannello">
        <h2>Cosa e sul server e cosa no</h2>
        <p class="nota">
          Sul server ci sono il tuo account, l MMR e le statistiche delle
          partite. Mazzi, collezione e carta creata vivono ancora in questo
          browser: li sposteremo quando il server sapra' custodirli.
        </p>
        <p class="nota">
          Esci quando usi un computer che non e tuo: la sessione si chiude
          davvero, il token viene revocato dal server e non basta piu.
        </p>
      </section>
    </div>`;
}

function moduli(c: ContestoAccesso): string {
  const registrazione = c.modulo.modo === 'registrazione';

  return `
    <div class="pagina due-colonne">
      <section class="pannello">
        <h2>${registrazione ? 'Crea un account' : 'Accedi'}</h2>

        <div class="barra-filtri">
          <button type="button" class="filtro ${!registrazione ? 'corrente' : ''}" data-modo="accesso">Ho gia un account</button>
          <button type="button" class="filtro ${registrazione ? 'corrente' : ''}" data-modo="registrazione">Crea un account</button>
        </div>

        <label class="campo">
          <span>Indirizzo email</span>
          <input type="email" data-campo="email-accesso" value="${fuggi(c.modulo.email)}"
                 autocomplete="email" placeholder="tu@esempio.it" />
        </label>

        ${
          registrazione
            ? `<label class="campo">
                 <span>Nickname</span>
                 <input type="text" data-campo="nickname-accesso" value="${fuggi(c.modulo.nickname)}"
                        maxlength="20" autocomplete="nickname" placeholder="Come ti chiamano" />
               </label>`
            : ''
        }

        <label class="campo">
          <span>Password${registrazione ? ' (almeno 10 caratteri)' : ''}</span>
          <input type="password" data-campo="password-accesso"
                 autocomplete="${registrazione ? 'new-password' : 'current-password'}" />
        </label>

        ${c.errore ? `<p class="esito-mazzo non-valido">${fuggi(c.errore)}</p>` : ''}

        <button type="button" class="bottone" data-azione="invia-accesso" ${c.inCorso ? 'disabled' : ''}>
          ${c.inCorso ? 'Un attimo...' : registrazione ? 'Crea account' : 'Entra'}
        </button>
      </section>

      <section class="pannello">
        <h2>A cosa serve</h2>
        <p class="nota">
          L account serve per le partite online: la coda di matchmaking deve
          sapere chi sei e quanto vale il tuo MMR. Senza account puoi gia
          giocare contro il bot, costruire il mazzo e disegnare la tua carta.
        </p>
        <p class="nota">
          La password viaggia al server e li viene trasformata in un impronta
          con scrypt e un sale tuo: nell archivio non finisce mai in chiaro, e
          nemmeno il token della sessione, di cui si conserva solo l impronta.
        </p>
      </section>
    </div>`;
}

function serverAssente(): string {
  return `
    <div class="pagina">
      <section class="pannello">
        <h2>Nessun server in ascolto</h2>
        <p class="nota">
          Questa copia del gioco non ha un server a cui parlare, quindi per ora
          non c e niente a cui accedere. Non e un guasto: tutto quello che hai
          fatto finora - mazzi, carta creata, partite contro il bot - vive in
          questo browser e continua a funzionare.
        </p>
        <p class="nota">
          Se stai sviluppando in locale, avvia il server con
          <code>npm run server</code> e ricarica la pagina.
        </p>
        <p class="nota">
          L account servira per le partite online, che arrivano con la fase 4.
          Il server va ospitato su un processo persistente - Railway, Fly.io -
          perche un sito statico non puo tenere aperta una partita.
        </p>
      </section>
    </div>`;
}

export function paginaAccesso(c: ContestoAccesso): string {
  if (c.utente) return pannelloAccount(c.utente);
  if (c.statoServer === 'assente') return serverAssente();
  return moduli(c);
}

/** Etichetta della voce di menu: dice a colpo d occhio se sei connesso. */
export function etichettaAccesso(c: { utente: UtenteRemoto | null; statoServer: StatoServer }): string {
  if (c.utente) return c.utente.nickname;
  return c.statoServer === 'assente' ? 'Account' : 'Accedi';
}
