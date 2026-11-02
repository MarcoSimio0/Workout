# Collegare Strava (Garmin → Strava → app)

L'app legge le attività del Garmin passando da Strava. Strava, per dare
l'accesso, vuole una chiave segreta (il *Client Secret*) che non può stare
dentro l'app, perché l'app è pubblica su GitHub. La custodisce un piccolo
servizio gratuito, un **Cloudflare Worker**: l'app chiede a lui, lui chiede a Strava.

Servono circa 20 minuti, da fare **dal computer**, una volta sola.
Se preferisci evitarlo, l'alternativa senza server è importare il CSV di
Garmin Connect (Dieta → Attività → Importa CSV).

I nomi dei menu di Strava e Cloudflare possono cambiare un po' nel tempo:
se una voce non corrisponde, cerca quella con il nome più simile.

---

## 0. Garmin Connect → Strava

Se le attività del Vivoactive 3 compaiono già su Strava, salta questo passo.

1. Nell'app **Garmin Connect** sul telefono apri il menu, poi **Impostazioni**
   → **App collegate** (o *App di terze parti*) → **Strava** → **Collega**.
2. Accedi a Strava e autorizza. Da quel momento ogni attività salvata sull'orologio
   arriva anche su Strava, con le calorie.

## 1. Crea l'app su Strava

1. Dal computer apri <https://www.strava.com/settings/api> e accedi.
2. Compila il modulo:
   - **Application Name**: `Scheda Palestra`
   - **Category**: una qualsiasi, per esempio *Training*
   - **Website**: `https://marcosimio0.github.io/Workout/`
   - **Authorization Callback Domain**: `marcosimio0.github.io`
     (solo il dominio: senza `https://` e senza `/Workout`)
3. Accetta i termini e conferma. Se chiede un'immagine, carica `icons/icon-192.png`.
4. Nella pagina dell'app trovi **Client ID** (un numero) e **Client Secret**
   (premi *Show*). Tienila aperta: ti servono al passo 2.
   Il Client Secret non va mai condiviso né incollato nell'app.

## 2. Crea il worker su Cloudflare

1. Crea un account gratuito su <https://dash.cloudflare.com/sign-up>
   (consigliata la verifica in due passaggi).
2. Nel menu a sinistra apri **Workers & Pages** (a volte sotto *Compute*) →
   **Create** → **Start with Hello World!** (o *Create Worker*).
3. Nome: `strava-palestra` → **Deploy**.
4. Premi **Edit code**. Cancella tutto il codice di esempio, apri sul PC il file
   `strava-worker/worker.js` di questa cartella, copia tutto e incollalo. Premi **Deploy**.
5. Torna alla pagina del worker → **Settings** → **Variables and Secrets** → **Add**:
   - Type **Text**, Variable name `STRAVA_CLIENT_ID`, Value = il Client ID di Strava;
   - **Add** di nuovo: Type **Secret**, Variable name `STRAVA_CLIENT_SECRET`,
     Value = il Client Secret di Strava;
   - premi **Deploy** (o *Save*).
6. In alto trovi l'indirizzo del worker, del tipo
   `https://strava-palestra.TUO-NOME.workers.dev`. Aprilo nel browser: deve comparire
   `{"funziona":true,"clientId":true,"clientSecret":true}`.
   Se uno dei due è `false`, ricontrolla il punto 5.

## 3. Collega l'app

1. Sul telefono apri l'app → **Dieta** → **⚙** → riquadro **Strava**.
2. In *Indirizzo del worker* incolla l'indirizzo del passo 2.6.
3. Tocca **Collega Strava**: si apre Strava e chiede il permesso di leggere le
   attività. Lascia le spunte e tocca **Autorizza**.
4. Torni nell'app con «Strava collegato» e parte la prima sincronizzazione.

Da quel momento le attività si aggiornano da sole quando apri la sezione Dieta
(al massimo ogni 3 ore), oppure con **Sincronizza ora** in Dieta → Attività.

---

## Cosa resta dove

- Il **Client Secret** sta solo nel worker di Cloudflare.
- Sul telefono resta il permesso di accesso (*token*), che serve solo a leggere
  le attività. Non finisce nel file di backup: ripristinando un backup su un
  altro telefono, ricollega Strava.
- Il worker risponde solo all'app (`marcosimio0.github.io`) e alla versione di
  prova sul PC (`localhost:8765`). Se cambi nome utente o indirizzo dell'app,
  aggiorna l'elenco `ORIGINI` in cima a `worker.js` e ripubblica il worker.
- Limiti gratuiti: Cloudflare consente 100.000 richieste al giorno, Strava 100
  ogni 15 minuti; l'app ne usa poche a ogni sincronizzazione.

## Per scollegare

- Nell'app: Dieta → ⚙ → **Scollega** (le attività già importate restano).
- Su Strava: Impostazioni → **Le mie app** → revoca l'accesso a *Scheda Palestra*.
- Su Cloudflare puoi eliminare il worker.

## Se qualcosa non va

| Messaggio | Cosa controllare |
|---|---|
| «Il worker non risponde» | L'indirizzo del worker è giusto e il worker è pubblicato (passo 2.6). |
| Strava dice che il *redirect_uri* non è valido | *Authorization Callback Domain* deve essere `marcosimio0.github.io`. |
| «Origine non consentita» | L'elenco `ORIGINI` in `worker.js` deve contenere l'indirizzo dell'app. |
| Attività doppie | Non dovrebbero esserci: le attività con stessa data e ora (±15 minuti) vengono unite. Se capita, eliminane una. |
| Attività senza calorie | Strava non le ha ricevute: l'app le stima con i MET. |

L'app usa le **calorie attive**: dalle calorie che arrivano da Garmin e Strava
toglie la quota del metabolismo basale durante l'attività. Per questo, in
Dieta → ⚙, conviene impostare basale e peso.
