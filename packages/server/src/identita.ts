import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { Archivio, Utente } from './archivio.ts';

/**
 * IDENTITA': registrazione, accesso, sessioni.
 *
 * Niente librerie: Node porta gia' tutto quello che serve per farlo bene.
 * Le scelte qui sotto non sono preferenze di stile, sono le regole minime
 * perche' una password non diventi un problema il giorno in cui qualcuno
 * legge l'archivio.
 */

/** Costi di scrypt. N alto rende lenta ogni verifica, e lentissimo un attacco. */
const COSTO_N = 16384;
const LUNGHEZZA_IMPRONTA = 64;
const LUNGHEZZA_SALE = 16;
const LUNGHEZZA_TOKEN = 32;

export const DURATA_SESSIONE_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni
export const TENTATIVI_MASSIMI = 10;
export const ATTESA_DOPO_TENTATIVI_MS = 15 * 60 * 1000;

export const PASSWORD_MINIMA = 10;
export const NICKNAME_MASSIMO = 20;

export class ErroreIdentita extends Error {
  /**
   * Scritto per esteso invece di `readonly stato` nel costruttore: le
   * proprieta' dichiarate nei parametri non sono solo annotazioni di tipo,
   * generano codice, e Node si limita a togliere i tipi senza generare nulla.
   */
  stato: number;

  constructor(message: string, stato = 400) {
    super(message);
    this.name = 'ErroreIdentita';
    this.stato = stato;
  }
}

// ------------------------------------------------------------ password

function derivaImpronta(password: string, sale: string): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    scrypt(password.normalize('NFKC'), sale, LUNGHEZZA_IMPRONTA, { N: COSTO_N }, (errore, chiave) => {
      if (errore) rifiuta(errore);
      else risolvi(chiave.toString('hex'));
    });
  });
}

export async function creaImpronta(password: string): Promise<{ impronta: string; sale: string }> {
  // Un sale diverso per ogni utente: due persone con la stessa password
  // ottengono impronte diverse, e una tabella precalcolata non serve a niente.
  const sale = randomBytes(LUNGHEZZA_SALE).toString('hex');
  return { impronta: await derivaImpronta(password, sale), sale };
}

export async function improntaCorrisponde(
  password: string,
  impronta: string,
  sale: string,
): Promise<boolean> {
  const candidata = await derivaImpronta(password, sale);
  const a = Buffer.from(candidata, 'hex');
  const b = Buffer.from(impronta, 'hex');
  if (a.length !== b.length) return false;
  // Confronto a tempo costante: un `===` esce al primo byte diverso, e il
  // tempo di risposta racconta quanti byte erano giusti.
  return timingSafeEqual(a, b);
}

// --------------------------------------------------------------- token

/**
 * Token opaco e casuale, non un JWT.
 *
 * Un JWT porta con se' la propria validita' e non si puo' revocare senza una
 * lista di revoche: tanto vale tenere la lista e basta. Nell'archivio finisce
 * solo l'impronta del token, cosi' chi legge il file non puo' entrare in
 * nessun account - vale per i token come per le password.
 */
export function nuovoToken(): string {
  return randomBytes(LUNGHEZZA_TOKEN).toString('base64url');
}

export function improntaToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------- validazione

export function normalizzaEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validaRegistrazione(email: string, password: string, nickname: string): string[] {
  const errori: string[] = [];

  // Validazione volutamente permissiva: l'unico modo di sapere se un indirizzo
  // esiste e' mandarci un messaggio. Una regex severa rifiuta indirizzi validi
  // e non ferma quelli finti.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errori.push('Indirizzo email non valido');

  if (password.length < PASSWORD_MINIMA)
    errori.push(`La password deve avere almeno ${PASSWORD_MINIMA} caratteri`);
  if (password.length > 200) errori.push('Password troppo lunga');

  const nome = nickname.trim();
  if (nome.length < 2) errori.push('Il nickname deve avere almeno 2 caratteri');
  if (nome.length > NICKNAME_MASSIMO)
    errori.push(`Il nickname supera i ${NICKNAME_MASSIMO} caratteri`);

  return errori;
}

// -------------------------------------------------------------- azioni

export interface EsitoAccesso {
  token: string;
  utente: Utente;
}

