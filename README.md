# BloodyFights

Card game competitivo 1v1 a turni su tabellone posizionale 4x2, con carte
create dai giocatori in pixel art. Implementazione del documento di
specifiche v0.1 (5 novembre 2026).

## Stato

| Fase | Obiettivo | Stato |
|------|-----------|-------|
| 0 | Motore di gioco puro + suite di test | **completata** |
| 1 | Tabellone giocabile, bot elementare, primo playtest | **completata** |
| 2 | Account, mazzi, tutorial | **completata lato server; manca la UI di accesso** |
| 3 | Editor di carte, coda di moderazione | **completata (coda locale)** |
| 4 | Online: WebSocket, matchmaking, MMR | **in corso: server e identita** |
| 5 | Economia, bauli, feed della home | da fare |
| 6 | Pagamenti, termini, privacy | da fare |

## Requisiti

**Node.js >= 22.13**, e nient'altro. Nessun pacchetto da installare: i `.ts`
si eseguono direttamente (type stripping integrato in Node) e i test girano
con il runner integrato.

La versione conta: `npm run build` e `npm run dev` usano
`module.stripTypeScriptTypes`, arrivata in Node 22.13. Su una versione
precedente la compilazione non parte; `npm run dev` se ne accorge, lo dice e
serve la cartella `dist` gia compilata, cosi si puo comunque giocare, ma le
modifiche ai sorgenti non si vedono finche Node non viene aggiornato. I test
funzionano gia da Node 22.6.

## Comandi

```bash
npm test          # 343 test su motore, pixel, server, pagine, interfaccia e stile
npm run server    # avvia il server su http://localhost:4000
npm run dev       # gioca su http://localhost:5173
npm run build     # compila in apps/web/dist
npm run anteprima # pagina statica di anteprima, apribile con un doppio clic
npm run simula    # playtest automatico fra due bot
```

## Pubblicazione su Vercel

Il progetto e' un sito statico: nessun server, nessun database, nessuna
dipendenza da installare. `vercel.json` dice tutto quello che serve.

| Impostazione | Valore |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `apps/web/dist` |
| Install command | `npm install` |
| Node.js | 22.x |

Dalla dashboard di Vercel: **Add New - Project**, si importa questa repo e si
preme Deploy. Le impostazioni vengono lette da `vercel.json`, non serve
toccarle a mano.

La build gira `apps/web/strumenti/compila.mjs`, che toglie i tipi dal
TypeScript con l'API integrata di Node e riscrive gli import: niente bundler,
niente passaggi nascosti. Quello che finisce online e' esattamente il codice
di `src/`, senza le annotazioni di tipo.

Cosa NON e' pubblicato, perche' non esiste ancora: account, partite online,
negozio, pagamenti. Chi apre il sito gioca contro il bot in locale, costruisce
il mazzo e disegna la sua carta; i dati restano nel suo browser.

## Struttura

```
packages/motore/   regole del gioco. Non conosce rete, database, DOM
packages/pixel/    palette, formato 4 bit/pixel, segnaposto, motore di disegno
packages/bot/      avversario avido, condiviso fra interfaccia e simulatore
packages/server/   server autoritativo: archivio, identita, rotte HTTP
apps/web/          tabellone giocabile, mazzo, profilo, tutorial
  src/vista.ts       tabellone: stato -> HTML, nessun accesso al DOM
  src/pagine.ts      mazzo, profilo, tutorial: stesse regole, stessa purezza
  src/editor.ts      editor di carte: strumenti, vincoli, barra di potenza
  src/moderazione.ts coda di revisione, decisioni, revoca di un rifiuto
  src/profilo.ts     collezione, mazzi, validazione. Funzioni pure
  src/deposito.ts    dove finiscono i dati: memoria o localStorage
  src/main.ts        clic -> azioni, turno del bot, navigazione
  src/stile.css      identita visiva del cap. 2, verificata da test
  strumenti/         compilatore minimo, server statico, anteprima
```

## Quattro decisioni da conoscere prima di toccare il codice

**I numeri stanno in `config.ts`, non nella logica.** Dopo un playtest si
cambia un valore in quel file e il bilanciamento si ricalcola da solo,
compresi i costi delle carte create dagli utenti.

**Il motore e una funzione pura.** `applicaAzione(stato, azione)` non legge
variabili globali, non tocca il database e non conosce il DOM. Da qui vengono
tre cose: i test non avviano niente, lo stesso file potra girare sul client e
sul server, e `rigioca()` ricostruisce una partita dalla sequenza delle mosse.

