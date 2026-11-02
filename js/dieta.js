'use strict';

// ===================== Dieta: bilancio calorico =====================
// Caricato prima di app.js: le funzioni comuni (dati, salva, render, esc, toast, chiedi…)
// si usano solo dentro le funzioni, quando la pagina è già pronta.

const PASTI = ['Colazione', 'Spuntino', 'Pranzo', 'Merenda', 'Cena', 'Sera'];
const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const COLORE_SOPRA = '#e66767';
const COLORE_SOTTO = '#3987e5';
const SEZIONI_DIETA = [['giorno', 'Giorno'], ['sgarri', 'Sgarri'], ['attivita', 'Attività'], ['bilancio', 'Bilancio'], ['impostazioni', '⚙']];
const PERIODI = [['giorno', 'Giorno'], ['settimana', 'Sett.'], ['mese', 'Mese'], ['trimestre', 'Trim.'], ['anno', 'Anno']];
const PERIODI_EXPORT = [['7', 'Ultimi 7 giorni'], ['14', 'Ultimi 14 giorni'], ['30', 'Ultimi 30 giorni'], ['settimana', 'Questa settimana (da lunedì)'], ['mese', 'Questo mese']];

// MET dal Compendium of Physical Activities; se c'è la velocità (km/h) si interpola.
const TIPI_ATTIVITA = {
  camminata: { nome: 'Camminata', met: 3.5, velocita: [[3.2, 2.8], [4, 3], [4.8, 3.5], [5.6, 4.3], [6.4, 5], [7.2, 7]] },
  corsa: { nome: 'Corsa', met: 9, velocita: [[6.4, 6], [8, 8.3], [9.7, 9.8], [11.3, 11], [12.9, 11.8], [14.5, 12.8], [16.1, 14.5]] },
  bici: { nome: 'Bici', met: 6.8, velocita: [[12, 4], [17.5, 6.8], [20.5, 8], [24, 10], [28, 12]] },
  palestra: { nome: 'Palestra / pesi', met: 5 },
  escursione: { nome: 'Escursione', met: 6 },
  nuoto: { nome: 'Nuoto', met: 6 },
  sport: { nome: 'Sport di squadra', met: 7 },
  altro: { nome: 'Altro', met: 4 }
};

// Tipi di Garmin Connect (in italiano o in inglese) → tipo dell'app.
const RICONOSCI_TIPO = [
  ['corsa', /run|cors|tapis|jog/],
  ['camminata', /walk|cammin/],
  ['escursione', /hik|escursion|trekking/],
  ['bici', /ride|cicl|bici|bike|cycl|spinning/],
  ['palestra', /weight|strength|forza|pesi|palestra|crossfit|hiit|gym/],
  ['nuoto', /swim|nuot|piscina/],
  ['sport', /soccer|calcio|football|tennis|padel|basket|volley|pallavolo/]
];

const ESEMPIO_SGARRI = [
  { tipo: 'sgarro', data: 'AAAA-MM-GG', pasto: 'cena', descrizione: 'Pizza margherita e birra media', kcal: 1150, kcalMin: 1000, kcalMax: 1300, sostituisce: 'cena' },
  { tipo: 'sgarro', data: 'AAAA-MM-GG', pasto: 'sera', descrizione: '2 spritz', kcal: 300, kcalMin: 250, kcalMax: 350 }
];

const ESEMPIO_DIETA = {
  formato: 'dieta-palestra',
  versione: 1,
  nome: 'Nome della dieta',
  dataInizio: 'AAAA-MM-GG',
  giorni: [
    {
      nome: 'Allenamento',
      giorniSettimana: ['Lunedì', 'Martedì', 'Giovedì', 'Venerdì'],
      pasti: [
        { nome: 'Colazione', voci: [{ nome: 'Yogurt greco 0%', quantita: '170 g', kcal: 100, alternative: [{ nome: 'Skyr', quantita: '150 g', kcal: 94 }] }, { nome: "Fiocchi d'avena", quantita: '50 g', kcal: 190 }] },
        { nome: 'Pranzo', voci: [{ nome: 'Riso basmati', quantita: '90 g', kcal: 320 }, { nome: 'Petto di pollo', quantita: '150 g', kcal: 165 }] }
      ]
    },
    {
      nome: 'Riposo',
      pasti: [
        { nome: 'Colazione', voci: [{ nome: 'Yogurt greco 0%', quantita: '170 g', kcal: 100 }] }
      ]
    }
  ]
};

const statoDieta = {
  sezione: 'giorno',
  data: null,            // giorno mostrato; null = oggi
  periodo: 'settimana',
  rif: null,             // un giorno del periodo mostrato nel bilancio; null = oggi
  sel: null,             // barra selezionata nel grafico
  exportPeriodo: '7',
  exportAllenamenti: false,
  testoSgarri: '',
  sgarriInAttesa: null,
  testoDieta: '',
  dietaInAttesa: null,
  ultimoImport: null,
  formSgarro: null,
  formAttivita: null,
  formPassi: { id: null, passi: '', kcal: '' },
  tutteAttivita: false
};

// ===================== Dati =====================

function dietaVuota() {
  return {
    piani: [],
    giorni: {},
    sgarri: [],
    attivita: [],
    garminScartate: [],   // chiavi delle attività di Garmin eliminate o scartate: non si reimportano
    daVerificare: [],     // attività di Garmin sovrapposte a una inserita a mano
    passi: {},            // 'AAAA-MM-GG': aggiornamenti del totale del giorno; vale l'ultimo
    impostazioni: { basale: null, peso: null, inizio: null, correzioneBasale: true }
  };
}

// Sgarri dei giorni prima dell'app (stime di Claude): restano modificabili.
function precaricaDieta(d) {
  d.sgarri.push(
    { id: 'pre-1', data: '2026-10-30', pasto: '', descrizione: 'Vasetto di pesto da 120 g + 3 fette di pane', kcal: 700, kcalMin: 650, kcalMax: 750, fonte: 'claude' },
    { id: 'pre-2', data: '2026-10-31', pasto: 'Sera', descrizione: '4 spritz, 2 americano, 1 liquore a 17°', kcal: 1150, kcalMin: 1000, kcalMax: 1300, fonte: 'claude' },
    { id: 'pre-3', data: '2026-11-01', pasto: 'Pranzo', descrizione: 'Pranzo fuori dieta: spätzle con speck e formaggio, verdura, 2 involtini di pesce spada ripieni e impanati', kcal: 1350, kcalMin: 1200, kcalMax: 1500, sostituisce: 'Pranzo', fonte: 'claude' }
  );
  d.giorni['2026-11-01'] = { saltati: ['colazione'] };
}

function preparaDieta() {
  if (!dati.dieta) {
    dati.dieta = dietaVuota();
    precaricaDieta(dati.dieta);
  }
  const d = dati.dieta, v = dietaVuota();
  for (const k of Object.keys(v)) if (d[k] == null) d[k] = v[k];
  d.impostazioni = Object.assign(v.impostazioni, d.impostazioni);
  // Versioni precedenti: Strava (tolto), attività da CSV senza chiave, «attività già prevista» (tolta).
  delete d.strava;
  delete d.impostazioni.tipiPrevisti;
  delete d.impostazioni.attivitaPrevistaKcal;
  d.attivita.forEach(a => {
    if (a.fonte === 'csv') a.fonte = 'garmin';
    delete a.prevista;
  });
  return d;
}

const D = () => dati.dieta || preparaDieta();

const nuovoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ===================== Date e numeri =====================

const oggiISO = () => dataISO(new Date());
const dataLocale = iso => new Date(iso + 'T12:00:00');

function piuGiorni(iso, n) {
  const d = dataLocale(iso);
  d.setDate(d.getDate() + n);
  return dataISO(d);
}

const giorniTra = (a, b) => Math.round((dataLocale(b) - dataLocale(a)) / 86400000);
const lunediDi = iso => piuGiorni(iso, -((dataLocale(iso).getDay() + 6) % 7));
const giornoMostrato = () => statoDieta.data || oggiISO();

function fmtGiorno(iso, lungo = false) {
  return dataLocale(iso).toLocaleDateString('it-IT', lungo
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { weekday: 'short', day: 'numeric', month: 'numeric' });
}