export async function registra(
  archivio: Archivio,
  email: string,
  password: string,
  nickname: string,
  adesso = Date.now(),
): Promise<EsitoAccesso> {
  const indirizzo = normalizzaEmail(email);
  const errori = validaRegistrazione(indirizzo, password, nickname);
  if (errori.length > 0) throw new ErroreIdentita(errori.join('; '));

  const { impronta, sale } = await creaImpronta(password);
  const token = nuovoToken();

  const utente = await archivio.modifica((dati) => {
    if (dati.utenti.some((u) => u.email === indirizzo))
      throw new ErroreIdentita('Esiste gia un account con questo indirizzo', 409);

    const nuovo: Utente = {
      id: `u${dati.utenti.length + 1}-${randomBytes(4).toString('hex')}`,
      email: indirizzo,
      impronta,
      sale,
      nickname: nickname.trim(),
      bio: '',
      oro: 0,
      mmr: 1000, // Elo semplice, partenza a 1000 (cap. 10.3)
      vittorie: 0,
      sconfitte: 0,
      cartaCreataId: null,
      creatoIl: new Date(adesso).toISOString(),
      tentativiFalliti: 0,
      ultimoTentativo: 0,
    };
    dati.utenti.push(nuovo);
    dati.sessioni.push({
      improntaToken: improntaToken(token),
      utenteId: nuovo.id,
      creataIl: adesso,
      scadeIl: adesso + DURATA_SESSIONE_MS,
    });
    return nuovo;
  });

  return { token, utente };
}

export async function accedi(
  archivio: Archivio,
  email: string,
  password: string,
  adesso = Date.now(),
): Promise<EsitoAccesso> {
  const indirizzo = normalizzaEmail(email);
  const dati = await archivio.leggi();
  const utente = dati.utenti.find((u) => u.email === indirizzo);

  if (utente && utente.tentativiFalliti >= TENTATIVI_MASSIMI) {
    const attesa = utente.ultimoTentativo + ATTESA_DOPO_TENTATIVI_MS - adesso;
    if (attesa > 0)
      throw new ErroreIdentita(
        `Troppi tentativi falliti. Riprova fra ${Math.ceil(attesa / 60000)} minuti`,
        429,
      );
  }

  // Si verifica l'impronta anche quando l'utente non esiste, contro un'impronta
  // finta: altrimenti la risposta immediata direbbe "questo indirizzo non e'
  // registrato" a chiunque provi, e diventerebbe un elenco di chi c'e'.
  const valida = utente
    ? await improntaCorrisponde(password, utente.impronta, utente.sale)
    : await improntaCorrisponde(password, 'f'.repeat(LUNGHEZZA_IMPRONTA * 2), 'sale-finto').then(
        () => false,
      );

  if (!utente || !valida) {
    if (utente) {
      await archivio.modifica((d) => {
        const bersaglio = d.utenti.find((u) => u.id === utente.id);
        if (bersaglio) {
          bersaglio.tentativiFalliti += 1;
          bersaglio.ultimoTentativo = adesso;
        }
      });
    }
    // Stesso messaggio in entrambi i casi: non si dice MAI quale dei due e'
    // sbagliato, o si regala la conferma che un indirizzo esiste.
    throw new ErroreIdentita('Indirizzo o password non corretti', 401);
  }

  const token = nuovoToken();
  const aggiornato = await archivio.modifica((d) => {
    const bersaglio = d.utenti.find((u) => u.id === utente.id)!;
    bersaglio.tentativiFalliti = 0;
    bersaglio.ultimoTentativo = adesso;
    d.sessioni.push({
      improntaToken: improntaToken(token),
      utenteId: bersaglio.id,
      creataIl: adesso,
      scadeIl: adesso + DURATA_SESSIONE_MS,
    });
    // Occasione buona per buttare via le sessioni scadute.
    d.sessioni = d.sessioni.filter((s) => s.scadeIl > adesso);
    return bersaglio;
  });

  return { token, utente: aggiornato };
}

export async function utenteDalToken(
  archivio: Archivio,
  token: string | null,
  adesso = Date.now(),
): Promise<Utente | null> {
  if (!token) return null;
  const dati = await archivio.leggi();
  const impronta = improntaToken(token);
  const sessione = dati.sessioni.find((s) => s.improntaToken === impronta && s.scadeIl > adesso);
  if (!sessione) return null;
  return dati.utenti.find((u) => u.id === sessione.utenteId) ?? null;
}

export async function esci(archivio: Archivio, token: string | null): Promise<void> {
  if (!token) return;
  const impronta = improntaToken(token);
  await archivio.modifica((dati) => {
    dati.sessioni = dati.sessioni.filter((s) => s.improntaToken !== impronta);
  });
}

/** L'utente come lo puo' vedere il client: senza impronta, sale e tentativi. */
export function utentePubblico(utente: Utente) {
  return {
    id: utente.id,
    nickname: utente.nickname,
    bio: utente.bio,
    oro: utente.oro,
    mmr: utente.mmr,
    vittorie: utente.vittorie,
    sconfitte: utente.sconfitte,
    cartaCreataId: utente.cartaCreataId,
    creatoIl: utente.creatoIl,
  };
}
