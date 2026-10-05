# Correzione proprietà dei tag

## Installazione

Sostituisci i tre file corrispondenti nel tuo progetto:

- `main.js`: il JavaScript dell'interfaccia fornito come `Testo incollato.txt` (mantieni il nome e il percorso usati dal tuo HTML).
- `app.py`: il backend Flask fornito come `Markdown incollato (2).md` (mantieni il nome originale se diverso).
- `store.py`: lo store SQLite fornito come `Markdown incollato (3).md`.

Riavvia il backend e ricarica il browser evitando la cache. Non serve modificare lo schema: `tag_properties` esiste già. I file Python sono stati ripuliti dagli escape Markdown e dagli spazi non separabili presenti negli allegati. Il pacchetto contiene i file corretti, non l'applicazione completa: conserva gli altri moduli, template, risorse e dipendenze del progetto.

## Comportamento

Nel campo di creazione note, `#progetto[stato] in corso` crea o aggiorna soltanto `stato` del tag `#progetto`. Se il tag non esiste viene creato. Le altre proprietà restano intatte. La sintassi è riconosciuta prima dell'elaborazione delle priorità, quindi `!` nel valore viene conservato.

Il comando deve occupare l'intero inserimento, dopo aver eliminato gli spazi esterni. Sono ammessi lettere ASCII, cifre, `_`, `-` e `.` nel nome del tag, coerentemente con i tag dell'app. Chiavi senza parentesi quadre o a capo, non vuote; tra `]` e il valore occorre almeno uno spazio o tab. Il valore deve iniziare sulla stessa riga e può proseguire su più righe, anche con righe vuote. Le chiavi sono sensibili alle maiuscole. Un inserimento equivale a una singola assegnazione: eventuali righe successive appartengono al valore.

`Una nota con #progetto[stato] in corso` rimane una nota. Anche `#progetto[stato]` senza valore rimane una nota/riferimento. La modifica di una nota esistente mantiene il comportamento originale: la conversione in comando vale per la creazione.

L'ingranaggio carica le proprietà dal server e mostra una riga modificabile per ciascuna coppia. Sono disponibili aggiunta e rimozione; Salva sostituisce l'elenco completo. Valori con URL, due punti e paragrafi non vengono più spezzati dal formato della textarea precedente. Un errore di caricamento impedisce di salvare un elenco vuoto accidentalmente. I riferimenti alle proprietà leggono l'array strutturato restituito dalle API.

## API

`GET /api/tags/Projects/progetto/properties` legge l'elenco.

`PATCH /api/tags/Projects/progetto/properties` aggiunge/aggiorna le chiavi inviate, conservando le altre:

```json
{"properties":[{"key":"stato","value":"in corso"}]}
```

`PUT` o `POST` sullo stesso endpoint sostituisce l'elenco completo; `{"properties":[]}` lo svuota. L'operazione è transazionale. Le chiavi duplicate o non valide e i valori non stringa restituiscono 400 prima di qualsiasi modifica.

Il frontend invia i comandi direttamente a `PATCH .../properties`. Anche `POST /api/notes` riconosce la stessa sintassi, per i client API:

```json
{"text":"#progetto[stato] in corso"}
```

Risponde con HTTP 200, `kind: "tag_property"`, `status: "property_saved"`, `note: null`, `tag` e `properties`. Le note normali continuano a restituire HTTP 201 e `note`. I client che assumono sempre `response.note.id` devono distinguere i due casi.

`GET /api/tags` restituisce anche `properties` e `property_count`. Il vecchio `PATCH /api/tags/...` rifiuta il campo `properties` indicando l'endpoint corretto, invece di ignorarlo silenziosamente.

## Verifiche

- Test SQLite: inserimento, aggiornamento, persistenza visibile da una seconda connessione, cancellazione, sostituzione e validazione prima delle scritture.
- Test Flask: comandi senza creazione di note, aggiornamenti, lettura, conteggi, errori e normale creazione delle note.
- Test frontend su DOM simulato (linkedom): invio dei comandi, assenza di note spurie, note normali, caricamento/salvataggio/riapertura del modal e gestione degli errori.
- Controllo sintattico di JavaScript e Python. Non è stata verificata la resa grafica nel browser dell’app completa.

Esecuzione dei test Python, con Flask e flask-cors installati:

```sh
python test_properties.py
python test_api.py
```

`test_api.py` usa un database temporaneo. Poiché `filter_rules.py` non è stato allegato, se assente viene sostituito nei test da uno stub che fallisce qualora venga chiamato. I filtri non sono coperti da questa verifica.

Il salvataggio dal modal sostituisce l'intero elenco: in caso di modifiche contemporanee da più sessioni prevale l'ultimo salvataggio. Il comando dall'editor aggiorna invece soltanto le chiavi inviate.

Test frontend: `npm install linkedom`, poi `node test_frontend.cjs`.