function fmtMinuti(m) {
  m = Math.round(m);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}'` : `${m}'`;
}

const fmtKcal = n => Math.round(n).toLocaleString('it-IT');

function fmtSaldo(n) {
  const r = Math.round(n);
  return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toLocaleString('it-IT');
}

// Nomi confrontabili: minuscole e senza accenti.
const chiave = s => normalizza(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const chiaveVoce = (pasto, voce) => chiave(pasto) + '|' + chiave(voce);

// "1150", "1.150", "1,150", "~1150 kcal" → 1150
function leggiKcal(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/kcal|~|≈|circa/gi, '').trim();
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  return numero(s);
}

// Numero con la virgola o con il punto come decimale.
function leggiDecimale(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '--') return null;
  const ultimo = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  const pulito = ultimo < 0 ? s : s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1);
  const n = Number(pulito);
  return Number.isFinite(n) ? n : null;
}

function dataValida(a, m, g) {
  const d = new Date(a, m - 1, g, 12);
  return d.getMonth() === m - 1 && d.getDate() === g ? dataISO(d) : null;
}

// "2026-10-31", "31/10/2026", "31/10" (anno corrente) → "2026-10-31"
function leggiData(t) {
  const s = String(t ?? '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return dataValida(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/))) {
    let anno = m[3] ? +m[3] : new Date().getFullYear();
    if (anno < 100) anno += 2000;
    return dataValida(anno, +m[2], +m[1]);
  }
  return null;
}

// ===================== Formato della dieta =====================

function giornoSettimanaDa(t) {
  const n = chiave(t);
  return ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'].findIndex(p => n.startsWith(p));
}

// "quantita", oppure "grammi" e "misura" (formato usato anche da altre chat di Claude)
function quantitaDa(v) {
  if (v.quantita != null && v.quantita !== '') return String(v.quantita);
  const g = leggiDecimale(v.grammi);
  const parti = [g ? fmtNum(g) + ' g' : '', v.misura ? String(v.misura) : ''].filter(Boolean);
  return parti.length === 2 ? `${parti[0]} (${parti[1]})` : parti[0] || '';
}

function leggiVoce(vRaw, dove, err, conAlternative = true) {
  const v = vRaw || {};
  if (!v.nome) err.push(`${dove}: manca "nome".`);
  const kcal = leggiKcal(v.kcal);
  if (kcal == null || kcal < 0) err.push(`${dove}: "kcal" deve essere un numero.`);
  const voce = { nome: String(v.nome ?? '').trim(), kcal: Math.round(kcal ?? 0) };
  const q = quantitaDa(v);
  if (q) voce.quantita = q;
  if (conAlternative && Array.isArray(v.alternative) && v.alternative.length) {
    voce.alternative = v.alternative.map((a, k) => leggiVoce(a, `${dove}, alternativa ${k + 1}`, err, false));
  }
  return voce;
}

function leggiPasto(pRaw, dove, err, conAlternative = true) {
  const p = pRaw || {};
  if (!p.nome) err.push(`${dove}: manca "nome".`);
  if (!Array.isArray(p.voci) || !p.voci.length) err.push(`${dove}: serve almeno una voce in "voci".`);
  const pasto = {
    nome: String(p.nome ?? '').trim(),
    voci: (Array.isArray(p.voci) ? p.voci : []).map((v, vi) => leggiVoce(v, `${dove}, voce ${vi + 1}${v?.nome ? ' (' + v.nome + ')' : ''}`, err))
  };
  // Menù alternativi per l'intero pasto ("alternativeIntere" nei piani di altre chat).
  const alternative = p.alternative || p.alternativeIntere;
  if (conAlternative && Array.isArray(alternative) && alternative.length) {
    pasto.alternative = alternative.map((a, k) => leggiPasto(a, `${dove}, alternativa ${k + 1}`, err, false));
  }
  return pasto;
}

function validaDieta(o) {
  const err = [];
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Il contenuto non è un oggetto JSON.');
  if (o.formato !== 'dieta-palestra' && o.formato !== 'dieta') err.push('Il campo "formato" deve essere "dieta-palestra".');
  let giorniRaw = Array.isArray(o.giorni) ? o.giorni : null;
  if (!giorniRaw && Array.isArray(o.pasti)) giorniRaw = [{ nome: 'Tutti i giorni', pasti: o.pasti }];
  if (!giorniRaw || !giorniRaw.length) err.push('Serve almeno una giornata in "giorni" (oppure "pasti" se la dieta è uguale tutti i giorni).');

  const assegnati = new Map();
  const giorni = (giorniRaw || []).map((gRaw, gi) => {
    const g = gRaw || {};
    const dove = `Giornata ${gi + 1}${g.nome ? ' (' + g.nome + ')' : ''}`;
    if (!g.nome) err.push(`${dove}: manca "nome".`);
    const sett = [];
    const giorniSett = g.giorniSettimana ?? g.giornoSettimana;
    if (giorniSett != null && giorniSett !== '') {
      (Array.isArray(giorniSett) ? giorniSett : [giorniSett]).forEach(x => {
        const i = giornoSettimanaDa(x);
        if (i < 0) err.push(`${dove}: giorno della settimana "${x}" non riconosciuto.`);
        else if (assegnati.has(i)) err.push(`${dove}: ${GIORNI_SETTIMANA[i]} è già assegnato a «${assegnati.get(i)}».`);
        else { assegnati.set(i, g.nome); sett.push(i); }
      });
    }
    if (!Array.isArray(g.pasti) || !g.pasti.length) err.push(`${dove}: serve almeno un pasto in "pasti".`);

    const pasti = (Array.isArray(g.pasti) ? g.pasti : [])
      .map((p, pi) => leggiPasto(p, `${dove}, pasto ${pi + 1}${p?.nome ? ' (' + p.nome + ')' : ''}`, err));

    const giornata = { nome: String(g.nome ?? '').trim(), giorniSettimana: sett, pasti };
    if (g.note) giornata.note = String(g.note);
    return giornata;
  });

  // Le giornate senza giorniSettimana coprono i giorni rimasti; senza, devono esserci tutti.
  if (giorni.length && giorni.every(g => g.giorniSettimana.length)) {
    const mancanti = [1, 2, 3, 4, 5, 6, 0].filter(i => !assegnati.has(i)).map(i => GIORNI_SETTIMANA[i]);
    if (mancanti.length) err.push(`Nessuna giornata per: ${mancanti.join(', ')}. Aggiungili a "giorniSettimana" oppure lascia una giornata senza "giorniSettimana", che vale per i giorni rimasti.`);
  }

  if (err.length) {
    const altri = err.length > 8 ? `\n…e altri ${err.length - 8} errori.` : '';
    throw new Error(err.slice(0, 8).join('\n') + altri);
  }

  const piano = {
    formato: 'dieta-palestra',
    versione: 1,
    nome: String(o.nome || 'Dieta'),
    dataInizio: leggiData(o.dataInizio) || oggiISO(),
    note: o.note ? String(o.note) : '',
    giorni
  };

  // Basale e peso, se il file li contiene: vanno nelle impostazioni.
  const imp = o.impostazioni && typeof o.impostazioni === 'object' ? o.impostazioni : {};
  const impostazioni = {};
  const basale = leggiKcal(imp.metabolismoBasale ?? imp.basale);
  if (basale > 0) impostazioni.basale = Math.round(basale);
  const peso = leggiDecimale(imp.pesoKg ?? imp.peso);
  if (peso > 0) impostazioni.peso = peso;
  if (Object.keys(impostazioni).length) piano.impostazioni = impostazioni;
  return piano;
}

const totalePasto = p => p.voci.reduce((n, v) => n + v.kcal, 0);
const totaleGiornata = g => g.pasti.reduce((n, p) => n + totalePasto(p), 0);

// ===================== Calcolo del giorno =====================

function pianoDel(data) {
  const piani = D().piani;
  let scelto = null;
  piani.forEach(p => { if (p.dataInizio <= data && (!scelto || p.dataInizio >= scelto.dataInizio)) scelto = p; });
  // Prima della prima dieta vale la prima: serve per i giorni segnati prima di caricarla.
  return scelto || piani.reduce((a, p) => (!a || p.dataInizio < a.dataInizio ? p : a), null);
}

function giornataDel(data, piano) {
  if (!piano) return null;
  const scelta = D().giorni[data]?.giornata;
  const g = scelta && piano.giorni.find(x => x.nome === scelta);
  if (g) return g;
  const dow = dataLocale(data).getDay();
  return piano.giorni.find(x => x.giorniSettimana.includes(dow)) || piano.giorni.find(x => !x.giorniSettimana.length) || piano.giorni[0];
}

function inizioMonitoraggio() {
  const d = D();
  if (d.impostazioni.inizio) return d.impostazioni.inizio;
  const date = [...d.piani.map(p => p.dataInizio), ...d.sgarri.map(s => s.data)];
  return date.length ? date.reduce((a, b) => (a < b ? a : b)) : oggiISO();
}

// Attività con passi: i loro passi sono già nel totale del giorno di Garmin.
const A_PIEDI = ['camminata', 'corsa', 'escursione'];
const KCAL_PER_PASSO_KG = 0.0005;

const stimaKcalPassi = (passi, peso) => Math.round(passi * KCAL_PER_PASSO_KG * peso);

// Passi del giorno: vale l'ultimo aggiornamento inserito (totale progressivo, come su Garmin).
function passiDel(data) {
  const d = D();
  const voci = [...(d.passi[data] || [])].sort((a, b) => b.registratoIl.localeCompare(a.registratoIl));
  const attuale = voci[0] || null;
  const peso = d.impostazioni.peso;
  let kcal = 0, stimata = false;
  if (attuale?.kcal != null) kcal = attuale.kcal;
  else if (attuale?.passi != null && peso) { kcal = stimaKcalPassi(attuale.passi, peso); stimata = true; }
  // Le calorie di camminate e corse importate sono già contate come attività: si tolgono dai passi.
  const aPiedi = d.attivita.filter(a => a.data === data && a.fonte === 'garmin' && A_PIEDI.includes(a.categoria))
    .reduce((n, a) => n + kcalAttive(a), 0);
  return {
    voci, attuale, kcal, stimata, aPiedi,
    nette: Math.max(0, kcal - aPiedi),
    senzaPeso: !!attuale && attuale.kcal == null && !peso
  };
}

function calcolaGiorno(data) {
  const d = D();
  const rec = d.giorni[data] || {};
  const piano = pianoDel(data);
  const giornata = giornataDel(data, piano);
  const sgarri = d.sgarri.filter(s => s.data === data);
  const sostituiti = new Map();
  sgarri.forEach(s => { if (s.sostituisce) sostituiti.set(chiave(s.sostituisce), s); });
  const saltati = new Set(rec.saltati || []);
  const tolte = new Set(rec.tolte || []);

  const scelte = rec.scelte || {}, menu = rec.menu || {};

  // dieta = con le alternative scelte nel giorno; dietaBase = come scritta nel piano.
  let dieta = 0, dietaBase = 0, tolto = 0;
  const pasti = (giornata?.pasti || []).map(pPiano => {
    const k = chiave(pPiano.nome);
    const alt = menu[k] ? pPiano.alternative?.find(a => chiave(a.nome) === chiave(menu[k])) : null;
    const voci = (alt || pPiano).voci.map(v => {
      const kv = chiaveVoce(pPiano.nome, v.nome);
      const scelta = scelte[kv] ? v.alternative?.find(a => chiave(a.nome) === chiave(scelte[kv])) : null;
      const usata = scelta || v;
      return { nome: usata.nome, quantita: usata.quantita, kcal: usata.kcal, piano: v, scelta: scelta?.nome || '', tolta: tolte.has(kv) };
    });
    const totale = voci.reduce((n, v) => n + v.kcal, 0);
    const base = pPiano.voci.reduce((n, v) => n + v.kcal, 0);
    const sostituitoDa = sostituiti.get(k) || null;
    const saltato = saltati.has(k);
    const meno = saltato || sostituitoDa ? totale : voci.filter(v => v.tolta).reduce((n, v) => n + v.kcal, 0);
    dieta += totale;
    dietaBase += base;
    tolto += meno;
    return { nome: pPiano.nome, totale, base, voci, saltato, sostituitoDa, meno, alternative: pPiano.alternative || null, menu: alt?.nome || '' };
  });
  const nomiPasti = new Set(pasti.map(p => chiave(p.nome)));
  const sostituzioniMancanti = piano ? sgarri.filter(s => s.sostituisce && !nomiPasti.has(chiave(s.sostituisce))) : [];

  const attivita = d.attivita.filter(a => a.data === data)
    .sort((a, b) => (a.ora || '').localeCompare(b.ora || ''))
    .map(a => ({ a, kcal: kcalAttive(a) }));
  const kcalAttivita = attivita.reduce((n, x) => n + x.kcal, 0);
  const kcalSgarri = sgarri.reduce((n, s) => n + s.kcal, 0);
  const passi = passiDel(data);
  const basale = d.impostazioni.basale || 0;

  // Bilancio assoluto: calorie mangiate − calorie consumate.
  const mangiato = dieta - tolto + kcalSgarri;
  const consumato = basale + passi.nette + kcalAttivita;
  return {
    data, piano, giornata, pasti, sgarri, attivita, sostituzioniMancanti, passi,
    saltatiSenzaDieta: piano ? [] : [...saltati],
    dieta, dietaBase, scambi: dieta - dietaBase, tolto, kcalSgarri, kcalAttivita, basale,
    mangiato, consumato,
    bilancio: mangiato - consumato
  };
}

function recGiorno(data) {
  const g = D().giorni;
  g[data] ??= {};
  return g[data];
}

function pulisciGiorno(data) {
  const rec = D().giorni[data];
  if (!rec) return;
  for (const k of ['tolte', 'saltati']) if (rec[k] && !rec[k].length) delete rec[k];
  for (const k of ['scelte', 'menu']) if (rec[k] && !Object.keys(rec[k]).length) delete rec[k];
  if (!Object.keys(rec).length) delete D().giorni[data];
}

function alterna(lista, valore) {
  return lista.includes(valore) ? lista.filter(x => x !== valore) : [...lista, valore];
}

function alternaVoce(pi, vi) {
  const data = giornoMostrato();
  const p = calcolaGiorno(data).pasti[pi];
  const v = p?.voci[vi];
  if (!v) return;
  const rec = recGiorno(data);
  rec.tolte = alterna(rec.tolte || [], chiaveVoce(p.nome, v.piano.nome));
  pulisciGiorno(data);
  salva();
  render();
}

function alternaPasto(pi) {
  const data = giornoMostrato();
  const p = calcolaGiorno(data).pasti[pi];
  if (!p) return;
  const rec = recGiorno(data);
  rec.saltati = alterna(rec.saltati || [], chiave(p.nome));
  pulisciGiorno(data);
  salva();
  render();
}

// ===================== Periodi =====================

function periodo(tipo, rif) {
  const r = dataLocale(rif);
  const y = r.getFullYear(), m = r.getMonth();
  if (tipo === 'giorno') return { da: rif, a: rif };
  if (tipo === 'settimana') { const da = lunediDi(rif); return { da, a: piuGiorni(da, 6) }; }
  if (tipo === 'mese') return { da: dataISO(new Date(y, m, 1, 12)), a: dataISO(new Date(y, m + 1, 0, 12)) };
  if (tipo === 'trimestre') {
    const t = Math.floor(m / 3) * 3;
    return { da: dataISO(new Date(y, t, 1, 12)), a: dataISO(new Date(y, t + 3, 0, 12)) };
  }
  return { da: `${y}-01-01`, a: `${y}-12-31` };
}

function spostaPeriodo(tipo, rif, dir) {
  const r = dataLocale(rif);
  if (tipo === 'giorno') return piuGiorni(rif, dir);
  if (tipo === 'settimana') return piuGiorni(rif, 7 * dir);
  if (tipo === 'mese') return dataISO(new Date(r.getFullYear(), r.getMonth() + dir, 1, 12));
  if (tipo === 'trimestre') return dataISO(new Date(r.getFullYear(), r.getMonth() + 3 * dir, 1, 12));
  return dataISO(new Date(r.getFullYear() + dir, 0, 1, 12));
}

function etichettaPeriodo(tipo, da, a) {
  const f = (iso, o) => dataLocale(iso).toLocaleDateString('it-IT', o);
  if (tipo === 'giorno') return f(da, { weekday: 'long', day: 'numeric', month: 'long' });
  if (tipo === 'settimana') return `${f(da, { day: 'numeric', month: 'short' })} – ${f(a, { day: 'numeric', month: 'short' })}`;
  if (tipo === 'mese') return f(da, { month: 'long', year: 'numeric' });
  if (tipo === 'trimestre') return `${f(da, { month: 'short' })} – ${f(a, { month: 'short', year: 'numeric' })}`;
  return da.slice(0, 4);
}

// Giorni del periodo che entrano nel bilancio: da inizio monitoraggio a oggi.
function giorniContati(da, a) {
  const inizio = inizioMonitoraggio(), oggi = oggiISO();
  const lista = [];
  for (let g = da > inizio ? da : inizio; g <= a && g <= oggi; g = piuGiorni(g, 1)) lista.push(g);
  return lista;
}

function serieBilancio(tipo, da, a) {
  const giorni = giorniContati(da, a).map(calcolaGiorno);
  const secchi = [];
  if (tipo === 'trimestre' || tipo === 'anno') {
    for (let g = lunediDi(da); g <= a; g = piuGiorni(g, 7)) {
      const fine = piuGiorni(g, 6);
      secchi.push({ da: g < da ? da : g, a: fine > a ? a : fine, valore: null, giorni: 0 });
    }
  } else {
    for (let g = da; g <= a; g = piuGiorni(g, 1)) secchi.push({ da: g, a: g, valore: null, giorni: 0 });
  }
  giorni.forEach(c => {
    const s = secchi.find(x => c.data >= x.da && c.data <= x.a);
    s.valore = (s.valore || 0) + c.bilancio;
    s.giorni++;
  });
  let cumulato = 0;
  secchi.forEach(s => { if (s.valore != null) { cumulato += s.valore; s.cumulato = cumulato; } });
  return { secchi, giorni };
}

function riepilogoPeriodo(giorni) {
  const t = { n: giorni.length, dieta: 0, tolto: 0, sgarri: 0, nSgarri: 0, mangiato: 0, basale: 0, passi: 0, attivita: 0, consumato: 0, bilancio: 0 };
  giorni.forEach(c => {
    t.dieta += c.dieta;
    t.tolto += c.tolto;
    t.sgarri += c.kcalSgarri;
    t.nSgarri += c.sgarri.length;
    t.mangiato += c.mangiato;
    t.basale += c.basale;
    t.passi += c.passi.nette;
    t.attivita += c.kcalAttivita;
    t.consumato += c.consumato;
    t.bilancio += c.bilancio;
  });
  return t;
}

// ===================== Sgarri =====================

// Posizione della parentesi che chiude quella in posizione i, saltando le stringhe.
function chiusuraJSON(t, i) {
  let prof = 0, inStringa = false;
  for (let k = i; k < t.length; k++) {
    const c = t[k];
    if (inStringa) {
      if (c === '\\') k++;
      else if (c === '"') inStringa = false;
    } else if (c === '"') inStringa = true;
    else if (c === '{' || c === '[') prof++;
    else if ((c === '}' || c === ']') && --prof === 0) return k;
  }
  return -1;
}

// Tutti i blocchi JSON validi dentro un testo (risposta di Claude con spiegazioni intorno).
function blocchiJSON(testo) {
  const trovati = [];
  for (let i = 0; i < testo.length; i++) {
    if (testo[i] !== '{' && testo[i] !== '[') continue;
    const fine = chiusuraJSON(testo, i);
    if (fine < 0) continue;
    try {
      trovati.push(JSON.parse(testo.slice(i, fine + 1)));
      i = fine;
    } catch (e) { /* non era JSON: si riprova dal carattere dopo */ }
  }
  return trovati;
}

function validaSgarro(v) {
  if (v.tipo && v.tipo !== 'sgarro') throw new Error('"tipo" deve essere "sgarro".');
  const data = v.data ? leggiData(v.data) : oggiISO();
  if (!data) throw new Error(`data "${v.data}" non valida (usa AAAA-MM-GG).`);
  const kcal = leggiKcal(v.kcal);
  if (kcal == null || kcal <= 0) throw new Error('"kcal" deve essere un numero positivo.');
  const descrizione = String(v.descrizione ?? v.nome ?? '').trim();
  if (!descrizione) throw new Error('manca "descrizione".');
  const s = { id: nuovoId(), data, pasto: String(v.pasto ?? '').trim(), descrizione, kcal: Math.round(kcal), fonte: 'claude' };
  const min = leggiKcal(v.kcalMin), max = leggiKcal(v.kcalMax);
  if (min != null && max != null) { s.kcalMin = Math.round(Math.min(min, max)); s.kcalMax = Math.round(Math.max(min, max)); }
  const sost = v.sostituisce === true ? s.pasto : String(v.sostituisce || '').trim();
  if (sost) s.sostituisce = sost;
  return s;
}

function leggiSgarri(testo) {
  const voci = [];
  const raccogli = x => {
    if (Array.isArray(x)) x.forEach(raccogli);
    else if (x && typeof x === 'object') {
      if (Array.isArray(x.sgarri)) x.sgarri.forEach(raccogli);
      else if ('kcal' in x || x.tipo === 'sgarro') voci.push(x);
    }
  };
  let blocchi = blocchiJSON(testo);
  if (!blocchi.length) blocchi = blocchiJSON(testo.replace(/[“”„]/g, '"'));
  blocchi.forEach(raccogli);
  if (!voci.length) throw new Error('Non trovo sgarri nel testo: serve un blocco JSON con almeno "data", "descrizione" e "kcal".');

  const d = D();
  const validi = [], errori = [];
  let doppi = 0;
  voci.forEach((v, k) => {
    try {
      const s = validaSgarro(v);
      const uguale = x => x.data === s.data && x.kcal === s.kcal && chiave(x.descrizione) === chiave(s.descrizione);
      if (d.sgarri.some(uguale) || validi.some(uguale)) doppi++;
      else validi.push(s);
    } catch (e) {
      errori.push(`Sgarro ${k + 1}: ${e.message}`);
    }
  });
  return { validi, errori, doppi };
}

function ordinaSgarri() {
  D().sgarri.sort((a, b) => a.data.localeCompare(b.data));
}

function controllaSgarri() {
  try {
    statoDieta.sgarriInAttesa = leggiSgarri(statoDieta.testoSgarri);
  } catch (e) {
    statoDieta.sgarriInAttesa = { errore: e.message };
  }
  render();
  document.getElementById('anteprima-sgarri')?.scrollIntoView({ block: 'nearest' });
}

function aggiungiSgarri() {
  const p = statoDieta.sgarriInAttesa;
  if (!p?.validi?.length) return;
  D().sgarri.push(...p.validi);
  ordinaSgarri();
  const date = [...new Set(p.validi.map(s => fmtGiorno(s.data)))].join(', ');
  const n = p.validi.length;
  statoDieta.sgarriInAttesa = null;
  statoDieta.testoSgarri = '';
  salva();
  render();
  toast(`${n === 1 ? 'Aggiunto 1 sgarro' : `Aggiunti ${n} sgarri`}: ${date}.`);
}

function apriFormSgarro(id) {
  const s = id && D().sgarri.find(x => x.id === id);
  statoDieta.formSgarro = s
    ? { id: s.id, data: s.data, pasto: s.pasto, descrizione: s.descrizione, kcal: String(s.kcal), intervallo: s.kcalMin != null ? `${s.kcalMin}-${s.kcalMax}` : '', sostituisce: !!s.sostituisce }
    : { id: null, data: statoDieta.sezione === 'giorno' ? giornoMostrato() : oggiISO(), pasto: '', descrizione: '', kcal: '', intervallo: '', sostituisce: false };
  render();
  document.getElementById('form-sgarro')?.scrollIntoView({ block: 'center' });
}

function salvaFormSgarro() {
  const f = statoDieta.formSgarro;
  const err = [];
  const data = leggiData(f.data);
  const kcal = leggiKcal(f.kcal);
  if (!data) err.push('Scegli la data.');
  if (!f.descrizione.trim()) err.push('Scrivi una descrizione.');
  if (kcal == null || kcal <= 0) err.push('Scrivi le kcal (un numero).');
  if (f.sostituisce && !f.pasto) err.push('Per sostituire un pasto scegli quale.');
  let min = null, max = null;
  if (f.intervallo.trim()) {
    const m = f.intervallo.match(/(\d[\d.]*)\s*[-–]\s*(\d[\d.]*)/);
    if (!m) err.push('Intervallo non valido (es. 1000-1300).');
    else { min = leggiKcal(m[1]); max = leggiKcal(m[2]); }
  }
  if (err.length) { toast(err.join('\n'), true); return; }

  const d = D();
  const vecchio = f.id ? d.sgarri.find(s => s.id === f.id) : null;
  const s = { id: f.id || nuovoId(), data, pasto: f.pasto, descrizione: f.descrizione.trim(), kcal: Math.round(kcal), fonte: vecchio?.fonte || 'manuale' };
  if (min != null && max != null) { s.kcalMin = Math.round(Math.min(min, max)); s.kcalMax = Math.round(Math.max(min, max)); }
  if (f.sostituisce) s.sostituisce = f.pasto;
  if (vecchio) d.sgarri[d.sgarri.indexOf(vecchio)] = s;
  else d.sgarri.push(s);
  ordinaSgarri();
  statoDieta.formSgarro = null;
  salva();
  render();
  toast(vecchio ? 'Sgarro modificato.' : `Sgarro aggiunto: ${fmtGiorno(data)}.`);
}

// ===================== Attività =====================

function categoriaDa(testo) {
  const t = chiave(testo);
  return RICONOSCI_TIPO.find(([, re]) => re.test(t))?.[0] || 'altro';
}

function metPer(categoria, velocita) {
  const t = TIPI_ATTIVITA[categoria] || TIPI_ATTIVITA.altro;
  const p = t.velocita;
  if (!velocita || !p) return t.met;
  if (velocita <= p[0][0]) return p[0][1];
  if (velocita >= p[p.length - 1][0]) return p[p.length - 1][1];
  const k = p.findIndex(([v]) => v >= velocita);
  const [v0, m0] = p[k - 1], [v1, m1] = p[k];
  return Math.round((m0 + (m1 - m0) * (velocita - v0) / (v1 - v0)) * 10) / 10;
}

// Calorie attive = (MET − 1) × peso × ore: il −1 toglie il consumo a riposo, già nel basale.
function stimaMET(a) {
  const peso = D().impostazioni.peso;
  const met = a.met ?? metPer(a.categoria, a.velocita);
  const ore = (a.durataMin || 0) / 60;
  return { met, peso, ore, kcal: peso ? Math.max(0, Math.round((met - 1) * peso * ore)) : 0 };
}

// Garmin dà le calorie totali dell'attività, compresa la quota del metabolismo basale:
// kcal attive = Calorie − basale × (durata in ore / 24). La correzione si può disattivare.
function quotaRiposo(a) {
  const imp = D().impostazioni;
  return imp.correzioneBasale && imp.basale ? imp.basale * (a.durataMin || 0) / 60 / 24 : 0;
}

function kcalAttive(a) {
  if (a.kcalAttive != null) return a.kcalAttive;
  if (a.kcalTotali != null) return Math.max(0, Math.round(a.kcalTotali - quotaRiposo(a)));
  return stimaMET(a).kcal;
}

function origineKcal(a) {
  const imp = D().impostazioni;
  if (a.kcalAttive != null) return 'scritte a mano';
  if (a.kcalTotali != null) {
    if (!imp.correzioneBasale) return `${fmtKcal(a.kcalTotali)} di Garmin, senza togliere il basale`;
    if (!imp.basale) return `${fmtKcal(a.kcalTotali)} di Garmin: imposta il basale in ⚙ per togliere la quota a riposo`;
    const ore = Math.round((a.durataMin || 0) / 60 * 100) / 100;
    return `${fmtKcal(a.kcalTotali)} − ${fmtKcal(imp.basale)} × ${fmtNum(ore)} h / 24`;
  }
  const st = stimaMET(a);
  if (!st.peso) return 'stima impossibile: imposta il peso';
  return `stima (MET ${fmtNum(st.met)} − 1) × ${fmtNum(st.peso)} kg × ${fmtNum(Math.round(st.ore * 100) / 100)} h`;
}

function descrAttivita(a) {
  const parti = [];
  if (a.ora) parti.push(a.ora);
  if (a.durataMin) parti.push(fmtMinuti(a.durataMin));
  if (a.distanzaKm) parti.push(fmtNum(Math.round(a.distanzaKm * 100) / 100) + ' km');
  if (a.velocita && TIPI_ATTIVITA[a.categoria]?.velocita) parti.push(fmtNum(a.velocita) + ' km/h');
  if (a.fcMedia) parti.push('FC ' + a.fcMedia);
  parti.push(a.fonte === 'manuale' ? 'a mano' : 'Garmin');
  return parti.join(' · ');
}

const minutiDa = ora => Number(ora.slice(0, 2)) * 60 + Number(ora.slice(3, 5));

// Due attività dello stesso giorno che si sovrappongono nel tempo. Se una non ha l'ora
// di inizio non si può sapere: si considerano sovrapposte se sono dello stesso tipo.
function sovrapposte(a, b) {
  if (a.data !== b.data) return false;
  if (!a.ora || !b.ora) return a.categoria === b.categoria;
  const ia = minutiDa(a.ora), ib = minutiDa(b.ora);
  return ia < ib + Math.max(b.durataMin || 0, 1) && ib < ia + Math.max(a.durataMin || 0, 1);
}

function nuovaAttivitaForm(data) {
  statoDieta.formAttivita = { data: data || oggiISO(), ora: '', categoria: 'camminata', durata: '', velocita: '', kcal: '', met: '' };
}

function testoStima(f) {
  const peso = D().impostazioni.peso;
  const durata = numero(f.durata), vel = numero(f.velocita), kcal = numero(f.kcal);
  const met = numero(f.met) ?? metPer(f.categoria, vel);
  if (kcal != null) return `Userò le ${fmtKcal(kcal)} kcal attive che hai scritto.`;
  if (!peso) return 'Per la stima serve il peso: impostalo in ⚙, oppure scrivi le kcal.';
  if (!durata) return `MET ${fmtNum(met)}: scrivi la durata per la stima.`;
  const stima = Math.max(0, Math.round((met - 1) * peso * durata / 60));
  return `Stima: (MET ${fmtNum(met)} − 1) × ${fmtNum(peso)} kg × ${fmtNum(Math.round(durata / 60 * 100) / 100)} h = <b>${fmtKcal(stima)} kcal attive</b>`;
}

async function salvaFormAttivita() {
  const f = statoDieta.formAttivita;
  const data = leggiData(f.data);
  const durata = numero(f.durata), vel = numero(f.velocita), kcal = numero(f.kcal), met = numero(f.met);
  const err = [];
  if (!data) err.push('Scegli la data.');
  if (!durata || durata <= 0) err.push('Scrivi la durata in minuti.');
  if (kcal != null && kcal < 0) err.push('Le kcal non possono essere negative.');
  if (kcal == null && !D().impostazioni.peso) err.push('Per stimare le kcal serve il peso (in ⚙), oppure scrivi le kcal.');
  if (met != null && met <= 1) err.push('Il MET deve essere maggiore di 1.');
  if (err.length) { toast(err.join('\n'), true); return; }

  const a = { id: nuovoId(), fonte: 'manuale', data, categoria: f.categoria, nome: TIPI_ATTIVITA[f.categoria].nome, durataMin: durata };
  if (/^\d{2}:\d{2}$/.test(f.ora || '')) a.ora = f.ora;
  if (vel) a.velocita = vel;
  if (kcal != null) a.kcalAttive = Math.round(kcal);
  else a.met = met ?? metPer(f.categoria, vel);

  const garmin = D().attivita.find(x => x.fonte !== 'manuale' && sovrapposte(a, x));
  if (garmin && !await chiedi(
    `Si sovrappone a «${garmin.nome}»${garmin.ora ? ' delle ' + garmin.ora : ''} importata da Garmin: aggiungendola, le calorie si sommano.\nAggiungerla comunque?`,
    'Aggiungi')) return;

  D().attivita.push(a);
  statoDieta.formAttivita = null;
  salva();
  render();
  toast(`Attività aggiunta: ${fmtKcal(kcalAttive(a))} kcal attive.`);
}

function aggiornaStimaAttivita() {
  const f = statoDieta.formAttivita;
  const el = document.getElementById('stima-attivita');
  if (!el || !f) return;
  el.innerHTML = testoStima(f);
  const met = document.querySelector('[data-dt="fa.met"]');
  if (met) met.placeholder = fmtNum(metPer(f.categoria, numero(f.velocita)));
}

// ---------- Importa Garmin (Activities.csv di Garmin Connect) ----------
// Il file si legge sul telefono e non si salva: restano solo i dati delle attività.

// CSV con le virgolette: le virgole dentro "…" non separano i campi.
function righeCSV(testo) {
  testo = testo.replace(/^﻿/, '');
  const righe = [];
  let riga = [], campo = '', traVirgolette = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (traVirgolette) {
      if (c !== '"') campo += c;
      else if (testo[i + 1] === '"') { campo += '"'; i++; }
      else traVirgolette = false;
    } else if (c === '"') traVirgolette = true;
    else if (c === ',') { riga.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++;
      riga.push(campo);
      righe.push(riga);
      riga = [];
      campo = '';
    } else campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  return righe.filter(r => r.some(x => x.trim()));
}

// Le colonne si cercano per nome: Garmin può cambiarne l'ordine.
function colonneGarmin(intestazione) {
  const h = intestazione.map(chiave);
  const trova = (...nomi) => h.findIndex(x => nomi.includes(x));
  return {
    tipo: trova('tipo di attivita', 'activity type'),
    data: trova('data', 'date'),
    calorie: trova('calorie', 'calories'),
    durata: trova('tempo', 'time'),
    distanza: trova('distanza', 'distance'),
    fcMedia: trova('fc media', 'avg hr')
  };
}

// Numeri di Garmin: la virgola separa le migliaia ("1,042"), il punto i decimali ("0.86").
function numeroGarmin(s) {
  if (!s) return null;
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// "hh:mm:ss" oppure "hh:mm:ss.d" → minuti
function leggiDurata(t) {
  const s = String(t ?? '').trim();
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/))) return +m[1] * 60 + +m[2] + +m[3] / 60;
  if ((m = s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/))) return +m[1] + +m[2] / 60;
  return null;
}

const CAMPI_GARMIN = ['nome', 'categoria', 'durataMin', 'distanzaKm', 'velocita', 'fcMedia', 'kcalTotali'];

function attivitaDaGarmin(riga, col) {
  const val = i => {
    const v = i >= 0 ? String(riga[i] ?? '').trim() : '';
    return v === '--' ? '' : v;
  };
  const tipo = val(col.tipo);
  const m = val(col.data).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!tipo || !m || !dataValida(+m[1], +m[2], +m[3])) return null;
  const data = `${m[1]}-${m[2]}-${m[3]}`;
  const ora = m[4].padStart(2, '0') + ':' + m[5];
  const dataOra = `${data} ${ora}:${m[6] || '00'}`;
  // Chiave univoca: tipo di attività + data e ora al secondo.
  const a = { id: nuovoId(), fonte: 'garmin', chiaveGarmin: chiave(tipo) + '|' + dataOra, data, ora, dataOra, categoria: categoriaDa(tipo), nome: tipo };
  const durata = leggiDurata(val(col.durata));
  if (durata) a.durataMin = Math.round(durata * 100) / 100;
  const kcal = numeroGarmin(val(col.calorie));
  if (kcal != null) a.kcalTotali = Math.round(kcal);
  const km = numeroGarmin(val(col.distanza));
  if (km) {
    a.distanzaKm = km;
    if (a.durataMin) a.velocita = Math.round(km / (a.durataMin / 60) * 10) / 10;
  }
  const fc = numeroGarmin(val(col.fcMedia));
  if (fc) a.fcMedia = Math.round(fc);
  return a;
}

function importaGarmin(testo) {
  const righe = righeCSV(testo);
  if (righe.length < 2) throw new Error('Il file è vuoto o non è un CSV.');
  const col = colonneGarmin(righe[0]);
  if (col.tipo < 0 || col.data < 0) throw new Error('Non trovo le colonne «Tipo di attività» e «Data»: è il file Activities.csv di Garmin Connect?');

  const d = D(), inizio = inizioMonitoraggio();
  const r = { nuove: 0, presenti: 0, aggiornate: 0, verificare: 0, precedenti: 0, illeggibili: 0 };
  righe.slice(1).forEach(riga => {
    const n = attivitaDaGarmin(riga, col);
    if (!n) { r.illeggibili++; return; }
    if (n.data < inizio) { r.precedenti++; return; }
    if (d.garminScartate.includes(n.chiaveGarmin)) { r.presenti++; return; }

    // Quelle importate con le versioni precedenti non hanno la chiave: si riconoscono da giorno, ora e tipo.
    const esistente = d.attivita.find(a => a.chiaveGarmin === n.chiaveGarmin)
      || d.attivita.find(a => a.fonte === 'garmin' && !a.chiaveGarmin && a.data === n.data && a.ora === n.ora && a.categoria === n.categoria);
    if (esistente) {
      if (esistente.chiaveGarmin && CAMPI_GARMIN.every(k => esistente[k] === n[k])) { r.presenti++; return; }
      CAMPI_GARMIN.forEach(k => { if (n[k] === undefined) delete esistente[k]; else esistente[k] = n[k]; });
      Object.assign(esistente, { chiaveGarmin: n.chiaveGarmin, dataOra: n.dataOra });
      r.aggiornate++;
      return;
    }

    const inAttesa = d.daVerificare.find(x => x.attivita.chiaveGarmin === n.chiaveGarmin);
    if (inAttesa) {
      inAttesa.attivita = { ...n, id: inAttesa.attivita.id };
      r.verificare++;
      return;
    }
    // Sovrapposta a una inserita a mano: non si sommano, decide l'utente.
    const manuale = d.attivita.find(a => a.fonte === 'manuale' && sovrapposte(a, n));
    if (manuale) {
      d.daVerificare.push({ attivita: n, manualeId: manuale.id });
      r.verificare++;
      return;
    }
    d.attivita.push(n);
    r.nuove++;
  });
  return r;
}

function testoRiepilogoGarmin(r) {
  const p = (n, uno, tanti) => `${n} ${n === 1 ? uno : tanti}`;
  return [
    p(r.nuove, 'nuova', 'nuove'),
    p(r.presenti, 'già presente', 'già presenti'),
    p(r.aggiornate, 'aggiornata', 'aggiornate'),
    `${r.verificare} da verificare`
  ].join(', ');
}

function risolviVerifica(i, tieniGarmin) {
  const d = D();
  const v = d.daVerificare[i];
  if (!v) return;
  if (tieniGarmin) {
    d.attivita = d.attivita.filter(a => a.id !== v.manualeId);
    d.attivita.push(v.attivita);
  } else {
    // Scartata: non torna con le prossime importazioni.
    d.garminScartate.push(v.attivita.chiaveGarmin);
  }
  d.daVerificare.splice(i, 1);
  salva();
  render();
  toast(tieniGarmin ? "Tenuta l'attività di Garmin." : 'Tenuta la tua: quella di Garmin non verrà più importata.');
}

// ===================== Grafico del bilancio =====================

function passoTacche(grezzo) {
  const mag = 10 ** Math.floor(Math.log10(grezzo || 1));
  return [1, 2, 2.5, 5, 10].map(f => f * mag).find(p => p >= grezzo);
}

// Barra con l'estremità dei dati arrotondata e la base dritta sullo zero.
function pathBarra(x, w, y0, y1) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const r = Math.min(4, w / 2, h);
  const f = v => +v.toFixed(1);
  const s = y1 < y0 ? 1 : -1;
  return `M${f(x)},${f(y0)} V${f(y1 + s * r)} Q${f(x)},${f(y1)} ${f(x + r)},${f(y1)} H${f(x + w - r)} Q${f(x + w)},${f(y1)} ${f(x + w)},${f(y1 + s * r)} V${f(y0)} Z`;
}

function svgBilancio(secchi, tipo, sel) {
  const pieni = secchi.map((s, i) => ({ s, i })).filter(x => x.s.valore != null);
  if (!pieni.length) return '<p class="vuoto">Nessun giorno conteggiato in questo periodo.</p>';
  const W = 340, H = 220, sx = 48, dx = 8, su = 18, giu = 24;
  const valori = [0, ...pieni.flatMap(x => [x.s.valore, x.s.cumulato])];
  let vMin = Math.min(...valori), vMax = Math.max(...valori);
  if (vMax - vMin < 400) {
    const centro = (vMax + vMin) / 2;
    vMin = Math.min(vMin, centro - 200);
    vMax = Math.max(vMax, centro + 200);
  }
  const passo = passoTacche((vMax - vMin) / 4);
  vMin = Math.floor(vMin / passo) * passo;
  vMax = Math.ceil(vMax / passo) * passo;
  const n = secchi.length, col = (W - sx - dx) / n;
  const y = v => su + (vMax - v) / (vMax - vMin) * (H - su - giu);
  const cx = i => sx + col * (i + 0.5);
  const f = v => v.toFixed(1);

  let griglia = '';
  for (let v = vMin; v <= vMax + passo / 1000; v += passo) {
    griglia += `<line x1="${sx}" x2="${W - dx}" y1="${f(y(v))}" y2="${f(y(v))}" stroke="${Math.abs(v) < passo / 1000 ? '#5b6577' : '#2a3240'}" stroke-width="1"/>
      <text x="${sx - 6}" y="${f(y(v) + 4)}" text-anchor="end" fill="#8b95a7" font-size="11">${fmtSaldo(v)}</text>`;
  }

  let etichette = '';
  secchi.forEach((s, i) => {
    let t = null, anchor = 'middle', x = cx(i);
    if (tipo === 'settimana') t = ['D', 'L', 'M', 'M', 'G', 'V', 'S'][dataLocale(s.da).getDay()];
    else if (tipo === 'mese') {
      const g = Number(s.da.slice(8));
      if (g === 1 || (g % 5 === 0 && g <= 25) || i === n - 1) t = String(g);
    } else if (!i || s.da.slice(5, 7) !== secchi[i - 1].da.slice(5, 7)) {
      t = dataLocale(s.da).toLocaleDateString('it-IT', { month: 'short' });
      anchor = 'start';
      x = sx + col * i;
    }
    if (t) etichette += `<text x="${f(x)}" y="${H - 7}" text-anchor="${anchor}" fill="#8b95a7" font-size="11">${esc(t)}</text>`;
  });

  const larg = Math.min(22, Math.max(2, col - 2));
  let barre = '', zone = '';
  pieni.forEach(({ s, i }) => {
    if (i === sel) zone += `<rect x="${f(sx + col * i)}" y="${su}" width="${f(col)}" height="${H - su - giu}" fill="rgba(232,236,242,.07)" rx="3"/>`;
    const d = pathBarra(cx(i) - larg / 2, larg, y(0), y(s.valore));
    if (d) barre += `<path d="${d}" fill="${s.valore > 0 ? COLORE_SOPRA : COLORE_SOTTO}"/>`;
  });
  const bersagli = pieni.map(({ i }) =>
    `<rect x="${f(sx + col * i)}" y="0" width="${f(col)}" height="${H}" fill="transparent" data-azione="dt-sel" data-i="${i}"/>`).join('');

  const linea = pieni.map(({ s, i }, k) => `${k ? 'L' : 'M'}${f(cx(i))},${f(y(s.cumulato))}`).join(' ');
  const conPunti = n <= 31;
  const punti = pieni.filter((x, k) => conPunti || k === pieni.length - 1)
    .map(({ s, i }) => `<circle cx="${f(cx(i))}" cy="${f(y(s.cumulato))}" r="4" fill="#171b22" stroke="#e8ecf2" stroke-width="2"/>`).join('');
  const ultimo = pieni[pieni.length - 1];
  const xu = cx(ultimo.i), yu = y(ultimo.s.cumulato);
  const ancora = xu > W - 50 ? 'end' : xu < sx + 40 ? 'start' : 'middle';
  const yEtichetta = yu - 10 < su ? yu + 18 : yu - 10;

  return `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo calorico rispetto alla dieta e saldo cumulato">
      ${zone}${griglia}${barre}
      <path d="${linea}" fill="none" stroke="#e8ecf2" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${punti}
      <text x="${f(xu)}" y="${f(yEtichetta)}" text-anchor="${ancora}" fill="#e8ecf2" font-size="12" font-weight="700" stroke="#171b22" stroke-width="3" paint-order="stroke">${fmtSaldo(ultimo.s.cumulato)}</text>
      ${etichette}
      ${bersagli}
    </svg>`;
}

// ===================== Viste =====================

function renderDieta() {
  const s = statoDieta.sezione;
  const viste = { giorno: htmlGiorno, sgarri: htmlSgarri, attivita: htmlAttivita, bilancio: htmlBilancio, impostazioni: htmlImpostazioni };
  contenuto.innerHTML = `
    <div class="segmenti cinque dt-sezioni">
      ${SEZIONI_DIETA.map(([k, t]) => `<button data-azione="dt-sezione" data-s="${k}" class="${k === s ? 'attiva' : ''}"${k === 'impostazioni' ? ' aria-label="Impostazioni della dieta"' : ''}>${t}</button>`).join('')}
    </div>
    ${viste[s]()}`;
}

function statoSaldo(v) {
  const r = Math.round(v);
  const colore = r > 0 ? COLORE_SOPRA : r < 0 ? COLORE_SOTTO : '#5b6577';
  return `<div class="dt-stato"><i style="background:${colore}"></i>${r > 0 ? 'sopra la dieta' : r < 0 ? 'sotto la dieta' : 'in pari con la dieta'}</div>`;
}

function contoGiorno(c) {
  const riga = (t, v, cls = '') => `<span class="${cls}">${t}</span><span class="${cls}">${v}</span>`;
  return `
    <div class="dt-conto">
      ${riga('Dieta prevista', fmtKcal(c.dietaBase))}
      ${c.scambi ? riga('Alternative scelte', fmtSaldo(c.scambi)) : ''}
      ${riga('Voci e pasti tolti', '−' + fmtKcal(c.tolto))}
      ${riga('Sgarri', '+' + fmtKcal(c.kcalSgarri))}
      ${riga('Mangiato (stima)', fmtKcal(c.mangiato), 'totale')}
      ${riga('Obiettivo della dieta', fmtKcal(c.obiettivo))}
      ${riga('Attività extra', '+' + fmtKcal(c.extra))}
      ${riga('Bersaglio', fmtKcal(c.bersaglio), 'totale')}
    </div>`;
}

function rigaSgarro(s, conData, conAzioni = true) {
  const dove = [
    conData ? fmtGiorno(s.data) : '',
    s.pasto || 'fuori pasto',
    s.sostituisce ? 'al posto di: ' + s.sostituisce.toLowerCase() : ''
  ].filter(Boolean).join(' · ');
  return `
    <div class="dt-riga">
      <div>
        <b>+${fmtKcal(s.kcal)} kcal</b>${s.kcalMin != null ? ` <span class="muto piccolo">(${fmtKcal(s.kcalMin)}–${fmtKcal(s.kcalMax)})</span>` : ''}
        <div class="muto piccolo">${esc(dove)}</div>
        <div class="piccolo">${esc(s.descrizione)}</div>
      </div>
      ${conAzioni ? `
      <div class="dt-riga-azioni">
        <button class="btn testo" data-azione="dt-modifica-sgarro" data-id="${esc(s.id)}">Modifica</button>
        <button class="btn testo pericolo" data-azione="dt-elimina-sgarro" data-id="${esc(s.id)}">Elimina</button>
      </div>` : ''}
    </div>`;
}

function rigaAttivita(a, conAzioni) {
  const prevista = attivitaPrevista(a);
  return `
    <div class="dt-riga">
      <div>
        <b>${esc(TIPI_ATTIVITA[a.categoria]?.nome || 'Attività')}</b>${a.fonte !== 'manuale' && a.nome ? ` <span class="muto">${esc(a.nome)}</span>` : ''}
        <div class="muto piccolo">${esc(fmtGiorno(a.data))} · ${esc(descrAttivita(a))}</div>
        <div class="piccolo">${fmtKcal(kcalAttive(a))} kcal attive <span class="muto">· ${esc(origineKcal(a))}</span></div>
        ${conAzioni ? `<div class="piccolo${prevista ? ' muto' : ''}">${prevista ? 'Già prevista dalla dieta: non conta' : 'Conta come attività extra'}</div>` : ''}
      </div>
      ${conAzioni ? `
      <div class="dt-riga-azioni">
        <button class="btn testo" data-azione="dt-prevista" data-id="${esc(a.id)}">${prevista ? 'Conta come extra' : 'Già prevista'}</button>
        <button class="btn testo pericolo" data-azione="dt-elimina-attivita" data-id="${esc(a.id)}">Elimina</button>
      </div>` : ''}
    </div>`;
}

function opzioniPasto(scelto, piano) {
  const nomi = [...PASTI];
  (piano?.giorni || []).forEach(g => g.pasti.forEach(p => { if (!nomi.some(x => chiave(x) === chiave(p.nome))) nomi.push(p.nome); }));
  if (scelto && !nomi.some(x => chiave(x) === chiave(scelto))) nomi.push(scelto);
  return `<option value="">fuori pasto</option>` + nomi.map(x =>
    `<option value="${esc(x)}"${chiave(x) === chiave(scelto) ? ' selected' : ''}>${esc(x)}</option>`).join('');
}

function htmlFormSgarro() {
  const f = statoDieta.formSgarro;
  return `
    <div class="dt-form" id="form-sgarro">
      <h3>${f.id ? 'Modifica sgarro' : 'Nuovo sgarro'}</h3>
      <div class="ed-riga">
        <label class="campo"><span>Data</span><input type="date" data-dt="fs.data" value="${esc(f.data)}"></label>
        <label class="campo"><span>Pasto</span><select data-dt="fs.pasto">${opzioniPasto(f.pasto, pianoDel(f.data))}</select></label>
      </div>
      <label class="campo"><span>Descrizione</span><input data-dt="fs.descrizione" value="${esc(f.descrizione)}" autocomplete="off"></label>
      <div class="ed-riga">
        <label class="campo"><span>kcal (stima)</span><input inputmode="numeric" data-dt="fs.kcal" value="${esc(f.kcal)}" autocomplete="off"></label>
        <label class="campo"><span>Intervallo (facolt.)</span><input data-dt="fs.intervallo" value="${esc(f.intervallo)}" placeholder="1000-1300" autocomplete="off"></label>
      </div>
      <label class="spunta-campo"><input type="checkbox" data-dt="fs.sostituisce"${f.sostituisce ? ' checked' : ''}> Al posto del pasto previsto (ne toglie le kcal)</label>
      <div class="riga-bottoni">
        <button class="btn" data-azione="dt-annulla-sgarro">Annulla</button>
        <button class="btn primario" data-azione="dt-salva-sgarro">Salva</button>
      </div>
    </div>`;
}

function htmlIncollaSgarro() {
  const p = statoDieta.sgarriInAttesa;
  let anteprima = '';
  if (p?.errore) anteprima = `<div class="nota errore-testo">${esc(p.errore)}</div>`;
  else if (p) {
    const n = p.validi.length;
    anteprima = `
      ${p.errori.length ? `<div class="nota errore-testo">${esc(p.errori.join('\n'))}</div>` : ''}
      ${p.validi.map(s => rigaSgarro(s, true, false)).join('')}
      ${p.doppi ? `<p class="muto piccolo">${p.doppi === 1 ? '1 sgarro è già presente e verrà saltato' : p.doppi + ' sgarri sono già presenti e verranno saltati'}.</p>` : ''}
      ${n ? `<div class="riga-bottoni"><button class="btn primario" data-azione="dt-aggiungi-sgarri">${n === 1 ? 'Aggiungi lo sgarro' : `Aggiungi ${n} sgarri`}</button></div>` : ''}`;
  }
  return `
    <section class="card">
      <h3>Incolla sgarro</h3>
      <p class="muto piccolo">Descrivi lo sgarro a Claude e incolla qui la sua risposta (va bene anche il messaggio intero). Accetta anche più sgarri insieme.</p>
      <textarea class="mono" rows="3" data-dt="testo-sgarri" placeholder='{"tipo":"sgarro","data":"…","kcal":…}'>${esc(statoDieta.testoSgarri)}</textarea>
      <div class="riga-bottoni">
        <button class="btn primario" data-azione="dt-controlla-sgarri">Controlla</button>
        <button class="btn" data-azione="dt-nuovo-sgarro">Aggiungi a mano</button>
      </div>
      <div id="anteprima-sgarri">${anteprima}</div>
    </section>`;
}

// ---------- Giorno ----------

function htmlGiorno() {
  const d = D();
  const data = giornoMostrato(), oggi = oggiISO();
  const c = calcolaGiorno(data);
  const contato = data >= inizioMonitoraggio();
  const fermo = p => p.saltato || p.sostituitoDa;

  const pasti = c.piano ? `
    ${c.piano.giorni.length > 1 ? `
      <label class="campo"><span>Giornata della dieta</span>
        <select data-dt="giornata">${c.piano.giorni.map(g => `<option${g === c.giornata ? ' selected' : ''}>${esc(g.nome)}</option>`).join('')}</select>
      </label>` : ''}
    ${c.pasti.map((p, pi) => `
      <section class="card dt-pasto${fermo(p) ? ' saltato' : ''}">
        <div class="dt-pasto-testa">
          <div>
            <h3>${esc(p.nome)}</h3>
            <span class="muto piccolo">${p.meno ? `${fmtKcal(p.totale - p.meno)} di ${fmtKcal(p.totale)} kcal` : `${fmtKcal(p.totale)} kcal`}</span>
          </div>
          ${p.sostituitoDa ? '' : `<button class="btn" data-azione="dt-salta" data-p="${pi}">${p.saltato ? 'Ripristina' : 'Salta'}</button>`}
        </div>
        ${p.sostituitoDa ? `<div class="nota">Al suo posto lo sgarro: ${esc(p.sostituitoDa.descrizione)}</div>` : ''}
        ${p.alternative ? `
          <label class="dt-alt menu"><span>Menù</span>
            <select data-dt="menu" data-p="${pi}"${fermo(p) ? ' disabled' : ''}>
              <option value="">come da piano · ${fmtKcal(p.base)} kcal</option>
              ${p.alternative.map(a => `<option value="${esc(a.nome)}"${a.nome === p.menu ? ' selected' : ''}>${esc(a.nome)} · ${fmtKcal(totalePasto(a))} kcal</option>`).join('')}
            </select>
          </label>` : ''}
        <ul class="dt-voci">
          ${p.voci.map((v, vi) => `
            <li><button class="dt-voce${v.tolta || fermo(p) ? ' tolta' : ''}" data-azione="dt-voce" data-p="${pi}" data-v="${vi}"${fermo(p) ? ' disabled' : ''}>
              <span>${esc(v.nome)}${v.quantita ? ` <span class="muto">${esc(v.quantita)}</span>` : ''}</span>
              <span class="kcal">${fmtKcal(v.kcal)}</span>
            </button>
            ${v.piano.alternative ? `
              <label class="dt-alt"><span>⇄</span>
                <select data-dt="scelta" data-p="${pi}" data-v="${vi}"${v.tolta || fermo(p) ? ' disabled' : ''} aria-label="Alternative a ${esc(v.piano.nome)}">
                  <option value="">come da piano${v.scelta ? `: ${esc(v.piano.nome)} · ${fmtKcal(v.piano.kcal)} kcal` : ` · ${v.piano.alternative.length} ${v.piano.alternative.length === 1 ? 'alternativa' : 'alternative'}`}</option>
                  ${v.piano.alternative.map(a => `<option value="${esc(a.nome)}"${a.nome === v.scelta ? ' selected' : ''}>${esc(a.nome)}${a.quantita ? ' ' + esc(a.quantita) : ''} · ${fmtKcal(a.kcal)} kcal</option>`).join('')}
                </select>
              </label>` : ''}
            </li>`).join('')}
        </ul>
      </section>`).join('')}
    ${c.sostituzioniMancanti.map(s => `<div class="nota">Lo sgarro «${esc(s.descrizione)}» sostituisce «${esc(s.sostituisce)}», che non c'è nella dieta: se serve, segna tu il pasto come saltato.</div>`).join('')}
    <p class="muto piccolo">La dieta conta come seguita: tocca una voce che non hai mangiato per toglierla, oppure «Salta» per un pasto intero.</p>`
    : `
    <section class="card">
      <h3>Nessuna dieta caricata</h3>
      <p class="muto piccolo">Caricala da ⚙: finché manca, il saldo conta solo sgarri e attività.${c.saltatiSenzaDieta.length ? ` Per questo giorno hai già segnato come saltato: ${esc(c.saltatiSenzaDieta.join(', '))}.` : ''}</p>
      <div class="riga-bottoni"><button class="btn primario" data-azione="dt-vai-impostazioni">Carica la dieta</button></div>
    </section>`;

  return `
    <div class="dt-naviga">
      <button class="btn" data-azione="dt-giorno-sposta" data-d="-1" aria-label="Giorno precedente">‹</button>
      <div>
        <b>${esc(fmtGiorno(data, true))}</b>
        ${data === oggi ? '<span class="muto piccolo">oggi</span>' : '<button class="btn testo piccolo" data-azione="dt-oggi">torna a oggi</button>'}
      </div>
      <button class="btn" data-azione="dt-giorno-sposta" data-d="1" aria-label="Giorno successivo"${data >= oggi ? ' disabled' : ''}>›</button>
    </div>

    <section class="card dt-saldo">
      <div class="etichetta">Saldo del giorno</div>
      <div class="dt-numero">${fmtSaldo(c.bilancio)} <span class="piccolo muto">kcal</span></div>
      ${statoSaldo(c.bilancio)}
      ${contoGiorno(c)}
      ${contato ? '' : `<div class="nota">Questo giorno viene prima dell'inizio del monitoraggio (${esc(fmtGiorno(inizioMonitoraggio()))}): non entra nel bilancio.</div>`}
    </section>

    ${pasti}

    <section class="card">
      <h3>Sgarri${c.kcalSgarri ? ` <span class="muto">+${fmtKcal(c.kcalSgarri)} kcal</span>` : ''}</h3>
      ${c.sgarri.length ? c.sgarri.map(s => rigaSgarro(s, false)).join('') : '<p class="muto piccolo">Nessuno sgarro in questo giorno.</p>'}
      ${statoDieta.formSgarro ? htmlFormSgarro() : ''}
    </section>
    ${htmlIncollaSgarro()}

    <section class="card">
      <h3>Attività${c.extra ? ` <span class="muto">extra ${fmtKcal(c.extra)} kcal</span>` : ''}</h3>
      ${c.attivita.length ? c.attivita.map(x => rigaAttivita(x.a, true)).join('') : '<p class="muto piccolo">Nessuna attività registrata.</p>'}
      ${d.impostazioni.attivitaPrevistaKcal && c.kcalAttivita ? `<p class="muto piccolo">Le prime ${fmtKcal(d.impostazioni.attivitaPrevistaKcal)} kcal di attività del giorno sono già previste dalla dieta.</p>` : ''}
      ${d.daVerificare.length ? `<div class="nota">Ci sono attività di Garmin da verificare: <button class="btn testo" data-azione="dt-sezione" data-s="attivita">vai ad Attività</button></div>` : ''}
      <div class="riga-bottoni">
        ${BOTTONE_GARMIN()}
        <button class="btn" data-azione="dt-nuova-attivita" data-data="${data}">+ A mano</button>
      </div>
    </section>`;
}

// ---------- Sgarri ----------

function htmlSgarri() {
  const lista = [...D().sgarri].reverse();
  const totale = lista.reduce((n, s) => n + s.kcal, 0);
  return `
    ${htmlIncollaSgarro()}
    ${statoDieta.formSgarro ? `<section class="card">${htmlFormSgarro()}</section>` : ''}
    <h3 class="sezione">Tutti gli sgarri (${lista.length})${lista.length ? ' · +' + fmtKcal(totale) + ' kcal' : ''}</h3>
    <section class="card">
      ${lista.length ? lista.map(s => rigaSgarro(s, true)).join('') : '<p class="muto piccolo">Nessuno sgarro registrato.</p>'}
    </section>`;
}

// ---------- Attività ----------

function htmlFormAttivita() {
  const f = statoDieta.formAttivita;
  const tipo = TIPI_ATTIVITA[f.categoria];
  const metAuto = metPer(f.categoria, numero(f.velocita));
  return `
    <section class="card" id="form-attivita">
      <h3>Nuova attività</h3>
      <div class="ed-riga">
        <label class="campo"><span>Data</span><input type="date" data-dt="fa.data" value="${esc(f.data)}" max="${oggiISO()}"></label>
        <label class="campo"><span>Ora di inizio</span><input type="time" data-dt="fa.ora" value="${esc(f.ora)}"></label>
      </div>
      <label class="campo"><span>Tipo</span>
        <select data-dt="fa.categoria">${Object.entries(TIPI_ATTIVITA).map(([k, t]) => `<option value="${k}"${k === f.categoria ? ' selected' : ''}>${t.nome}</option>`).join('')}</select>
      </label>
      <div class="ed-riga">
        <label class="campo"><span>Durata (minuti)</span><input inputmode="numeric" data-dt="fa.durata" value="${esc(f.durata)}" autocomplete="off"></label>
        ${tipo.velocita
          ? `<label class="campo"><span>Velocità (km/h)</span><input inputmode="decimal" data-dt="fa.velocita" value="${esc(f.velocita)}" placeholder="facoltativa" autocomplete="off"></label>`
          : '<span></span>'}
      </div>
      <div class="ed-riga">
        <label class="campo"><span>kcal attive</span><input inputmode="numeric" data-dt="fa.kcal" value="${esc(f.kcal)}" placeholder="stima automatica" autocomplete="off"></label>
        <label class="campo"><span>MET</span><input inputmode="decimal" data-dt="fa.met" value="${esc(f.met)}" placeholder="${esc(fmtNum(metAuto))}" autocomplete="off"></label>
      </div>
      <div class="nota" id="stima-attivita">${testoStima(f)}</div>
      <p class="muto piccolo">Formula: kcal attive = (MET − 1) × peso (kg) × ore. Il −1 toglie il consumo a riposo, che è già nel metabolismo basale. MET di riferimento: camminata 6 km/h ≈ 4,7 · corsa 8 km/h ≈ 8,3 · bici moderata ≈ 6,8 · pesi ≈ 5.
      L'ora di inizio è facoltativa e serve a riconoscerla se poi arriva anche da Garmin.</p>
      <div class="riga-bottoni">
        <button class="btn" data-azione="dt-annulla-attivita">Annulla</button>
        <button class="btn primario" data-azione="dt-salva-attivita">Salva</button>
      </div>
    </section>`;
}

// Pulsante che apre la scelta del file: il file resta sul telefono, si leggono solo i dati.
const BOTTONE_GARMIN = (classe = 'btn') =>
  `<label class="${classe}">Importa Garmin<input type="file" accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel,text/plain" data-dt="file-csv" hidden></label>`;

