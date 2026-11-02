# Formato della dieta e degli sgarri (JSON)

La sezione **Dieta** importa due tipi di testo preparati da Claude:

- la **dieta di riferimento**, da incollare in Dieta → ⚙ → Dieta di riferimento;
- gli **sgarri**, da incollare in Dieta → Incolla sgarro.

Il testo generato da **Dieta → Bilancio → Esporta per Claude** contiene già
questi formati in forma breve, quindi Claude risponde nel formato giusto.
Va bene incollare anche il messaggio intero di Claude: l'app trova da sola il
blocco JSON.

## Dieta di riferimento

```json
{
  "formato": "dieta-palestra",
  "versione": 1,
  "nome": "Dieta novembre",
  "dataInizio": "2026-11-02",
  "obiettivoKcal": 2300,
  "attivitaInclusa": "4 allenamenti con i pesi a settimana",
  "giorni": [
    {
      "nome": "Allenamento",
      "giorniSettimana": ["Lunedì", "Martedì", "Giovedì", "Venerdì"],
      "obiettivoKcal": 2450,
      "pasti": [
        { "nome": "Colazione", "voci": [
          { "nome": "Yogurt greco 0%", "quantita": "170 g", "kcal": 100 },
          { "nome": "Fiocchi d'avena", "quantita": "50 g", "kcal": 190 }
        ]},
        { "nome": "Pranzo", "voci": [
          { "nome": "Riso basmati", "quantita": "90 g", "kcal": 320 },
          { "nome": "Petto di pollo", "quantita": "150 g", "kcal": 165 }
        ]}
      ]
    },
    {
      "nome": "Riposo",
      "pasti": [
        { "nome": "Colazione", "voci": [
          { "nome": "Yogurt greco 0%", "quantita": "170 g", "kcal": 100 }
        ]}
      ]
    }
  ]
}
```

### Campi della dieta

| Campo | Obbligatorio | Significato |
|---|---|---|
| `formato` | sì | Sempre `"dieta-palestra"`. |
| `versione` | sì | Sempre `1`. |
| `nome` | no | Nome della dieta. |
| `dataInizio` | no | Da quando vale, `AAAA-MM-GG`. Se manca, dal giorno dell'importazione. |
| `obiettivoKcal` | no | Bersaglio calorico giornaliero. Se manca, vale la somma delle voci della giornata. |
| `attivitaInclusa` | no | Testo che descrive l'attività già considerata dalla dieta (solo promemoria). |
| `note` | no | Testo libero. |
| `giorni` | sì | Le giornate tipo (per esempio allenamento e riposo). |

Se la dieta è uguale tutti i giorni, al posto di `giorni` si può scrivere
direttamente `"pasti": [ … ]`.

### Campi di una giornata

| Campo | Obbligatorio | Significato |
|---|---|---|
| `nome` | sì | Es. `"Allenamento"`. |
| `giorniSettimana` | no | Giorni in cui vale: `["Lunedì", "Giovedì"]`. Una giornata **senza** questo campo vale per tutti i giorni rimasti. Ogni giorno della settimana deve avere una giornata. |
| `obiettivoKcal` | no | Bersaglio di questa giornata; vince su quello della dieta. |
| `pasti` | sì | Elenco dei pasti in ordine. |

