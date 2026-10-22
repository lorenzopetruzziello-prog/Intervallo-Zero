# Intervallo Zero

Timer a intervalli per HIIT, Tabata, circuiti, EMOM e boxe. Funziona nel browser del telefono e si installa sulla schermata Home come un'app.

## Perché non sfasa

Il tempo trascorso non viene contato sommando "+1 secondo" a ogni tick. Viene misurato ogni volta come differenza tra l'istante attuale e l'istante di partenza, con `performance.now()`, un contatore ad alta precisione che non dipende dall'ora del telefono. Le fasi sono calcolate una volta sola in millisecondi interi. Se un aggiornamento dello schermo arriva in ritardo, il numero si corregge al giro dopo: il ritardo non si accumula.

I bip sono programmati sull'orologio audio del dispositivo fino a 2,5 secondi prima, quindi cadono sul secondo esatto.

## Funzioni

- Preparazione, lavoro, riposo, round, cicli e pausa tra cicli
- Preset: Tabata, HIIT 40/20, Circuito, EMOM 10, Boxe
- Schermo sempre acceso (Screen Wake Lock, con video silenzioso come riserva)
- In verticale: cifre grandi, barra dei round, comandi in basso
- In orizzontale: cifre a tutto schermo, comandi sul lato destro
- Funziona offline dopo la prima apertura
- Impostazioni salvate sul dispositivo

Tastiera: spazio = pausa/riprendi, frecce = fase precedente/successiva, Esc = termina.

## Pubblicarlo con GitHub Pages

1. Crea un repository e carica tutti i file di questa cartella (compresi `.nojekyll` e la cartella `assets`).
2. Vai su **Settings → Pages**.
3. In **Source** scegli **Deploy from a branch**, branch `main`, cartella `/ (root)`, poi **Save**.
4. Dopo un minuto il sito è su `https://<tuo-utente>.github.io/<nome-repository>/`.

## Installarlo sul telefono

- **iPhone (Safari):** apri il link → tasto Condividi → **Aggiungi alla schermata Home**.
- **Android (Chrome):** apri il link → menu ⋮ → **Installa app** (o **Aggiungi a schermata Home**).

Aperto dall'icona, il timer parte a tutto schermo, senza le barre del browser.

## Aggiornare l'app

Dopo aver modificato un file, cambia `VERSION` in `sw.js` (per esempio da `iz-v1` a `iz-v2`). Così i telefoni scaricano la versione nuova invece di usare quella in memoria.

## File

| File | Cosa contiene |
|---|---|
| `index.html` | Struttura delle due schermate |
| `style.css` | Aspetto, layout verticale e orizzontale |
| `app.js` | Impostazioni, calcolo fasi, orologio, suoni, schermo acceso, interfaccia |
| `sw.js` | Funzionamento offline |
| `manifest.webmanifest` | Nome, icona e tutto schermo per l'installazione |
| `assets/` | Icone e video silenzioso per tenere lo schermo acceso |