function htmlDaVerificare() {
  const d = D();
  if (!d.daVerificare.length) return '';
  const blocco = (etichetta, a) => a
    ? `<div><span class="etichetta">${etichetta}</span> <b>${esc(a.nome || TIPI_ATTIVITA[a.categoria]?.nome || 'Attività')}</b>
         <div class="muto piccolo">${esc(fmtGiorno(a.data))} · ${esc(descrAttivita(a))}</div>
         <div class="piccolo">${fmtKcal(kcalAttive(a))} kcal attive</div></div>`
    : `<div><span class="etichetta">${etichetta}</span> <span class="muto piccolo">eliminata nel frattempo</span></div>`;
  return `
    <section class="card dt-verifica">
      <h3>Da verificare (${d.daVerificare.length})</h3>
      <p class="muto piccolo">Queste attività di Garmin si sovrappongono a una che hai inserito a mano. Scegli quale tenere, così le calorie non si sommano.</p>
      ${d.daVerificare.map((v, i) => `
        <div class="dt-confronto">
          ${blocco('Garmin', v.attivita)}
          ${blocco('A mano', d.attivita.find(a => a.id === v.manualeId))}
          <div class="riga-bottoni">
            <button class="btn" data-azione="dt-tieni-manuale" data-i="${i}">Tieni la mia</button>
            <button class="btn primario" data-azione="dt-tieni-garmin" data-i="${i}">Tieni Garmin</button>
          </div>
        </div>`).join('')}
    </section>`;
}

