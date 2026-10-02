# Journote

Journote è un'app per annotazioni rapide in Markdown. Le parole che iniziano con `#`, `@`, `>` o `+` diventano tag: selezionandone uno si apre la raccolta delle note associate. La vista calendario e le attività fanno parte dell'interfaccia esistente.

## Windows portable

La build produce un singolo `dist/Journote.exe`; non installa l'applicazione e non richiede Python sulla macchina di destinazione. Al primo avvio crea `data/journote.sqlite3` accanto all'eseguibile. Tieni l'eseguibile e la cartella `data` insieme quando sposti o copi l'app; la cartella deve essere scrivibile. È richiesto il runtime Microsoft Edge WebView2, normalmente già presente nelle versioni recenti di Windows.

Per creare l'eseguibile, esegui `build_windows.bat` su Windows con Python 3.10 o successivo. La procedura scarica le dipendenze nel virtual environment `.venv` e crea il file in `dist`.

Non è richiesto un account: Journote si apre direttamente. Le note e i tag restano nel database sul dispositivo. Se nella cartella dell'app sono presenti `notes.json` o `tags.json`, vengono importati al primo avvio; i JSON originali non vengono rimossi.

L'app non applica autenticazione. Mantieni il server associato a `127.0.0.1` e non esporre la porta ad altri dispositivi o reti.

La schermata attuale carica alcuni componenti, icone e font da CDN, quindi per il loro caricamento serve una connessione Internet. Le note e il database sono locali.

## Avvio per sviluppo

Installa `requirements.txt` e avvia il server con `python app.py`. L'interfaccia è disponibile su `http://127.0.0.1:8000`; il database viene creato in `data/journote.sqlite3`. Per usare la finestra desktop in sviluppo, installa anche `requirements-windows.txt` e avvia `python desktop.py`.