**Anche la vista e una funzione pura.** `disegna(schermata)` restituisce una
stringa HTML e non tocca il DOM: si verifica in Node come il motore. Il
disegno degli sprite entra dall'esterno, perche per produrlo serve un canvas.

**Lo stack delle specifiche non e installato.** React, Vite e Tailwind non
sono installabili su questa macchina: il registry npm risponde 403 perche
l'uscita di rete e disattivata per l'account (Impostazioni > Capacita >
"Consenti uscita di rete"). L'app e quindi scritta in TypeScript e DOM
nativi, con un compilatore di 90 righe che toglie i tipi e riscrive gli
import. La palette e le spaziature stanno in variabili CSS, dove sarebbero
stati nella configurazione di Tailwind. Quando i pacchetti diventeranno
installabili il passaggio tocchera solo `apps/web`: motore, pixel e bot non
sanno niente di interfacce.

## Fase 2: cosa c'e' e cosa manca

C'e': collezione, editor del mazzo con le regole del cap. 4.2 (20 carte, al
massimo 2 copie e solo se le possiedi), fino a 3 mazzi con uno attivo, profilo
con statistiche, tutorial delle quattro fasi. Il mazzo attivo e' quello con cui
si scende in campo; vittorie e sconfitte finiscono nel profilo.

Non c'e': **registrazione e login**. Richiedono il server e il database delle
specifiche, che su questa macchina non sono installabili. Non sono stati
simulati con una finta autenticazione nel browser: un login che non autentica
niente insegna un modello sbagliato e andrebbe comunque riscritto.

I dati stanno nel browser dietro `Deposito`, un'interfaccia con due
implementazioni (memoria e localStorage). Quando arrivera' il server bastera'
scriverne una terza che parla con lui: la UI non se ne accorge.

### Due copie di ogni carta, non una

Il cap. 12 propone di concedere tutte e 20 le carte a un nuovo account. Con una
copia sola pero' esiste **un solo mazzo legale possibile** - venti carte
diverse - e l'editor del mazzo non avrebbe nulla da fare. Qui se ne concedono
2 per carta (`COPIE_INIZIALI` in `profilo.ts`). Da confermare: incide
sull'economia dei bauli della fase 5.

### Il tutorial non ha ancora la partita guidata

Il cap. 3 chiede che il tutorial si chiuda con una partita guidata contro un
bot. Qui si chiude con un invito a giocare una partita normale: i suggerimenti
passo per passo non sono stati scritti.

## Fase 3: l'editor di carte

C'e': tela 32x32 su canvas a x12 esatti, tavolozza a 16 colori, matita, gomma,
secchiello, contagocce, linea, rettangolo, specchia e svuota, con annulla e
ripeti a 40 passi (il documento ne chiede almeno 30). Le statistiche hanno i
vincoli del cap. 5: vita 1-10 con il latte fermo a 5, attacco 0-10 che diventa
"Cura" per i support. La barra di potenza si colora per fascia e, oltre il
tetto di 20, blocca l'invio dicendo **quale** statistica abbassare e di quanto.
Il costo e' calcolato, mai scelto, ed e' mostrato scomposto voce per voce: chi
capisce il sistema progetta dentro il tetto invece di sbattere contro il
rifiuto.

Il motore di disegno sta in `packages/pixel/src/disegno.ts` ed e' fatto di
funzioni pure: secchiello iterativo (non ricorsivo, o 1024 chiamate annidate
sfonderebbero lo stack), linea di Bresenham con gli estremi normalizzati
perche' il verso del trascinamento non cambi il risultato, cronologia che
scarta il futuro quando si disegna dopo un annulla.

Il **pannello di moderazione** c'e': coda ordinata per data, anteprima del
disegno, statistiche e potenza calcolata, approvazione e rifiuto con le quattro
motivazioni predefinite del cap. 9, registro delle decisioni e revoca di un
rifiuto sbagliato. La revisione si fa a tastiera (`A` approva, `1`-`4`
rifiutano, `Z` revoca), perche' con centinaia di carte in coda il mouse non
basta.

Il ciclo e' chiuso: una carta rifiutata mostra al creatore la motivazione,
esce dalla sua collezione e dai suoi mazzi, e gli restituisce il tentativo.
Una revoca la rimette in coda e lascia nel registro la decisione annullata,
segnata come tale: un registro che si puo' riscrivere non e' un registro.