function htmlAttivita() {
  const d = D(), u = statoDieta.ultimoImport;
  const lista = [...d.attivita].sort((a, b) => (b.data + (b.ora || '')).localeCompare(a.data + (a.ora || '')));
  const mostrate = statoDieta.tutteAttivita ? lista : lista.slice(0, 30);
  const altro = u ? [
    u.precedenti ? `${u.precedenti} prima dell'inizio del monitoraggio, ignorate` : '',
    u.illeggibili ? `${u.illeggibili} righe illeggibili` : ''
  ].filter(Boolean).join(', ') : '';
  return `
    <section class="card">
      <h3>Importa Garmin</h3>
      <p class="muto piccolo">Su Garmin Connect: Attività → Tutte le attività → Esporta CSV. Poi tocca «Importa Garmin» e scegli il file Activities.csv. Puoi importarlo tutte le volte che vuoi: le attività già presenti vengono saltate, quelle cambiate aggiornate.</p>
      <div class="riga-bottoni">${BOTTONE_GARMIN('btn primario')}</div>
      ${u ? `<div class="nota">Ultima importazione: ${esc(testoRiepilogoGarmin(u))}.${altro ? `<br><span class="muto">${esc(altro)}.</span>` : ''}</div>` : ''}
    </section>

    ${htmlDaVerificare()}

    ${statoDieta.formAttivita ? htmlFormAttivita() : `<button class="btn largo" data-azione="dt-nuova-attivita" style="margin-bottom:12px">+ Aggiungi attività a mano</button>`}

    <h3 class="sezione">Attività (${lista.length})</h3>
    <section class="card">
      ${mostrate.length ? mostrate.map(a => rigaAttivita(a, true)).join('') : '<p class="muto piccolo">Nessuna attività registrata.</p>'}
      ${lista.length > mostrate.length ? `<div class="riga-bottoni"><button class="btn" data-azione="dt-tutte-attivita">Mostra tutte (${lista.length})</button></div>` : ''}
    </section>
    <p class="muto piccolo">Si usano le calorie attive. ${d.impostazioni.correzioneBasale
      ? 'Dalle calorie di Garmin si toglie la quota del basale: kcal attive = Calorie − basale × (durata in ore / 24).'
      : 'La correzione del basale sulle calorie di Garmin è disattivata (⚙).'} Le attività senza calorie si stimano con i MET.</p>`;
}

