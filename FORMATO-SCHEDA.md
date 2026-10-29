# Formato della scheda (JSON)

L'app importa le schede in questo formato. Quando chiedi a Claude una nuova
scheda, incolla il testo generato da **Dati → Esporta per Claude**: contiene
già queste istruzioni in forma breve, quindi Claude risponde nel formato giusto.

## Struttura

```json
{
  "formato": "scheda-palestra",
  "versione": 1,
  "nome": "Upper/Lower 4 giorni",
  "dataInizio": "2026-11-02",
  "note": "Testo libero (facoltativo)",
  "regoleProgressione": [
    "Fondamentali: +2,5 kg quando tutte le serie hanno più margine del buffer."
  ],
  "giorni": [
    {
      "nome": "Upper A",
      "giornoSettimana": "Lunedì",
      "esercizi": [
        { "nome": "Panca piana bilanciere", "serie": 4, "ripetizioni": "6", "kg": 80, "buffer": 3, "recupero": 180 },
        { "nome": "Trazioni a cluster", "serie": 5, "ripetizioni": "2", "ripetizioniPerSerie": [3, 2, 2, 2, 3], "recupero": 120, "note": "Mai a cedimento" },
        { "nome": "Alzate laterali al cavo", "serie": 4, "ripetizioni": "15", "recupero": 90, "superserie": "A" },
        { "nome": "Face pull", "serie": 4, "ripetizioni": "15", "recupero": 90, "superserie": "A" }
      ]
    }
  ]
}
```

## Campi della scheda

| Campo | Obbligatorio | Significato |
|---|---|---|
| `formato` | sì | Sempre `"scheda-palestra"`. |
| `versione` | sì | Sempre `1`. |
| `nome` | no | Nome della scheda. |
| `dataInizio` | no | Data di inizio, `AAAA-MM-GG`. Se manca, si usa la data dell'importazione. |
| `note` | no | Testo libero. |
| `regoleProgressione` | no | Elenco di frasi, mostrate nella sezione Scheda. |
| `giorni` | sì | Elenco dei giorni, nell'ordine in cui li fai. |

## Campi di un giorno

| Campo | Obbligatorio | Significato |
|---|---|---|
| `nome` | sì | Es. `"Upper A"`. |
| `giornoSettimana` | no | Es. `"Lunedì"`. L'app evidenzia il giorno di oggi. |
| `esercizi` | sì | Elenco degli esercizi in ordine. |

## Campi di un esercizio

| Campo | Obbligatorio | Significato |
|---|---|---|
| `nome` | sì | Nome dell'esercizio. **Tieni sempre lo stesso nome** tra una scheda e l'altra: storico e grafici collegano gli esercizi per nome. |
| `serie` | sì | Numero intero di serie (1–20). |
| `ripetizioni` | sì | Testo: `"6"` oppure un intervallo, ad esempio `"15-20"`. |
| `ripetizioniPerSerie` | no | Un numero per ogni serie, quando cambiano da serie a serie (es. cluster `[3, 2, 2, 2, 3]`). La lunghezza deve essere uguale a `serie`. |
| `kg` | no | Peso di lavoro. Precompila i kg in allenamento e viene aggiornato automaticamente al carico massimo usato quando salvi una seduta. Si può cambiare anche dalla sezione Scheda → Modifica scheda. |
| `buffer` | no | Ripetizioni di margine previste (B3 → `3`). Se c'è, durante l'allenamento compare la colonna "margine". |
| `incremento` | no | Kg da aggiungere quando si progredisce. Predefinito: `2.5`. |
| `recupero` | no | Secondi (`180` = 3'), oppure un intervallo come testo (`"60-90"`: il timer usa il valore più alto). Predefinito: 90". |
| `superserie` | no | Lettera che collega esercizi **consecutivi** dello stesso giorno (es. `"A"`). Si alternano serie per serie e il recupero parte dopo l'ultimo esercizio del gruppo. Usa lettere diverse per superserie diverse nello stesso giorno. |
| `note` | no | Indicazioni tecniche, mostrate durante l'allenamento. |

## Suggerimento di progressione

Per gli esercizi con `buffer`, se nell'ultima seduta hai completato tutte le
serie con le ripetizioni previste e **margine dichiarato maggiore del buffer**,
l'app propone il carico precedente + `incremento` e lo precompila.
Se invece hai cambiato a mano il peso (`kg`) nella scheda, vale quello e il
suggerimento non compare.