Nell'app, per un singolo giorno, puoi scegliere un'altra giornata tipo
(per esempio «Riposo» se salti l'allenamento).

### Campi di pasti e voci

| Campo | Obbligatorio | Significato |
|---|---|---|
| pasto `nome` | sì | Es. `"Colazione"`, `"Pranzo"`. Tieni gli stessi nomi tra una dieta e l'altra. |
| pasto `voci` | sì | Gli alimenti del pasto. |
| voce `nome` | sì | Es. `"Riso basmati"`. |
| voce `kcal` | sì | Calorie della voce (numero). |
| voce `quantita` | no | Testo libero, es. `"90 g"`. |

### Alternative

Facoltative, per i piani che indicano alimenti equivalenti:

- su una **voce**: `"alternative": [{ "nome": "Skyr", "quantita": "150 g", "kcal": 94 }, …]`;
- su un **pasto** (menù intero diverso): `"alternative": [{ "nome": "Colazione salata", "voci": [ … ] }, …]`.

Nella vista Giorno, sotto la voce o il pasto, compare un menu ⇄ per scegliere
l'alternativa di quel giorno. L'obiettivo resta quello del piano, quindi la
differenza di kcal dell'alternativa entra nel saldo.

### Altri nomi accettati

L'app legge anche i piani scritti in un formato leggermente diverso, come
quelli preparati in altre chat:

| Scritto così | Vale come |
|---|---|
| `"formato": "dieta"` | `"formato": "dieta-palestra"` |
| `"giornoSettimana": "Lunedì"` | `"giorniSettimana": ["Lunedì"]` |
| `"grammi": 250, "misura": "una tazza"` | `"quantita": "250 g (una tazza)"` |
| `"alternativeIntere"` su un pasto | `"alternative"` su un pasto |
| `"impostazioni": { "metabolismoBasale", "pesoKg", "attivitaGiaInclusa" }` | basale, peso e kcal di attività già prevista, impostati all'importazione |

I campi che l'app non usa (per esempio i totali `kcal` dei pasti e `kcalTotali`
dei giorni) vengono ignorati: i totali li calcola lei dalle voci.

### Più diete nel tempo

Ogni dieta importata resta salvata. Ogni giorno usa la dieta in vigore in
quella data (quella con la `dataInizio` più recente non successiva al giorno).
La **prima** dieta vale anche per i giorni precedenti già segnati, così gli
sgarri inseriti prima di caricarla si contano correttamente. Importando una
dieta con la stessa `dataInizio` di una già presente, la sostituisce.

## Sgarri

Un oggetto, oppure un array di oggetti:

```json
[
  {"tipo": "sgarro", "data": "2026-10-31", "pasto": "sera", "descrizione": "4 spritz, 2 americano", "kcal": 1150, "kcalMin": 1000, "kcalMax": 1300},
  {"tipo": "sgarro", "data": "2026-11-01", "pasto": "pranzo", "descrizione": "Spätzle con speck", "kcal": 1350, "kcalMin": 1200, "kcalMax": 1500, "sostituisce": "pranzo"}
]
```

| Campo | Obbligatorio | Significato |
|---|---|---|
| `tipo` | no | `"sgarro"`. |
| `data` | no | `AAAA-MM-GG` (accetta anche `31/10/2026`). Se manca, oggi. |
| `descrizione` | sì | Cosa hai mangiato o bevuto. |
| `kcal` | sì | Stima centrale (numero). |
| `kcalMin`, `kcalMax` | no | Intervallo della stima, solo informativo. |
| `pasto` | no | `colazione`, `spuntino`, `pranzo`, `merenda`, `cena` o `sera`. |
| `sostituisce` | no | Nome del pasto previsto che lo sgarro ha **sostituito**: le kcal di quel pasto vengono tolte. Ometti il campo se lo sgarro è in aggiunta ai pasti. |

Gli sgarri già presenti (stessa data, descrizione e kcal) vengono saltati, così
incollare due volte lo stesso testo non li raddoppia.

## Come si calcola il saldo

Per ogni giorno, dall'inizio del monitoraggio a oggi:

```
saldo = (kcal della dieta − voci e pasti tolti + sgarri) − (obiettivo + attività extra)
```

- **positivo** = sopra il piano, **negativo** = sotto;
- la dieta del giorno conta come seguita al 100%, salvo le voci e i pasti tolti;
- **attività extra** = calorie attive delle attività non già previste dalla
  dieta, meno le eventuali «altre kcal al giorno già previste» delle impostazioni;
- calorie **attive**: alle calorie delle attività importate da Garmin si toglie
  la quota del metabolismo basale, `Calorie − basale × (durata in ore / 24)`
  (correzione disattivabile in Dieta → ⚙); per le attività senza calorie si usa
  `(MET − 1) × peso × ore`, dove il −1 toglie il consumo a riposo.