// ---------- Bilancio ----------

function dettagliBrevi(c) {
  return [
    c.scambi ? `alternative ${fmtSaldo(c.scambi)}` : '',
    c.kcalSgarri ? `sgarri +${fmtKcal(c.kcalSgarri)}` : '',
    c.tolto ? `tolte −${fmtKcal(c.tolto)}` : '',
    c.extra ? `attività −${fmtKcal(c.extra)}` : ''
  ].filter(Boolean).join(' · ') || 'dieta seguita';
}

function htmlRiepilogo(t, tipo, a) {
  if (!t.n) return '<p class="muto piccolo">Nessun giorno conteggiato nel periodo.</p>';
  const riga = (x, v, cls = '') => `<span class="${cls}">${x}</span><span class="${cls}">${v}</span>`;
  const oggi = oggiISO();
  let consiglio = '';
  if (tipo === 'settimana' && a >= oggi) {
    const rimasti = giorniTra(oggi, a);
    if (t.bilancio > 0 && rimasti > 0) {
      consiglio = `<div class="nota">Per chiudere la settimana in pari: circa −${fmtKcal(t.bilancio / rimasti)} kcal al giorno nei prossimi ${rimasti === 1 ? 'giorno' : rimasti + ' giorni'}, tra cibo e attività.</div>`;
    } else if (t.bilancio <= 0) {
      consiglio = '<div class="nota">Settimana in linea con la dieta.</div>';
    }
  }
  return `
    <div class="dt-conto">
      ${riga('Giorni conteggiati', String(t.n))}
      ${riga(`Sgarri (${t.nSgarri})`, '+' + fmtKcal(t.sgarri))}
      ${riga('Voci e pasti tolti', '−' + fmtKcal(t.tolto))}
      ${riga('Attività extra', '−' + fmtKcal(t.extra))}
      ${Math.round(t.scarto) ? riga("Dieta rispetto all'obiettivo", fmtSaldo(t.scarto)) : ''}
      ${riga('Saldo netto', fmtSaldo(t.bilancio) + ' kcal', 'totale')}
      ${riga('Media al giorno', fmtSaldo(t.bilancio / t.n))}
    </div>
    ${t.attivita > t.extra ? `<p class="muto piccolo">Attività non prevista dalla dieta: ${fmtKcal(t.attivita)} kcal; ${fmtKcal(t.attivita - t.extra)} rientrano nella quota già prevista.</p>` : ''}
    ${consiglio}`;
}

