# Scheda Palestra

Web app (PWA) per seguire la scheda di palestra dal telefono Android: funziona
offline, salva i dati sul telefono e scambia la scheda con Claude tramite testo
e file JSON. Gratis, senza account e senza server.

## Cosa contiene la cartella

| File | A cosa serve |
|---|---|
| `index.html`, `css/`, `js/` | L'app vera e propria |
| `manifest.webmanifest`, `icons/` | Nome e icona per installarla come app |
| `sw.js` | Fa funzionare l'app senza connessione |
| `scheda-iniziale.json` | La scheda caricata al primo avvio |
| `FORMATO-SCHEDA.md` | Descrizione del formato JSON delle schede |

---

## 1. Pubblicarla su GitHub Pages (una volta sola, circa 10 minuti)

GitHub Pages ospita gratis siti statici come questo. Si fa tutto dal browser
del PC, senza installare niente.

1. **Crea un account** su <https://github.com/signup> (se non ce l'hai).
2. **Crea un repository**: in alto a destra **+** → **New repository**.
   - *Repository name*: `palestra` (o il nome che preferisci; finirà nell'indirizzo).
   - Lascia **Public**: GitHub Pages gratuito funziona solo con repository pubblici.
     Saranno visibili solo il codice e la scheda iniziale: **le tue sedute
     restano sul telefono** e non finiscono mai su GitHub.
   - Premi **Create repository**.
3. **Carica i file**: nella pagina del repository appena creato clicca
   **uploading an existing file**. Apri la cartella `App allenamento` in
   Esplora file, seleziona **tutto il contenuto tranne la cartella `.claude`**
   (cioè le cartelle `css`, `js`, `icons` e tutti i file, compreso
   `.nojekyll`) e trascinalo nella pagina. Aspetta che finisca il
   caricamento e premi **Commit changes**.
   Controlla che `index.html` sia nella pagina principale del repository,
   non dentro una sottocartella.
4. **Attiva Pages**: **Settings** (in alto) → **Pages** (menu a sinistra).
   In *Build and deployment* → *Source* scegli **Deploy from a branch**,
   poi *Branch*: **main** e cartella **/ (root)** → **Save**.
5. Dopo 1-2 minuti, ricaricando la pagina di Settings → Pages, compare
   l'indirizzo dell'app, del tipo:
   `https://TUO-NOME-UTENTE.github.io/palestra/`

## 2. Installarla sul telefono Android

1. Apri l'indirizzo con **Chrome** sul telefono.
2. Tocca il menu **⋮** in alto a destra → **Installa app**
   (su alcune versioni: **Aggiungi a schermata Home** → **Installa**).
3. L'icona del manubrio verde compare tra le app. Da lì si apre a schermo
   intero e funziona anche senza connessione.

## 3. Uso quotidiano

- **Allena**: tocca **Inizia** sul giorno (quello di oggi è evidenziato).
  Per ogni serie scrivi kg e ripetizioni (e il *margine*, cioè quante
  ripetizioni ti restavano, sugli esercizi con buffer) e tocca **✓**:
  parte il recupero con suono e vibrazione alla fine. Nelle superserie si
  alternano gli esercizi e il recupero parte dopo il secondo.
  I kg della volta precedente sono già precompilati; se l'ultima volta hai
  avuto più margine del buffer su tutte le serie, l'app propone +2,5 kg.
  Alla fine tocca **Termina e salva**.
  Durante la seduta lo schermo resta acceso; se passi a un'altra app, il
  timer non suona finché non torni.
- **Scheda**: la scheda attuale e le regole di progressione. Con
  **Modifica scheda** cambi nomi, peso di lavoro, serie, ripetizioni,
  buffer, recupero e note; aggiungi, elimini e sposti esercizi e giorni;
  colleghi due esercizi in superserie con una spunta. Il peso di lavoro si
  aggiorna anche da solo quando salvi una seduta.
- **Storico**: grafico dell'andamento per esercizio (carico massimo, 1RM
  stimato, volume, ripetizioni) ed elenco delle sedute.

## 4. Aggiornare la scheda con Claude

1. **Dati → Esporta per Claude**: scegli il periodo e tocca **Copia**.
2. Incolla il testo in una chat con Claude e chiedi, ad esempio:
   *"Analizza i miei progressi e aggiorna la scheda per le prossime settimane."*
   Il testo contiene già le istruzioni sul formato, quindi Claude risponde
   con un JSON compatibile.
3. Copia la risposta di Claude (va bene anche tutto il messaggio) e incollala
   in **Dati → Importa nuova scheda** → **Controlla** → **Sostituisci la
   scheda attuale**. Puoi anche caricare un file `.json`.
   Lo storico resta intatto e la scheda precedente viene archiviata.

Il formato è descritto in [FORMATO-SCHEDA.md](FORMATO-SCHEDA.md).

## 5. Backup (importante)

I dati stanno solo nel telefono, dentro Chrome. Disinstallando l'app o
cancellando i dati di Chrome si perdono. Ogni tanto fai
**Dati → Salva backup** e salva il file su Google Drive. Per recuperarli,
su un telefono nuovo, usa **Dati → Ripristina…**.

## 6. Modificare l'app in futuro

1. Modifica i file nella cartella del PC.
2. In `sw.js` aumenta il numero di versione: `scheda-palestra-v1` → `v2`.
3. Su GitHub apri il repository → **Add file** → **Upload files**, trascina
   i file modificati (sovrascrivono quelli vecchi) → **Commit changes**.
4. Sul telefono apri l'app, chiudila e riaprila: la nuova versione si vede
   dalla seconda apertura.

Per provarla sul PC prima di pubblicarla:

```bash
py -m http.server 8765
```

eseguito dentro la cartella, poi apri <http://localhost:8765> nel browser.
