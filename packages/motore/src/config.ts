/**
 * Tutti i valori numerici del regolamento in un punto solo (cap. 4.8 delle specifiche).
 * Nessuno di questi numeri va duplicato nella logica: si legge sempre da qui.
 * Dopo un playtest si cambia un numero in questo file e tutto il bilanciamento
 * si ricalcola, compresi i costi delle carte gia' create dagli utenti.
 */
export const CONFIG = {
  tabellone: {
    colonne: 4,
    linee: 2,
    caselle: 8,
    riposizionamentiPerTurno: 1,
    vitaGiocatore: 20,
  },

  economia: {
    gocceInizioTurno: 1,
    goccePerSupport: 1,
    tettoGocce: 10,
  },

  carte: {
    vitaMin: 1,
    vitaMax: 10,
    vitaMaxLatte: 5,
    attaccoMin: 0,
    attaccoMax: 10,
    potenzaMax: 20,
    nomeMaxCaratteri: 24,
    descrizioneMaxCaratteri: 90,
  },

  mazzo: {
    carteNelMazzo: 20,
    copieMassimeStessaCarta: 2,
    /**
     * Deroga al limite di copie, per costo della carta.
     * Le carte economiche si possono ripetere di piu': sono l'ossatura di un
     * mazzo aggressivo, e due sole copie le rendevano ininfluenti.
     * Modifica al cap. 4.2 da annotare nelle specifiche.
     */
    copieMassimePerCosto: { 0: 3, 1: 3 } as Record<number, number>,
    manoIniziale: 4,
    pescataPerTurno: 1,
    manoMassima: 7,
  },

  elementi: {
    /** Moltiplicatore quando l'attaccante ha il vantaggio forte sul difensore. */
    vantaggioForte: 1.5,
    /** Moltiplicatore del vantaggio ampio ma debole del petrolio. */
    vantaggioPetrolio: 1.2,
    /**
     * Moltiplicatore applicato al danno quando e' il DIFENSORE ad avere il
     * vantaggio elementale sull'attaccante. 1.0 = il vantaggio agisce solo sul
     * danno inflitto (scelta della v0.1). Portarlo a 0.5 ripristina il +/-50%
     * su entrambi i lati della bozza iniziale.
     */
    riduzioneInSvantaggio: 1.0,
  },

  partita: {
    /** Il giocatore che inizia salta la Fase 4 al suo primo turno. */
    compensazionePrimoGiocatore: true,
    timerTurnoSecondi: 60,
    riconnessioneSecondi: 30,
  },

  /** Pesi della formula del costo (cap. 5.2). Questa e' la tabella da ritarare. */
  costo: {
    pesoVita: 1.0,
    pesoAttacco: { mischia: 1.0, distanza: 1.5, support: 1.0, oggetto: 0 },
    bonusSupport: 4,
    /** Le carte oggetto non passano dalla formula: costano 0 e basta. */
    costoOggetto: 0,
    bonusElemento: {
      petrolio: 2,
      fuoco: 1,
      sangue: 1,
      acqua: 0.5,
      veleno: 0.5,
      latte: -1,
    },
    /** Fascia = primo scaglione il cui massimo copre P. */
    fasce: [
      { potenzaMax: 5, costo: 1 },
      { potenzaMax: 9, costo: 2 },
      { potenzaMax: 13, costo: 3 },
      { potenzaMax: 17, costo: 4 },
      { potenzaMax: 20, costo: 5 },
    ],
  },

  /** La rarita' e' derivata da P, non e' un dato da mantenere a mano. */
  rarita: [
    { potenzaMax: 9, rarita: 'comune' },
    { potenzaMax: 13, rarita: 'raro' },
    { potenzaMax: 17, rarita: 'epico' },
    { potenzaMax: 20, rarita: 'leggendario' },
  ],

  /** Valuta di gioco (cap. 8.1). Non usata dal motore, serve al server. */
  gocceDOro: {
    vittoria: 50,
    sconfitta: 15,
    primaVittoriaDelGiorno: 100,
    cartaDuplicata: 25,
  },
} as const;

export type Config = typeof CONFIG;