function intervalloExport(v) {
  const oggi = oggiISO();
  if (v === 'settimana') return { da: lunediDi(oggi), a: oggi };
  if (v === 'mese') return { da: oggi.slice(0, 8) + '01', a: oggi };
  return { da: piuGiorni(oggi, -(Number(v) - 1)), a: oggi };
}

function htmlBilancio() {
  const tipo = statoDieta.periodo, oggi = oggiISO();
  const rif = statoDieta.rif || oggi;
  const { da, a } = periodo(tipo, rif);
  const prossimo = periodo(tipo, spostaPeriodo(tipo, rif, 1)).da;
  const { secchi, giorni } = serieBilancio(tipo, da, a);
  const t = riepilogoPeriodo(giorni);
  const perSettimana = tipo === 'trimestre' || tipo === 'anno';
  let sel = statoDieta.sel;
  if (sel == null || secchi[sel]?.valore == null) sel = secchi.map(s => s.valore != null).lastIndexOf(true);

  let grafico;
  if (tipo === 'giorno') {
    grafico = giorni.length ? `
      <div class="etichetta">Saldo del giorno</div>
      <div class="dt-numero">${fmtSaldo(giorni[0].bilancio)} <span class="piccolo muto">kcal</span></div>
      ${statoSaldo(giorni[0].bilancio)}
      ${contoGiorno(giorni[0])}
      <div class="riga-bottoni"><button class="btn" data-azione="dt-apri-giorno" data-data="${da}">Apri il giorno</button></div>`
      : '<p class="vuoto">Questo giorno non entra nel bilancio.</p>';
  } else {
    const s = secchi[sel];
    grafico = `
      <h3>Saldo ${perSettimana ? 'per settimana' : 'per giorno'}</h3>
      <div class="grafico">${svgBilancio(secchi, tipo, sel)}</div>
      <div class="legenda">
        <span><i style="background:${COLORE_SOPRA}"></i>sopra la dieta</span>
        <span><i style="background:${COLORE_SOTTO}"></i>sotto la dieta</span>
        <span><i class="linea"></i>saldo cumulato</span>
      </div>
      ${s ? `
      <div class="dt-selezione">
        <span>${esc(perSettimana ? `Settimana ${fmtGiorno(s.da)} – ${fmtGiorno(s.a)}` : fmtGiorno(s.da, true))}:
          <b>${fmtSaldo(s.valore)}</b> · cumulato ${fmtSaldo(s.cumulato)}</span>
        <button class="btn testo" data-azione="${perSettimana ? 'dt-apri-settimana' : 'dt-apri-giorno'}" data-data="${s.da}">Apri</button>
      </div>` : ''}`;
  }

  const elenco = perSettimana
    ? secchi.filter(s => s.valore != null).reverse().map(s => `
        <button class="dt-giorno-riga" data-azione="dt-apri-settimana" data-data="${s.da}">
          <span>${esc(fmtGiorno(s.da))} – ${esc(fmtGiorno(s.a))}<span class="muto piccolo">${s.giorni} giorni</span></span>
          <b>${fmtSaldo(s.valore)}</b>
        </button>`).join('')
    : [...giorni].reverse().map(c => `
        <button class="dt-giorno-riga" data-azione="dt-apri-giorno" data-data="${c.data}">
          <span>${esc(fmtGiorno(c.data))}<span class="muto piccolo">${esc(dettagliBrevi(c))}</span></span>
          <b>${fmtSaldo(c.bilancio)}</b>
        </button>`).join('');

  return `
    <div class="segmenti cinque">
      ${PERIODI.map(([k, x]) => `<button data-azione="dt-periodo" data-p="${k}" class="${k === tipo ? 'attiva' : ''}">${x}</button>`).join('')}
    </div>
    <div class="dt-naviga">
      <button class="btn" data-azione="dt-periodo-sposta" data-d="-1" aria-label="Periodo precedente">‹</button>
      <div><b>${esc(etichettaPeriodo(tipo, da, a))}</b></div>
      <button class="btn" data-azione="dt-periodo-sposta" data-d="1" aria-label="Periodo successivo"${prossimo > oggi ? ' disabled' : ''}>›</button>
    </div>

    <section class="card">${grafico}</section>

    <section class="card">
      <h3>Riepilogo</h3>
      ${htmlRiepilogo(t, tipo, a)}
    </section>

    ${tipo !== 'giorno' && elenco ? `
      <h3 class="sezione">${perSettimana ? 'Settimana per settimana' : 'Giorno per giorno'}</h3>
      <section class="card dt-elenco">${elenco}</section>` : ''}

    <section class="card">
      <h3>Esporta per Claude</h3>
      <p class="muto piccolo">Testo con dieta, voci tolte, sgarri, attività e saldi. Incollalo nella chat di Claude e chiedi come bilanciare la settimana: in fondo ci sono già i formati per rispondere.</p>
      <label class="campo">
        <span>Periodo</span>
        <select data-dt="export-periodo">
          ${PERIODI_EXPORT.map(([v, x]) => `<option value="${v}"${v === statoDieta.exportPeriodo ? ' selected' : ''}>${x}</option>`).join('')}
        </select>
      </label>
      <label class="spunta-campo"><input type="checkbox" data-dt="export-allenamenti"${statoDieta.exportAllenamenti ? ' checked' : ''}> Includi gli allenamenti del periodo</label>
      <textarea id="testo-export-dieta" class="mono" rows="8" readonly>${esc(testoExportDieta())}</textarea>
      <div class="riga-bottoni">
        <button class="btn primario" data-azione="dt-copia-export">Copia</button>
        ${navigator.share ? '<button class="btn" data-azione="dt-condividi-export">Condividi</button>' : ''}
      </div>
    </section>`;
}