Quello che manca e' la **coda condivisa**. Oggi vive in questo browser, quindi
si vedono solo le proprie carte e si e' insieme creatore e moderatore: serve a
provare il flusso, non a validare niente. Con il server la coda diventa comune,
il pannello viene riservato ai moderatori e la carta approvata entra nel pool
pubblico. L'approvazione resta manuale: nessun filtro automatico riconosce in
modo affidabile un disegno offensivo a 32x32, e l'occhio umano in coda e'
l'unica difesa reale.

## Fase 4: il server

Il documento propone Fastify e PostgreSQL. Su questa macchina non sono
installabili, quindi il server usa il modulo `http` integrato di Node e un
archivio su file JSON - ma dietro le stesse interfacce che un domani useranno
Fastify e il database: `Archivio` per la persistenza, rotte scritte come
funzioni da Richiesta a Risposta che non sanno niente di Node. Cambiare strato
vorra' dire riscrivere `http.ts`, non le regole.

**Il principio non negoziabile del cap. 10 resta intatto:** il server e'
autoritativo. Il motore di gioco e' lo stesso pacchetto che gira nel browser,
quindi le due logiche non possono divergere: sono lo stesso file.

### Identita'

Registrazione e accesso veri, con le precauzioni che servono:

- password con **scrypt** e un sale diverso per ogni utente, confronto a tempo
  costante (un `===` esce al primo byte diverso, e il tempo di risposta
  racconta quanti byte erano giusti);
- sessioni con **token opachi e revocabili**, di cui l'archivio conserva solo
  l'impronta: chi legge il file non entra in nessun account;
- la stessa risposta per password sbagliata e indirizzo inesistente, o
  l'errore diventerebbe un modo per scoprire chi ha un account;
- freno dopo dieci tentativi falliti;
- elenco chiuso di origini ammesse, mai `*`.

Avvio: `npm run server`. Si configura con `PORTA`, `ARCHIVIO` e `ORIGINI`.

### Dove va ospitato

Il sito su Vercel e' statico e li' un server non vive. Il backend vuole un
processo persistente: Railway o Fly.io, come dice il cap. 10.1. Vercel resta
ottimo per il frontend.

### Cosa manca alla fase 4

La UI di accesso nel client, il matchmaking con la coda MMR, le partite fra
due browser e il flusso in tempo reale. L'archivio prevede gia' le raccolte
del cap. 10.4.

## La palette: una decisione da confermare

Il cap. 7.1 chiede "16 colori: nero, bianco osso, quattro rossi, e tre toni
per ciascun elemento". Quei conti fanno 24 slot, non 16. In
`packages/pixel/src/palette.ts` i 16 sono spesi cosi: 4 neutri, 4 rossi, 6
toni elementali (uno per elemento), 2 toni intermedi condivisi per ombre e
luci.

Va confermato **prima** di aprire l'editor al pubblico: ogni pixel salvato e
un indice in quella tabella, non un colore, quindi cambiare la palette dopo
cambia tutti i disegni gia inviati.

## Le illustrazioni sono segnaposto

Le 20 carte base non hanno un disegno: e l'unico contenuto delle specifiche
che richiede lavoro grafico manuale. Nel frattempo
`packages/pixel/src/segnaposto.ts` genera una creatura deterministica per
ogni carta, con il tono del suo elemento, la stazza proporzionale alla vita e
l'ornamento proporzionale all'attacco. Usa la stessa tela 32x32 e la stessa
palette dell'editor: quando arriva il disegno vero basta sostituire la
stringa base64 in una colonna del database, nessun codice cambia.

## Misure dal simulatore

400 partite fra due bot avidi identici, mazzo di partenza per entrambi:

```
Durata: media 17,9 turni totali (~8,9 per giocatore), mediana 17
Vittorie di chi inizia: 76,5% (71% su 200 partite con semi diversi)
```

La durata conferma la previsione del documento (8-12 turni per giocatore a 20
punti vita). Il vantaggio del primo giocatore resta invece molto sbilanciato
nonostante la Fase 4 saltata al primo turno: con il difensore che non replica,
il tempo e quasi tutto. Da verificare con giocatori umani prima di cambiare le
regole; se si confermasse, le leve sono in `config.ts` (compensazione piu
ampia, oppure una goccia in piu al secondo giocatore).
