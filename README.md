# Journote

Questa è la mia copia personale di Journote, un'app per annotazioni rapide in Markdown. Le parole che iniziano con `#`, `@`, `>` o `+` diventano tag: selezionandone uno si apre la raccolta delle note associate. La vista calendario e le attività fanno parte dell'interfaccia esistente.

## Editor Markdown

Scrivi la sintassi direttamente nel campo nota: `**grassetto**`, `*corsivo*`, `` `codice` ``, `# titolo`, liste e link Markdown. Senza selezione, `Ctrl+B`, `Ctrl+I` e `Ctrl+K` inseriscono rispettivamente i delimitatori; con una selezione la racchiudono. `Tab` inserisce due spazi e `Ctrl+Enter` salva o aggiorna la nota.

Incolla un'immagine dagli appunti con `Ctrl+V`: Journote la salva in `data/img` con un nome UUID e inserisce il link Markdown nel punto del cursore. Sono supportati PNG, JPEG, GIF, WebP e BMP fino a 10 MB. Nel testo l'immagine si adatta alla larghezza disponibile; cliccala per aprirla a schermo intero.

## Filtri

Premi `Alt+F` per aprire il filtro. Cerca un tag o una persona e selezionala dal completamento; aggiungi `!` per negare, `e` per AND o `o` per OR. `e` ha precedenza su `o`; usa le parentesi per raggruppare. Per esempio: `#progetto e !@persona o (#diario e @persona)`. I risultati si aprono in una nuova tab.

## Avvio locale

Per eseguire l'app in locale:

1. Crea un ambiente virtuale:
   ```bash
   python3 -m venv venv
   ```

2. Attiva l'ambiente virtuale:
   ```bash
   source venv/bin/activate
   ```

3. Installa le dipendenze:
   ```bash
   pip install -r requirements.txt
   ```

4. Avvia il server:
   ```bash
   python3 app.py
   ```

L'interfaccia sarà disponibile su `http://127.0.0.1:8000`. Il database verrà creato in `data/journote.sqlite3`.

Per disattivare l'ambiente virtuale quando hai finito:
```bash
deactivate
```

## Test

Per eseguire i test locali:
```bash
python3 -m unittest discover -s tests -v
```

## Build Windows

Per creare l'eseguibile Windows:

1. Assicurati di avere Python 3.10+ installato
2. Esegui lo script di build:
   ```bash
   build_windows.bat
   ```

La procedura crea un virtual environment `.venv`, scarica le dipendenze e genera `dist/Journote.exe`.

## Docker

Per eseguire in Docker:
```bash
docker build -t journote .
docker run -p 8000:8000 -v $(pwd)/data:/data journote
```

Per il modo sviluppo:
```bash
docker build -f Dockerfile.dev -t journote-dev .
docker run -p 8000:8000 -v $(pwd)/data:/data -v $(pwd):/app journote-dev
```

## Nota importante

Questa è una versione modificata per il mio uso personale. Le istruzioni qui riportate sono specifiche per il mio ambiente di lavoro e potrebbero differire da quelle ufficiali.