// ---------- Impostazioni ----------

function htmlPiano(p) {
  const tutti = p.giorni.every(g => !g.giorniSettimana.length);
  return `
    <b>${esc(p.nome)}</b> · in uso da ${esc(fmtGiorno(p.dataInizio, true))}${p.obiettivoKcal ? ` · obiettivo ${fmtKcal(p.obiettivoKcal)} kcal` : ''}
    <ul class="dt-piano">
      ${p.giorni.map(g => {
        const quando = g.giorniSettimana.length ? g.giorniSettimana.map(i => GIORNI_BREVI[i]).join(', ') : tutti ? 'tutti i giorni' : 'altri giorni';
        const ob = g.obiettivoKcal ?? p.obiettivoKcal;
        return `<li>${esc(g.nome)} <span class="muto">(${quando})</span>: ${fmtKcal(totaleGiornata(g))} kcal in ${g.pasti.length} pasti${ob ? `, obiettivo ${fmtKcal(ob)}` : ''}</li>`;
      }).join('')}
    </ul>
    ${p.attivitaInclusa ? `<div class="muto piccolo">Attività già prevista: ${esc(p.attivitaInclusa)}</div>` : ''}`;
}

function htmlImpostazioni() {
  const d = D(), imp = d.impostazioni;
  const piano = d.piani.length ? pianoDel(oggiISO()) : null;
  const attesa = statoDieta.dietaInAttesa;
  let anteprima = '';
  if (attesa?.errore) anteprima = `<div class="nota errore-testo">${esc(attesa.errore)}</div>`;
  else if (attesa) {
    const ip = attesa.piano.impostazioni;
    const daImpostare = ip ? [
      ip.basale ? `basale ${fmtKcal(ip.basale)} kcal` : '',
      ip.peso ? `peso ${fmtNum(ip.peso)} kg` : '',
      ip.attivitaPrevistaKcal != null ? `attività già prevista ${fmtKcal(ip.attivitaPrevistaKcal)} kcal/giorno` : ''
    ].filter(Boolean).join(', ') : '';
    anteprima = `
      <div class="nota">${htmlPiano(attesa.piano)}</div>
      ${daImpostare ? `<p class="muto piccolo">Imposta anche: ${daImpostare}.</p>` : ''}
      ${d.piani.length ? '' : '<p class="muto piccolo">È la prima dieta: vale anche per i giorni già segnati prima della data di inizio.</p>'}
      ${d.piani.some(p => p.dataInizio === attesa.piano.dataInizio) ? '<p class="muto piccolo">Sostituisce la dieta che inizia nello stesso giorno.</p>' : ''}
      <div class="riga-bottoni"><button class="btn primario" data-azione="dt-usa-dieta">Usa questa dieta</button></div>`;
  }

  return `
    <section class="card">
      <h3>Dieta di riferimento</h3>
      ${piano ? `<div class="piccolo">${htmlPiano(piano)}</div>` : '<p class="muto piccolo">Nessuna dieta caricata.</p>'}
      <p class="muto piccolo">Incolla il JSON della dieta preparato da Claude (va bene anche il messaggio intero) oppure scegli un file .json. Il formato è descritto in FORMATO-DIETA.md.</p>
      <textarea class="mono" rows="4" data-dt="testo-dieta" placeholder='{ "formato": "dieta-palestra", … }'>${esc(statoDieta.testoDieta)}</textarea>
      <div class="riga-bottoni">
        <button class="btn primario" data-azione="dt-controlla-dieta">Controlla</button>
        <label class="btn">Scegli file<input type="file" accept=".json,application/json,text/plain" data-dt="file-dieta" hidden></label>
      </div>
      <div id="anteprima-dieta">${anteprima}</div>
      ${d.piani.length > 1 ? `<p class="muto piccolo">Diete caricate: ${d.piani.length}. Ogni giorno usa quella in vigore in quella data.</p>` : ''}
    </section>

    <section class="card">
      <h3>Consumo calorico</h3>
      <div class="ed-riga">
        <label class="campo"><span>Basale BIA (kcal/giorno)</span><input inputmode="numeric" data-dt="imp.basale" value="${esc(imp.basale ?? '')}" autocomplete="off"></label>
        <label class="campo"><span>Peso (kg)</span><input inputmode="decimal" data-dt="imp.peso" value="${esc(fmtNum(imp.peso))}" autocomplete="off"></label>
      </div>
      <p class="muto piccolo">Il peso serve alle stime con i MET.</p>
      <label class="spunta-campo"><input type="checkbox" data-dt="imp.correzioneBasale"${imp.correzioneBasale ? ' checked' : ''}> Togli il basale dalle calorie di Garmin</label>
      <p class="muto piccolo">Le calorie di Garmin di solito comprendono anche il metabolismo basale, già contato nella dieta. Con la correzione:
      kcal attive = Calorie − basale × (durata in ore / 24).
      Esempio: 30 minuti da 300 kcal con basale ${fmtKcal(imp.basale || 2040)} → 300 − ${fmtKcal((imp.basale || 2040) * 0.5 / 24)} = ${fmtKcal(300 - (imp.basale || 2040) * 0.5 / 24)} kcal attive.</p>
      <p class="muto piccolo" style="margin-bottom:0">Attività già prevista dalla dieta (non conta come extra):</p>
      <div class="dt-tipi">
        ${Object.entries(TIPI_ATTIVITA).map(([k, t]) => `<label class="spunta-campo"><input type="checkbox" data-dt="imp.tipo" data-tipo="${k}"${imp.tipiPrevisti.includes(k) ? ' checked' : ''}> ${t.nome}</label>`).join('')}
      </div>
      <label class="campo"><span>Altre kcal di attività al giorno già previste</span><input inputmode="numeric" data-dt="imp.attivitaPrevistaKcal" value="${esc(imp.attivitaPrevistaKcal || '')}" placeholder="0" autocomplete="off"></label>
      <label class="campo"><span>Inizio del monitoraggio</span><input type="date" data-dt="imp.inizio" value="${esc(imp.inizio || '')}"></label>
      <p class="muto piccolo">Vuoto = dal primo giorno con dati (ora: ${esc(fmtGiorno(inizioMonitoraggio(), true))}). Saldo = (dieta − voci tolte + sgarri) − (obiettivo + attività extra).</p>
    </section>`;
}

function controllaDieta(testo) {
  try {
    statoDieta.dietaInAttesa = { piano: validaDieta(estraiJSON(testo || '')) };
  } catch (e) {
    statoDieta.dietaInAttesa = { errore: e.message };
  }
  render();
  document.getElementById('anteprima-dieta')?.scrollIntoView({ block: 'nearest' });
}

function usaDieta() {
  const p = statoDieta.dietaInAttesa?.piano;
  if (!p) return;
  const d = D();
  const { impostazioni, ...piano } = p;
  if (impostazioni) Object.assign(d.impostazioni, impostazioni);
  d.piani = d.piani.filter(x => x.dataInizio !== p.dataInizio);
  d.piani.push({ ...piano, id: nuovoId(), importataIl: new Date().toISOString() });
  d.piani.sort((a, b) => a.dataInizio.localeCompare(b.dataInizio));
  statoDieta.dietaInAttesa = null;
  statoDieta.testoDieta = '';
  statoDieta.sezione = 'giorno';
  salva();
  render();
  window.scrollTo(0, 0);
  toast('Dieta caricata.');
}

// ===================== Esporta per Claude =====================

// JSON leggibile ma corto: gli oggetti piccoli stanno su una riga sola.
function jsonCompatto(v, rientro = '') {
  const riga = JSON.stringify(v);
  if (!v || typeof v !== 'object' || riga.length < 160) return riga;
  const dentro = rientro + '  ';
  const voci = Array.isArray(v)
    ? v.map(x => dentro + jsonCompatto(x, dentro))
    : Object.entries(v).map(([k, x]) => dentro + JSON.stringify(k) + ': ' + jsonCompatto(x, dentro));
  const [apre, chiude] = Array.isArray(v) ? ['[', ']'] : ['{', '}'];
  return `${apre}\n${voci.join(',\n')}\n${rientro}${chiude}`;
}

function testoExportDieta() {
  const { da, a } = intervalloExport(statoDieta.exportPeriodo);
  return testoDietaPerClaude(da, a, statoDieta.exportAllenamenti);
}

function testoDietaPerClaude(da, a, conAllenamenti) {
  const d = D(), imp = d.impostazioni;
  const giorni = giorniContati(da, a).map(calcolaGiorno);
  const r = [];
  r.push(`DATI DELLA DIETA (esportati dall'app Scheda Palestra, ${fmtDataLunga(new Date())})`);
  r.push(`Periodo: da ${fmtGiorno(da, true)} a ${fmtGiorno(a, true)} – ${giorni.length} giorni conteggiati (monitoraggio iniziato ${fmtGiorno(inizioMonitoraggio(), true)})`);

  r.push('');
  r.push('== PARAMETRI ==');
  const piano = pianoDel(a);
  if (piano) {
    r.push(`Dieta: ${piano.nome} (in uso dal ${piano.dataInizio})${piano.obiettivoKcal ? `, obiettivo ${piano.obiettivoKcal} kcal/giorno` : ''}`);
    if (piano.attivitaInclusa) r.push(`Attività già considerata dalla dieta: ${piano.attivitaInclusa}`);
  } else {
    r.push('Dieta: nessuna dieta caricata (il saldo considera solo sgarri e attività).');
  }
  r.push(`Metabolismo basale (BIA): ${imp.basale ? imp.basale + ' kcal/giorno' : 'non impostato'} · Peso: ${imp.peso ? fmtNum(imp.peso) + ' kg' : 'non impostato'}`);
  const tipi = imp.tipiPrevisti.map(k => TIPI_ATTIVITA[k]?.nome).filter(Boolean);
  r.push(`Attività già prevista nelle impostazioni: ${tipi.length ? tipi.join(', ') : 'nessun tipo'}${imp.attivitaPrevistaKcal ? ` + ${imp.attivitaPrevistaKcal} kcal/giorno` : ''}; conta solo l'attività in più.`);
  r.push('Saldo del giorno = (kcal della dieta − voci tolte + sgarri) − (obiettivo + attività extra). Positivo = sopra il piano, negativo = sotto.');
  r.push(imp.correzioneBasale && imp.basale
    ? 'Le calorie delle attività sono calorie attive: a quelle di Garmin è tolta la quota del basale (Calorie − basale × ore / 24).'
    : 'Le calorie delle attività di Garmin sono quelle del file, senza togliere la quota del basale.');

  if (piano) {
    r.push('');
    r.push('== DIETA DI RIFERIMENTO ==');
    piano.giorni.forEach(g => {
      const ob = g.obiettivoKcal ?? piano.obiettivoKcal;
      const quando = g.giorniSettimana.length ? ' (' + g.giorniSettimana.map(i => GIORNI_BREVI[i]).join(', ') + ')' : '';
      r.push(`${g.nome}${quando}: ${totaleGiornata(g)} kcal${ob ? `, obiettivo ${ob}` : ''}`);
      const voce = v => `${v.nome}${v.quantita ? ' ' + v.quantita : ''} ${v.kcal}${v.alternative ? ` [o: ${v.alternative.map(a => `${a.nome} ${a.kcal}`).join(', ')}]` : ''}`;
      g.pasti.forEach(p => {
        r.push(`- ${p.nome} (${totalePasto(p)}): ${p.voci.map(voce).join('; ')}`);
        (p.alternative || []).forEach(a => r.push(`  oppure ${a.nome} (${totalePasto(a)}): ${a.voci.map(voce).join('; ')}`));
      });
    });
  }

  r.push('');
  r.push('== GIORNO PER GIORNO ==');
  if (!giorni.length) r.push('(nessun giorno conteggiato nel periodo)');
  giorni.forEach(c => {
    const tipo = c.giornata && c.piano.giorni.length > 1 ? ` [${c.giornata.nome}]` : '';
    r.push(`${fmtGiorno(c.data)}${tipo} – saldo ${fmtSaldo(c.bilancio)} kcal`);
    const saltati = c.pasti.filter(p => p.saltato).map(p => `${p.nome} (−${p.totale})`);
    if (saltati.length) r.push(`  Pasti saltati: ${saltati.join(', ')}`);
    if (c.saltatiSenzaDieta.length) r.push(`  Pasti saltati (dieta non ancora caricata): ${c.saltatiSenzaDieta.join(', ')}`);
    const scelte = [
      ...c.pasti.filter(p => p.menu).map(p => `${p.nome}: ${p.menu} (${fmtSaldo(p.totale - p.base)})`),
      ...c.pasti.flatMap(p => p.voci.filter(v => v.scelta).map(v => `${v.nome} al posto di ${v.piano.nome} (${fmtSaldo(v.kcal - v.piano.kcal)})`))
    ];
    if (scelte.length) r.push(`  Alternative scelte: ${scelte.join(', ')}`);
    const tolte = c.pasti.filter(p => !p.saltato && !p.sostituitoDa)
      .flatMap(p => p.voci.filter(v => v.tolta).map(v => `${v.nome} a ${p.nome.toLowerCase()} (−${v.kcal})`));
    if (tolte.length) r.push(`  Voci tolte: ${tolte.join(', ')}`);
    c.sgarri.forEach(s => {
      const sost = s.sostituisce ? c.pasti.find(p => chiave(p.nome) === chiave(s.sostituisce)) : null;
      r.push(`  Sgarro${s.pasto ? ' (' + s.pasto.toLowerCase() + ')' : ''}: ${s.descrizione} – ${s.kcal} kcal${s.kcalMin != null ? ` [${s.kcalMin}–${s.kcalMax}]` : ''}${s.sostituisce ? `, al posto di ${s.sostituisce.toLowerCase()}${sost ? ` (−${sost.totale})` : ''}` : ''}`);
    });
    c.attivita.forEach(x => r.push(`  Attività: ${TIPI_ATTIVITA[x.a.categoria]?.nome || 'Attività'} ${descrAttivita(x.a)} – ${x.kcal} kcal attive${x.prevista ? ' (già prevista dalla dieta)' : ''}`));
    if (c.extra) r.push(`  Attività extra conteggiata: ${c.extra} kcal`);
    if (!saltati.length && !scelte.length && !tolte.length && !c.sgarri.length && !c.attivita.length && !c.saltatiSenzaDieta.length) r.push('  Dieta seguita.');
  });

  if (giorni.length) {
    r.push('');
    r.push('== SALDO PER SETTIMANA (lunedì–domenica) ==');
    const settimane = new Map();
    giorni.forEach(c => {
      const l = lunediDi(c.data);
      const s = settimane.get(l) || { n: 0, saldo: 0 };
      s.n++;
      s.saldo += c.bilancio;
      settimane.set(l, s);
    });
    settimane.forEach((s, l) => r.push(`Settimana ${fmtGiorno(l)} – ${fmtGiorno(piuGiorni(l, 6))}: ${fmtSaldo(s.saldo)} kcal (${s.n} giorni${s.n < 7 ? ', settimana incompleta' : ''})`));
    const t = riepilogoPeriodo(giorni);
    r.push('');
    r.push(`SALDO DEL PERIODO: ${fmtSaldo(t.bilancio)} kcal (sgarri +${fmtKcal(t.sgarri)}, voci e pasti tolti −${fmtKcal(t.tolto)}, attività extra −${fmtKcal(t.extra)}${Math.round(t.scarto) ? `, dieta rispetto all'obiettivo ${fmtSaldo(t.scarto)}` : ''})`);
  }

  if (conAllenamenti) {
    const sedute = dati.sedute.filter(sd => {
      const g = dataISO(new Date(sd.inizio));
      return g >= da && g <= a;
    });
    r.push('');
    r.push(`== ALLENAMENTI NEL PERIODO: ${sedute.length} ==`);
    if (dati.scheda) r.push(`Scheda: ${dati.scheda.nome}. Formato serie: kg×ripetizioni; "m2" = 2 ripetizioni di margine.`);
    sedute.forEach(sd => {
      const durata = sd.fine ? ` (${Math.round((new Date(sd.fine) - new Date(sd.inizio)) / 60000)} min)` : '';
      r.push(`${fmtGiorno(dataISO(new Date(sd.inizio)))} – ${sd.giorno}${durata}`);
      sd.esercizi.filter(e => e.serie.length).forEach(e => r.push(`- ${e.nome}: ${e.serie.map(fmtSerie).join(', ')}`));
    });
  }

  r.push('');
  r.push('== COME RISPONDERE ==');
  r.push('Per nuovi sgarri rispondi con un blocco JSON (un oggetto o un array), da incollare in Dieta → Incolla sgarro:');
  r.push(jsonCompatto(ESEMPIO_SGARRI));
  r.push('Campi: data (AAAA-MM-GG), descrizione e kcal (stima centrale) obbligatori; kcalMin e kcalMax = intervallo della stima; pasto = colazione, spuntino, pranzo, merenda, cena o sera; sostituisce = il pasto previsto di cui lo sgarro ha preso il posto (le sue kcal vengono tolte), da omettere se lo sgarro è in aggiunta.');
  r.push('');
  r.push('Per una nuova dieta rispondi con un unico blocco JSON in questo formato (Dieta → ⚙ → Dieta di riferimento):');
  r.push(jsonCompatto(ESEMPIO_DIETA));
  r.push('Ogni voce ha nome, kcal (numero) e quantita (testo, facoltativa). giorniSettimana assegna la giornata ai giorni (Lunedì…Domenica); una giornata senza giorniSettimana vale per i giorni rimasti; se la dieta è uguale tutti i giorni basta una giornata senza giorniSettimana. obiettivoKcal (della dieta o della giornata) è il bersaglio calorico: se manca, vale la somma delle voci. attivitaInclusa descrive l\'attività già considerata dalla dieta. Facoltativi: "alternative" su una voce (voci equivalenti, con nome, quantita e kcal) e "alternative" su un pasto (menù interi, ciascuno con nome e voci). Mantieni identici i nomi dei pasti (Colazione, Pranzo…) quando possibile.');
  return r.join('\n');
}

async function copiaExportDieta() {
  const area = document.getElementById('testo-export-dieta');
  try {
    await navigator.clipboard.writeText(area.value);
  } catch (e) {
    area.select();
    document.execCommand('copy');
  }
  toast('Testo copiato. Incollalo nella chat di Claude.');
}

// ===================== Eventi =====================

// Campi con data-dt: valori dei moduli e impostazioni della dieta.
function campoDieta(el) {
  const k = el.dataset.dt;
  const v = el.type === 'checkbox' ? el.checked : el.value;
  const d = D();
  const [gruppo, campo] = k.split('.');
  if (gruppo === 'fs' && statoDieta.formSgarro) {
    statoDieta.formSgarro[campo] = v;
  } else if (gruppo === 'fa' && statoDieta.formAttivita) {
    statoDieta.formAttivita[campo] = v;
    if (campo === 'categoria') { statoDieta.formAttivita.met = ''; render(); }
    else aggiornaStimaAttivita();
  } else if (gruppo === 'imp') {
    if (campo === 'tipo') {
      const lista = d.impostazioni.tipiPrevisti.filter(x => x !== el.dataset.tipo);
      d.impostazioni.tipiPrevisti = v ? [...lista, el.dataset.tipo] : lista;
    } else if (campo === 'inizio') {
      d.impostazioni.inizio = v || null;
    } else if (campo === 'correzioneBasale') {
      d.impostazioni.correzioneBasale = v;
    } else {
      d.impostazioni[campo] = numero(v);
    }
    salva();
  } else if (k === 'testo-sgarri') {
    statoDieta.testoSgarri = v;
  } else if (k === 'testo-dieta') {
    statoDieta.testoDieta = v;
  } else if (k === 'giornata') {
    recGiorno(giornoMostrato()).giornata = v;
    salva();
    render();
  } else if (k === 'scelta' || k === 'menu') {
    // Alternativa scelta per una voce, o menù alternativo per un pasto intero, solo in quel giorno.
    const data = giornoMostrato();
    const p = calcolaGiorno(data).pasti[el.dataset.p];
    if (!p) return;
    const rec = recGiorno(data);
    const dove = k === 'menu' ? 'menu' : 'scelte';
    const kv = k === 'menu' ? chiave(p.nome) : chiaveVoce(p.nome, p.voci[el.dataset.v].piano.nome);
    rec[dove] = { ...(rec[dove] || {}) };
    if (v) rec[dove][kv] = v;
    else delete rec[dove][kv];
    pulisciGiorno(data);
    salva();
    render();
  } else if (k === 'export-periodo' || k === 'export-allenamenti') {
    if (k === 'export-periodo') statoDieta.exportPeriodo = v;
    else statoDieta.exportAllenamenti = v;
    $('#testo-export-dieta').value = testoExportDieta();
  }
}

function fileDieta(el) {
  const tipo = el.dataset.dt;
  el.files[0].text().then(testo => {
    el.value = '';
    if (tipo === 'file-dieta') {
      statoDieta.testoDieta = testo;
      controllaDieta(testo);
    } else if (tipo === 'file-csv') {
      // Del file si tengono solo le attività estratte: il testo non viene salvato.
      try {
        const r = importaGarmin(testo);
        statoDieta.ultimoImport = r;
        salva();
        if (r.verificare) statoDieta.sezione = 'attivita';
        render();
        toast(`Garmin: ${testoRiepilogoGarmin(r)}.`);
      } catch (e) {
        toast(e.message, true);
      }
    }
  }).catch(e => toast('Impossibile leggere il file: ' + e.message, true));
}

const azioniDieta = {
  'dt-sezione': b => { statoDieta.sezione = b.dataset.s; render(); window.scrollTo(0, 0); },
  'dt-vai-impostazioni': () => { statoDieta.sezione = 'impostazioni'; render(); window.scrollTo(0, 0); },
  'dt-giorno-sposta': b => {
    const g = piuGiorni(giornoMostrato(), Number(b.dataset.d));
    statoDieta.data = g >= oggiISO() ? null : g;
    render();
  },
  'dt-oggi': () => { statoDieta.data = null; render(); },
  'dt-voce': b => alternaVoce(Number(b.dataset.p), Number(b.dataset.v)),
  'dt-salta': b => alternaPasto(Number(b.dataset.p)),
  'dt-controlla-sgarri': () => controllaSgarri(),
  'dt-aggiungi-sgarri': () => aggiungiSgarri(),
  'dt-nuovo-sgarro': () => apriFormSgarro(null),
  'dt-modifica-sgarro': b => apriFormSgarro(b.dataset.id),
  'dt-salva-sgarro': () => salvaFormSgarro(),
  'dt-annulla-sgarro': () => { statoDieta.formSgarro = null; render(); },
  'dt-elimina-sgarro': async b => {
    const s = D().sgarri.find(x => x.id === b.dataset.id);
    if (!s || !await chiedi(`Eliminare lo sgarro «${s.descrizione}» (${fmtKcal(s.kcal)} kcal)?`, 'Elimina', true)) return;
    D().sgarri = D().sgarri.filter(x => x.id !== s.id);
    if (statoDieta.formSgarro?.id === s.id) statoDieta.formSgarro = null;
    salva();
    render();
  },
  'dt-nuova-attivita': b => {
    nuovaAttivitaForm(b.dataset.data);
    statoDieta.sezione = 'attivita';
    render();
    document.getElementById('form-attivita')?.scrollIntoView({ block: 'start' });
  },
  'dt-salva-attivita': () => salvaFormAttivita(),
  'dt-annulla-attivita': () => { statoDieta.formAttivita = null; render(); },
  'dt-prevista': b => {
    const a = D().attivita.find(x => x.id === b.dataset.id);
    if (!a) return;
    const nuovo = !attivitaPrevista(a);
    delete a.prevista;
    if (nuovo !== attivitaPrevista(a)) a.prevista = nuovo;
    salva();
    render();
  },
  'dt-elimina-attivita': async b => {
    const d = D();
    const a = d.attivita.find(x => x.id === b.dataset.id);
    const daGarmin = a?.fonte === 'garmin';
    const domanda = `Eliminare l'attività del ${a ? fmtGiorno(a.data) : ''} (${a?.nome || 'attività'})?${daGarmin ? '\nNon verrà reimportata con i prossimi file di Garmin.' : ''}`;
    if (!a || !await chiedi(domanda, 'Elimina', true)) return;
    // Un'attività di Garmin eliminata non deve tornare alla prossima importazione.
    if (daGarmin && a.chiaveGarmin) d.garminScartate.push(a.chiaveGarmin);
    d.attivita = d.attivita.filter(x => x.id !== a.id);
    salva();
    render();
  },
  'dt-tutte-attivita': () => { statoDieta.tutteAttivita = true; render(); },
  'dt-tieni-garmin': b => risolviVerifica(Number(b.dataset.i), true),
  'dt-tieni-manuale': b => risolviVerifica(Number(b.dataset.i), false),
  'dt-periodo': b => { statoDieta.periodo = b.dataset.p; statoDieta.sel = null; render(); },
  'dt-periodo-sposta': b => {
    statoDieta.rif = spostaPeriodo(statoDieta.periodo, statoDieta.rif || oggiISO(), Number(b.dataset.d));
    if (statoDieta.rif > oggiISO()) statoDieta.rif = null;
    statoDieta.sel = null;
    render();
  },
  'dt-sel': b => { statoDieta.sel = Number(b.dataset.i); render(); },
  'dt-apri-giorno': b => {
    statoDieta.sezione = 'giorno';
    statoDieta.data = b.dataset.data >= oggiISO() ? null : b.dataset.data;
    render();
    window.scrollTo(0, 0);
  },
  'dt-apri-settimana': b => {
    statoDieta.periodo = 'settimana';
    statoDieta.rif = b.dataset.data;
    statoDieta.sel = null;
    render();
    window.scrollTo(0, 0);
  },
  'dt-copia-export': () => copiaExportDieta(),
  'dt-condividi-export': () => navigator.share({ text: $('#testo-export-dieta').value }).catch(() => {}),
  'dt-controlla-dieta': () => controllaDieta(statoDieta.testoDieta),
  'dt-usa-dieta': () => usaDieta()
};
