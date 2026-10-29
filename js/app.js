'use strict';

const VERSIONE_APP = '1.2';
const CHIAVE = 'scheda-palestra-dati';
const GIORNI_SETTIMANA = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const TITOLI = { allena: 'Allena', scheda: 'Scheda', storico: 'Storico', dati: 'Dati' };
const METRICHE = {
  carico: { nome: 'Carico', unita: 'kg' },
  e1rm: { nome: '1RM stim.', unita: 'kg' },
  volume: { nome: 'Volume', unita: 'kg' },
  rip: { nome: 'Ripetiz.', unita: 'rip' }
};

const $ = (sel, el = document) => el.querySelector(sel);
const contenuto = $('#contenuto');

let dati = carica();
let vista = 'allena';
let audioCtx = null;
let wakeLock = null;
let toastTimeout = null;
let finitoTimeout = null;
let schedaInAttesa = null;
const statoGrafico = { esercizio: null, metrica: 'carico' };
let settimaneExport = 4;

// ===================== Salvataggio =====================

function datiVuoti() {
  return {
    scheda: null,
    schedePrecedenti: [],
    sedute: [],
    sedutaInCorso: null,
    impostazioni: { suono: true, vibrazione: true, ultimoBackup: null }
  };
}

function carica() {
  try {
    const testo = localStorage.getItem(CHIAVE);
    if (testo) {
      const d = Object.assign(datiVuoti(), JSON.parse(testo));
      d.impostazioni = Object.assign(datiVuoti().impostazioni, d.impostazioni);
      return d;
    }
  } catch (e) { /* dati illeggibili: si riparte vuoti */ }
  return datiVuoti();
}

function salva() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(dati));
  } catch (e) {
    toast('Impossibile salvare i dati: ' + e.message, true);
  }
}

// ===================== Utilità =====================

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizza(nome) {
  return String(nome || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function numero(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n) {
  return n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ',');
}

function dataISO(d) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function fmtData(iso) {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtDataLunga(iso) {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDurata(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function fmtRecupero(r) {
  if (r == null || r === '') return '';
  if (typeof r === 'string') {
    const t = r.trim();
    return /^\d+(\s*-\s*\d+)?$/.test(t) ? t.replace(/\s/g, '') + '"' : t;
  }
  const m = Math.floor(r / 60), s = r % 60;
  if (r < 60 || (r < 120 && s !== 0)) return r + '"';
  return s ? `${m}'${s}"` : `${m}'`;
}

function secondiRecupero(r) {
  if (typeof r === 'number' && r > 0) return r;
  const numeri = String(r ?? '').match(/\d+/g);
  return numeri ? Math.max(...numeri.map(Number)) : 90;
}

function ripTarget(t, j) {
  const per = t.ripetizioniPerSerie;
  return per && per[j] != null ? String(per[j]) : String(t.ripetizioni ?? '');
}

function ripMinima(testo) {
  const m = String(testo ?? '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

// "4×6 · B3 · rec 3'"
function descrTarget(t) {
  const rip = t.ripetizioniPerSerie ? t.ripetizioniPerSerie.join('-') : t.ripetizioni;
  const parti = [t.ripetizioniPerSerie ? `${t.serie} serie: ${rip}` : `${t.serie}×${rip}`];
  if (t.kg) parti.push(fmtNum(t.kg) + ' kg');
  if (t.buffer != null) parti.push('B' + fmtNum(t.buffer));
  if (t.recupero != null && t.recupero !== '') parti.push('rec ' + fmtRecupero(t.recupero));
  return parti.join(' · ');
}

function fmtSerie(s) {
  const kg = s.kg ? fmtNum(s.kg) + '×' : '';
  const margine = s.margine != null ? ' m' + fmtNum(s.margine) : '';
  return `${kg}${s.rip ?? '?'}${margine}`;
}

function blocchiDi(esercizi) {
  const blocchi = [];
  esercizi.forEach((e, i) => {
    const ultimo = blocchi[blocchi.length - 1];
    if (e.superserie && ultimo && ultimo.superserie === e.superserie) ultimo.indici.push(i);
    else blocchi.push({ superserie: e.superserie || null, indici: [i] });
  });
  return blocchi;
}

function toast(testo, errore = false) {
  const el = $('#toast');
  el.textContent = testo;
  el.classList.toggle('errore', errore);
  el.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { el.hidden = true; }, errore ? 7000 : 3000);
}

// Finestra di conferma dell'app: confirm() nativo può essere bloccato dal browser.
let risolviDialogo = null;

function chiedi(testo, ok = 'Conferma', pericolo = false) {
  risolviDialogo?.(false);
  $('#dialogo-testo').textContent = testo;
  const btn = $('#dialogo-ok');
  btn.textContent = ok;
  btn.classList.toggle('pericolo', pericolo);
  $('#dialogo').hidden = false;
  return new Promise(res => { risolviDialogo = res; });
}

function chiudiDialogo(risposta) {
  $('#dialogo').hidden = true;
  const res = risolviDialogo;
  risolviDialogo = null;
  res?.(risposta);
}

// ===================== Scheda: validazione =====================

function validaScheda(o) {
  const err = [];
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Il contenuto non è un oggetto JSON.');
  if (o.formato !== 'scheda-palestra') err.push('Il campo "formato" deve essere "scheda-palestra".');
  if (!Array.isArray(o.giorni) || !o.giorni.length) err.push('Serve almeno un giorno in "giorni".');

  const giorni = (Array.isArray(o.giorni) ? o.giorni : []).map((gRaw, gi) => {
    const g = gRaw || {};
    const dove = `Giorno ${gi + 1}${g.nome ? ' (' + g.nome + ')' : ''}`;
    if (!g.nome) err.push(`${dove}: manca "nome".`);
    if (!Array.isArray(g.esercizi) || !g.esercizi.length) err.push(`${dove}: serve almeno un esercizio.`);

    const esercizi = (Array.isArray(g.esercizi) ? g.esercizi : []).map((eRaw, ei) => {
      const e = eRaw || {};
      const d = `${dove}, esercizio ${ei + 1}${e.nome ? ' (' + e.nome + ')' : ''}`;
      const serie = Number(e.serie);
      if (!e.nome) err.push(`${d}: manca "nome".`);
      if (!Number.isInteger(serie) || serie < 1 || serie > 20) err.push(`${d}: "serie" deve essere un numero intero tra 1 e 20.`);
      if (e.ripetizioni == null || e.ripetizioni === '') err.push(`${d}: manca "ripetizioni".`);

      const es = { nome: String(e.nome ?? '').trim(), serie, ripetizioni: String(e.ripetizioni ?? '') };
      if (e.ripetizioniPerSerie != null) {
        const per = e.ripetizioniPerSerie;
        if (!Array.isArray(per) || per.length !== serie || per.some(x => !Number.isFinite(Number(x)))) {
          err.push(`${d}: "ripetizioniPerSerie" deve contenere un numero per ogni serie.`);
        } else {
          es.ripetizioniPerSerie = per.map(Number);
        }
      }
      if (e.buffer != null && e.buffer !== '') {
        const b = Number(e.buffer);
        if (!Number.isFinite(b)) err.push(`${d}: "buffer" deve essere un numero.`);
        else es.buffer = b;
      }
      if (e.kg != null && e.kg !== '') {
        const kg = Number(e.kg);
        if (!Number.isFinite(kg) || kg < 0) err.push(`${d}: "kg" deve essere un numero.`);
        else if (kg > 0) es.kg = kg;
      }
      if (e.incremento != null && e.incremento !== '') {
        const inc = Number(e.incremento);
        if (!Number.isFinite(inc)) err.push(`${d}: "incremento" deve essere un numero.`);
        else es.incremento = inc;
      }
      if (e.recupero != null && e.recupero !== '') es.recupero = typeof e.recupero === 'number' ? e.recupero : String(e.recupero);
      if (e.superserie) es.superserie = String(e.superserie);
      if (e.note) es.note = String(e.note);
      return es;
    });

    const giorno = { nome: String(g.nome ?? ''), giornoSettimana: g.giornoSettimana ? String(g.giornoSettimana) : '', esercizi };
    if (g.note) giorno.note = String(g.note);
    return giorno;
  });

  if (err.length) {
    const altri = err.length > 8 ? `\n…e altri ${err.length - 8} errori.` : '';
    throw new Error(err.slice(0, 8).join('\n') + altri);
  }

  return {
    formato: 'scheda-palestra',
    versione: 1,
    nome: String(o.nome || 'Scheda senza nome'),
    dataInizio: /^\d{4}-\d{2}-\d{2}$/.test(o.dataInizio || '') ? o.dataInizio : dataISO(new Date()),
    note: o.note ? String(o.note) : '',
    regoleProgressione: Array.isArray(o.regoleProgressione) ? o.regoleProgressione.map(String) : [],
    giorni
  };
}

function estraiJSON(testo) {
  const a = testo.indexOf('{'), b = testo.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Non trovo un oggetto JSON nel testo.');
  try {
    return JSON.parse(testo.slice(a, b + 1));
  } catch (e) {
    throw new Error('Il JSON non è valido: ' + e.message);
  }
}

// ===================== Storico: ricerche =====================

function ultimaVolta(nome) {
  const chiave = normalizza(nome);
  for (let k = dati.sedute.length - 1; k >= 0; k--) {
    const sd = dati.sedute[k];
    const es = sd.esercizi.find(e => normalizza(e.nome) === chiave && e.serie.length);
    if (es) return { seduta: sd, es };
  }
  return null;
}

function ultimaSedutaGiorno(nome) {
  const chiave = normalizza(nome);
  for (let k = dati.sedute.length - 1; k >= 0; k--) {
    if (normalizza(dati.sedute[k].giorno) === chiave) return dati.sedute[k];
  }
  return null;
}

// Proposta di aumento del carico: tutte le serie fatte, ripetizioni raggiunte
// e margine dichiarato sempre maggiore del buffer.
function suggerimento(es, uv) {
  if (es.buffer == null || !uv) return null;
  const serie = uv.es.serie;
  const target = uv.es.target || es;
  if (serie.length < target.serie) return null;
  const ok = serie.every((s, j) =>
    s.margine != null && s.margine > es.buffer &&
    s.rip != null && s.rip >= (ripMinima(ripTarget(target, j)) ?? 0));
  if (!ok) return null;
  const kg = Math.max(...serie.map(s => s.kg ?? 0));
  if (!kg) return null;
  const inc = es.incremento ?? 2.5;
  return {
    kg: kg + inc,
    testo: `Ultima volta margine sempre oltre B${fmtNum(es.buffer)}: prova ${fmtNum(kg + inc)} kg (+${fmtNum(inc)})`
  };
}

// ===================== Seduta in corso =====================

function nuovaSeduta(gi) {
  const g = dati.scheda.giorni[gi];
  return {
    id: Date.now().toString(36),
    inizio: new Date().toISOString(),
    giorno: g.nome,
    giornoSettimana: g.giornoSettimana || '',
    scheda: dati.scheda.nome,
    note: '',
    timer: null,
    esercizi: g.esercizi.map(es => {
      const uv = ultimaVolta(es.nome);
      const maxPrima = uv ? Math.max(...uv.es.serie.map(s => s.kg ?? 0)) : null;
      // Un peso nella scheda diverso dall'ultima seduta è stato scelto a mano: vince lui.
      const manuale = es.kg != null && es.kg !== maxPrima;
      const sugg = manuale ? null : suggerimento(es, uv);
      const kgPrima = j => {
        if (manuale) return fmtNum(es.kg);
        if (sugg) return fmtNum(sugg.kg);
        if (!uv) return es.kg != null ? fmtNum(es.kg) : '';
        const s = uv.es.serie[j] || uv.es.serie[uv.es.serie.length - 1];
        return s.kg ? fmtNum(s.kg) : '';
      };
      return {
        nome: es.nome,
        superserie: es.superserie || null,
        note: es.note || '',
        target: {
          serie: es.serie,
          ripetizioni: es.ripetizioni,
          ripetizioniPerSerie: es.ripetizioniPerSerie || null,
          buffer: es.buffer ?? null,
          recupero: es.recupero ?? null
        },
        precedente: uv ? { data: fmtData(uv.seduta.inizio), testo: uv.es.serie.map(fmtSerie).join(', ') } : null,
        suggerimento: sugg ? sugg.testo : null,
        serie: Array.from({ length: es.serie }, (_, j) => ({ kg: kgPrima(j), rip: '', margine: '', fatta: false }))
      };
    })
  };
}

function prossimaSerie(sd) {
  for (const b of blocchiDi(sd.esercizi)) {
    const giri = Math.max(...b.indici.map(i => sd.esercizi[i].serie.length));
    for (let j = 0; j < giri; j++) {
      for (const i of b.indici) {
        const s = sd.esercizi[i].serie[j];
        if (s && !s.fatta) return { i, j };
      }
    }
  }
  return null;
}

// Dopo la serie (i, j): prima si resta nello stesso esercizio o superserie,
// poi si passa alla prima serie ancora da fare.
function serieDopo(sd, i, j) {
  const b = blocchiDi(sd.esercizi).find(b => b.indici.includes(i));
  const giri = Math.max(...b.indici.map(k => sd.esercizi[k].serie.length));
  for (let g = j; g < giri; g++) {
    for (const k of b.indici) {
      if (g === j && k <= i) continue;
      const s = sd.esercizi[k].serie[g];
      if (s && !s.fatta) return { i: k, j: g };
    }
  }
  return prossimaSerie(sd);
}

function serieAttiva(sd) {
  const p = sd.puntatore;
  const s = p && sd.esercizi[p.i]?.serie[p.j];
  return s && !s.fatta ? p : prossimaSerie(sd);
}

function iniziaSeduta(gi) {
  if (dati.sedutaInCorso) { vai('allena'); return; }
  dati.sedutaInCorso = nuovaSeduta(gi);
  salva();
  richiediWakeLock();
  vai('allena');
  window.scrollTo(0, 0);
}

function spunta(i, j) {
  const sd = dati.sedutaInCorso;
  const e = sd.esercizi[i];
  const s = e.serie[j];

  if (s.fatta) {
    s.fatta = false;
    salva();
    render();
    return;
  }

  if (String(s.rip).trim() === '') s.rip = String(ripMinima(ripTarget(e.target, j)) ?? '');
  s.fatta = true;
  // Il carico usato vale anche per le serie successive non ancora fatte.
  if (String(s.kg).trim() !== '') e.serie.forEach((x, k) => { if (k > j && !x.fatta) x.kg = s.kg; });

  const nx = serieDopo(sd, i, j);
  sd.puntatore = nx;
  if (!nx) {
    fermaTimer();
    salva();
    render();
    toast('Tutte le serie completate! Premi «Termina e salva».');
    return;
  }
  // In superserie si passa subito all'esercizio successivo dello stesso giro.
  const stessoGiro = nx.i !== i && nx.j === j && e.superserie && sd.esercizi[nx.i].superserie === e.superserie;
  if (!stessoGiro) avviaTimer(secondiRecupero(e.target.recupero), e.nome);
  salva();
  render();
  setTimeout(() => document.getElementById(`riga-${nx.i}-${nx.j}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
}

async function terminaSeduta() {
  const sd = dati.sedutaInCorso;
  const fatte = sd.esercizi.reduce((n, e) => n + e.serie.filter(s => s.fatta).length, 0);
  if (!fatte) {
    if (await chiedi('Nessuna serie segnata come fatta (✓). Vuoi annullare la seduta?', 'Annulla seduta', true)) annullaSeduta(true);
    return;
  }
  if (prossimaSerie(sd) && !await chiedi('Alcune serie non sono segnate come fatte.\nTerminare comunque? Verranno salvate solo quelle fatte.', 'Termina e salva')) return;
  if (dati.sedutaInCorso !== sd) return;

  dati.sedute.push({
    id: sd.id,
    inizio: sd.inizio,
    fine: new Date().toISOString(),
    giorno: sd.giorno,
    giornoSettimana: sd.giornoSettimana,
    scheda: sd.scheda,
    note: sd.note.trim(),
    esercizi: sd.esercizi.map(e => ({
      nome: e.nome,
      superserie: e.superserie,
      target: e.target,
      serie: e.serie.filter(s => s.fatta).map(s => ({ kg: numero(s.kg), rip: numero(s.rip), margine: numero(s.margine) }))
    }))
  });
  dati.sedute.sort((a, b) => a.inizio.localeCompare(b.inizio));
  aggiornaPesiScheda(sd);
  fermaTimer();
  dati.sedutaInCorso = null;
  salva();
  rilasciaWakeLock();
  render();
  toast(`Seduta salvata: ${fatte} serie.`);
}

// Il peso di lavoro nella scheda diventa il carico massimo usato in questa seduta.
function aggiornaPesiScheda(sd) {
  const giorno = dati.scheda?.giorni.find(g => normalizza(g.nome) === normalizza(sd.giorno));
  if (!giorno) return;
  sd.esercizi.forEach(e => {
    const kgs = e.serie.filter(s => s.fatta).map(s => numero(s.kg)).filter(k => k > 0);
    if (!kgs.length) return;
    giorno.esercizi.forEach(x => { if (normalizza(x.nome) === normalizza(e.nome)) x.kg = Math.max(...kgs); });
  });
}

async function annullaSeduta(senzaConferma = false) {
  if (!senzaConferma && !await chiedi('Annullare la seduta? I dati inseriti andranno persi.', 'Annulla seduta', true)) return;
  fermaTimer();
  dati.sedutaInCorso = null;
  salva();
  rilasciaWakeLock();
  render();
}

// ===================== Timer, suono, vibrazione, schermo =====================

function avviaTimer(sec, nome) {
  const sd = dati.sedutaInCorso;
  if (!sd) return;
  clearTimeout(finitoTimeout);
  sd.timer = { fine: Date.now() + sec * 1000, durata: sec, nome };
  aggiornaTimer();
}

function fermaTimer() {
  if (dati.sedutaInCorso) dati.sedutaInCorso.timer = null;
  clearTimeout(finitoTimeout);
  const el = $('#timer');
  el.hidden = true;
  el.classList.remove('finito');
  document.body.classList.remove('con-timer');
}

function aggiornaTimer() {
  const el = $('#timer');
  const t = dati.sedutaInCorso?.timer;
  if (!t) {
    if (!el.classList.contains('finito')) { el.hidden = true; document.body.classList.remove('con-timer'); }
    return;
  }
  const resto = (t.fine - Date.now()) / 1000;
  if (resto <= 0) { recuperoFinito(t); return; }
  el.hidden = false;
  el.classList.remove('finito');
  document.body.classList.add('con-timer');
  $('#timer-etichetta').textContent = 'Recupero';
  $('#timer-nome').textContent = t.nome;
  $('#timer-tempo').textContent = fmtDurata(Math.ceil(resto));
  $('#timer-barra').style.width = Math.min(100, resto / t.durata * 100) + '%';
}

function recuperoFinito(t) {
  dati.sedutaInCorso.timer = null;
  salva();
  // Se l'app era chiusa da molto, niente avviso tardivo.
  if (Date.now() - t.fine < 10000) { suona(); vibra(); }
  const el = $('#timer');
  el.hidden = false;
  el.classList.add('finito');
  document.body.classList.add('con-timer');
  $('#timer-etichetta').textContent = 'Recupero finito';
  $('#timer-nome').textContent = 'Prossima serie!';
  $('#timer-tempo').textContent = 'Vai';
  $('#timer-barra').style.width = '0%';
  clearTimeout(finitoTimeout);
  finitoTimeout = setTimeout(() => {
    el.classList.remove('finito');
    el.hidden = true;
    document.body.classList.remove('con-timer');
  }, 5000);
}

function azioneTimer(azione) {
  const t = dati.sedutaInCorso?.timer;
  if (azione === 'salta' || !t) { fermaTimer(); salva(); return; }
  const delta = azione === '+15' ? 15 : -15;
  t.fine += delta * 1000;
  if (delta > 0) t.durata += delta;
  salva();
  aggiornaTimer();
}

function sbloccaAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* audio non disponibile */ }
}

function suona() {
  if (!dati.impostazioni.suono || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  [0, 0.3, 0.6].forEach((d, k) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = k === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.6, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.25);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.3);
  });
}

function vibra() {
  if (dati.impostazioni.vibrazione && navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 500]);
}

async function richiediWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { /* non supportato o negato */ }
}

function rilasciaWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

function tick() {
  aggiornaTimer();
  const crono = $('#cronometro');
  if (crono && dati.sedutaInCorso) crono.textContent = fmtDurata((Date.now() - new Date(dati.sedutaInCorso.inizio)) / 1000);
}

// ===================== Viste =====================

function vai(v) {
  vista = v;
  render();
  window.scrollTo(0, 0);
}

function render() {
  $('#titolo').textContent = vista === 'allena' && dati.sedutaInCorso ? 'Seduta in corso' : TITOLI[vista];
  document.querySelectorAll('.tab button').forEach(b => b.classList.toggle('attiva', b.dataset.vista === vista));
  if (!dati.scheda && vista !== 'dati') {
    contenuto.innerHTML = '<p class="vuoto">Nessuna scheda caricata. Importane una dalla sezione Dati.</p>';
  } else if (vista === 'allena') {
    dati.sedutaInCorso ? renderSeduta() : renderGiorni();
  } else if (vista === 'scheda') {
    if (bozza) $('#titolo').textContent = 'Modifica scheda';
    bozza ? renderModifica() : renderScheda();
  } else if (vista === 'storico') {
    renderStorico();
  } else {
    renderDati();
  }
  tick();
}

// ---------- Allena: scelta del giorno ----------

function renderGiorni() {
  const s = dati.scheda;
  const oggi = normalizza(GIORNI_SETTIMANA[new Date().getDay()]);
  contenuto.innerHTML = `
    <section class="intro">
      <div class="etichetta">Scheda attuale</div>
      <h2>${esc(s.nome)}</h2>
    </section>
    ${s.giorni.map((g, i) => {
      const ultima = ultimaSedutaGiorno(g.nome);
      const eOggi = normalizza(g.giornoSettimana) === oggi;
      return `
      <article class="card giorno${eOggi ? ' oggi' : ''}">
        <div class="giorno-testa">
          <div>
            <div class="etichetta">${esc(g.giornoSettimana)}${eOggi ? ' · oggi' : ''}</div>
            <h3>${esc(g.nome)}</h3>
          </div>
          <button class="btn primario" data-azione="inizia" data-giorno="${i}">Inizia</button>
        </div>
        <ul class="elenco-esercizi">
          ${g.esercizi.map(e => `<li>${esc(e.nome)} <span class="muto">${esc(descrTarget(e))}</span></li>`).join('')}
        </ul>
        <div class="muto piccolo">${ultima ? 'Ultima volta: ' + esc(fmtData(ultima.inizio)) : 'Mai eseguito'}</div>
      </article>`;
    }).join('')}`;
}

// ---------- Allena: seduta in corso ----------

function renderSeduta() {
  const sd = dati.sedutaInCorso;
  const nx = serieAttiva(sd);
  const totali = sd.esercizi.reduce((n, e) => n + e.serie.length, 0);
  const fatte = sd.esercizi.reduce((n, e) => n + e.serie.filter(s => s.fatta).length, 0);

  const blocchi = blocchiDi(sd.esercizi).map(b => b.superserie && b.indici.length > 1
    ? `<div class="superserie">
         <div class="superserie-etichetta">Superserie ${esc(b.superserie)} · alterna gli esercizi</div>
         ${b.indici.map(i => cardEsercizio(sd, i, nx)).join('')}
       </div>`
    : b.indici.map(i => cardEsercizio(sd, i, nx)).join('')).join('');

  contenuto.innerHTML = `
    <section class="seduta-testa">
      <div>
        <div class="etichetta">${esc(sd.giornoSettimana)} · ${fatte}/${totali} serie</div>
        <h2>${esc(sd.giorno)}</h2>
      </div>
      <div class="cronometro" id="cronometro">0:00</div>
    </section>
    <div class="progresso-seduta"><div style="width:${totali ? fatte / totali * 100 : 0}%"></div></div>
    ${blocchi}
    <label class="campo">
      <span>Note della seduta</span>
      <textarea data-campo="note-seduta" rows="2" placeholder="Sensazioni, dolori, cambi di macchina…">${esc(sd.note)}</textarea>
    </label>
    <div class="azioni-fondo">
      <button class="btn primario largo" data-azione="termina">Termina e salva</button>
      <button class="btn testo pericolo" data-azione="annulla-seduta">Annulla seduta</button>
    </div>`;
}

function cardEsercizio(sd, i, nx) {
  const e = sd.esercizi[i];
  const t = e.target;
  const conMargine = t.buffer != null;
  const completato = e.serie.every(s => s.fatta);
  const righe = e.serie.map((s, j) => {
    const attiva = nx && nx.i === i && nx.j === j;
    const attr = `data-i="${i}" data-j="${j}"`;
    return `
      <div class="serie-riga${s.fatta ? ' fatta' : ''}${attiva ? ' attiva' : ''}" id="riga-${i}-${j}">
        <span class="serie-num">${j + 1}</span>
        <input inputmode="decimal" autocomplete="off" ${attr} data-k="kg" value="${esc(s.kg)}" placeholder="kg" aria-label="Carico serie ${j + 1}">
        <input inputmode="numeric" autocomplete="off" ${attr} data-k="rip" value="${esc(s.rip)}" placeholder="${esc(ripTarget(t, j))}" aria-label="Ripetizioni serie ${j + 1}">
        ${conMargine ? `<input inputmode="numeric" autocomplete="off" ${attr} data-k="margine" value="${esc(s.margine)}" placeholder="B${esc(fmtNum(t.buffer))}" aria-label="Margine serie ${j + 1}">` : ''}
        <button class="spunta" data-azione="spunta" ${attr} aria-label="Serie ${j + 1} fatta">✓</button>
      </div>`;
  }).join('');

  return `
    <article class="card esercizio${completato ? ' completato' : ''}" id="es-${i}">
      <h3>${esc(e.nome)}</h3>
      <div class="target">${esc(descrTarget(t))}</div>
      ${e.note ? `<div class="nota">${esc(e.note)}</div>` : ''}
      ${e.suggerimento ? `<div class="suggerimento">↑ ${esc(e.suggerimento)}</div>` : ''}
      ${e.precedente ? `<div class="precedente">Ultima volta (${esc(e.precedente.data)}): ${esc(e.precedente.testo)}</div>` : ''}
      <div class="serie-tabella${conMargine ? ' con-margine' : ''}">
        <div class="serie-riga intest"><span></span><span>kg</span><span>rip</span>${conMargine ? '<span>margine</span>' : ''}<span></span></div>
        ${righe}
      </div>
    </article>`;
}

// ---------- Scheda ----------

function renderScheda() {
  const s = dati.scheda;
  contenuto.innerHTML = `
    <button class="btn primario largo" data-azione="modifica-scheda" style="margin-bottom:14px">Modifica scheda</button>
    <section class="intro">
      <div class="etichetta">In uso dal ${esc(new Date(s.dataInizio + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
      <h2>${esc(s.nome)}</h2>
      ${s.note ? `<p class="muto piccolo">${esc(s.note)}</p>` : ''}
    </section>
    ${s.giorni.map(g => `
      <article class="card scheda-giorno">
        <div class="etichetta">${esc(g.giornoSettimana)}</div>
        <h3>${esc(g.nome)}</h3>
        ${g.note ? `<p class="muto piccolo">${esc(g.note)}</p>` : ''}
        <ol>
          ${g.esercizi.map(e => `
            <li class="${e.superserie ? 'in-superserie' : ''}">
              ${e.superserie ? `<span class="badge">SS ${esc(e.superserie)}</span> ` : ''}${esc(e.nome)}
              <div class="dettaglio">${esc(descrTarget(e))}${e.note ? ' · ' + esc(e.note) : ''}</div>
            </li>`).join('')}
        </ol>
      </article>`).join('')}
    ${s.regoleProgressione.length ? `
      <section class="card">
        <h3>Regole di progressione</h3>
        <ul class="regole">${s.regoleProgressione.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      </section>` : ''}
    <p class="muto piccolo">Notazione: serie×ripetizioni · B = buffer (ripetizioni di margine) · rec = recupero · SS = superserie.
    ${dati.schedePrecedenti.length ? `<br>Schede precedenti archiviate: ${dati.schedePrecedenti.length}.` : ''}</p>`;
}

// ---------- Scheda: modifica ----------

// La bozza tiene i campi come testo, così come li scrivi; diventano numeri al salvataggio.
let bozza = null;

function bozzaDa(s) {
  return {
    nome: s.nome,
    dataInizio: s.dataInizio,
    note: s.note || '',
    regole: s.regoleProgressione.join('\n'),
    giorni: s.giorni.map(g => ({
      nome: g.nome,
      giornoSettimana: g.giornoSettimana || '',
      note: g.note || '',
      esercizi: g.esercizi.map((e, k, lista) => ({
        orig: e.nome,
        nome: e.nome,
        kg: e.kg != null ? fmtNum(e.kg) : '',
        serie: String(e.serie),
        ripetizioni: e.ripetizioni,
        perSerie: e.ripetizioniPerSerie ? e.ripetizioniPerSerie.join('-') : '',
        buffer: e.buffer != null ? fmtNum(e.buffer) : '',
        recupero: e.recupero != null ? fmtRecupero(e.recupero) : '',
        incremento: e.incremento != null ? fmtNum(e.incremento) : '',
        note: e.note || '',
        collegato: !!e.superserie && lista[k + 1]?.superserie === e.superserie,
        aperto: false
      }))
    }))
  };
}

function nuovoEsercizioBozza() {
  return { orig: null, nome: '', kg: '', serie: '3', ripetizioni: '10', perSerie: '', buffer: '', recupero: '90"', incremento: '', note: '', collegato: false, aperto: true };
}

// "90", "90\"", "3'", "2'30", "2:30", "60-90" → secondi o intervallo; undefined se non valido.
function leggiRecupero(testo) {
  const t = String(testo).trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'");
  if (!t) return null;
  let m;
  if ((m = t.match(/^(\d+)\s*-\s*(\d+)\s*"?$/))) return `${m[1]}-${m[2]}`;
  if ((m = t.match(/^(\d+)\s*"$/))) return Number(m[1]);
  if ((m = t.match(/^(\d+)$/))) return Number(m[1]) <= 10 ? Number(m[1]) * 60 : Number(m[1]);
  if ((m = t.match(/^(\d+)\s*[':]\s*(\d{1,2})?\s*"?$/))) return Number(m[1]) * 60 + Number(m[2] || 0);
  return undefined;
}

function inSuperserie(lista, k) {
  return (lista[k].collegato && k < lista.length - 1) || (k > 0 && lista[k - 1].collegato);
}

function schedaDaBozza(b) {
  const errori = [];
  const o = {
    formato: 'scheda-palestra',
    versione: 1,
    nome: b.nome.trim(),
    dataInizio: b.dataInizio,
    note: b.note.trim(),
    regoleProgressione: b.regole.split('\n').map(r => r.trim()).filter(Boolean),
    giorni: b.giorni.map(g => {
      let lettera = 0;
      return {
        nome: g.nome.trim(),
        giornoSettimana: g.giornoSettimana,
        note: g.note.trim(),
        esercizi: g.esercizi.map((e, k, lista) => {
          const es = { nome: e.nome.trim(), serie: Number(e.serie), ripetizioni: e.ripetizioni.trim() };
          if (e.perSerie.trim()) es.ripetizioniPerSerie = e.perSerie.trim().split(/[\s,;\-–]+/).filter(Boolean).map(Number);
          if (e.kg.trim()) es.kg = numero(e.kg) ?? e.kg;
          if (e.buffer.trim()) es.buffer = numero(e.buffer) ?? e.buffer;
          if (e.incremento.trim()) es.incremento = numero(e.incremento) ?? e.incremento;
          const rec = leggiRecupero(e.recupero);
          if (rec === undefined) errori.push(`${g.nome || 'Giorno'} – ${e.nome || 'esercizio'}: recupero "${e.recupero}" non valido (es. 90" oppure 3' oppure 60-90).`);
          else if (rec != null) es.recupero = rec;
          if (e.note.trim()) es.note = e.note.trim();
          if (inSuperserie(lista, k)) {
            if (!(k > 0 && lista[k - 1].collegato)) lettera++;
            es.superserie = String.fromCharCode(64 + lettera);
          }
          return es;
        })
      };
    })
  };
  if (errori.length) throw new Error(errori.join('\n'));
  return validaScheda(o);
}

function renderModifica() {
  const b = bozza;
  const opzioniGiorno = sel => ['', ...GIORNI_SETTIMANA.slice(1), GIORNI_SETTIMANA[0]]
    .map(d => `<option value="${d}"${d === sel ? ' selected' : ''}>${d || '—'}</option>`).join('');

  contenuto.innerHTML = `
    <section class="card">
      <label class="campo"><span>Nome della scheda</span><input data-ed="nome" value="${esc(b.nome)}"></label>
      <label class="campo"><span>In uso dal</span><input type="date" data-ed="dataInizio" value="${esc(b.dataInizio)}"></label>
    </section>

    ${b.giorni.map((g, gi) => `
      <section class="card ed-giorno">
        <div class="ed-riga">
          <label class="campo"><span>Giorno</span><input data-ed="g.${gi}.nome" value="${esc(g.nome)}"></label>
          <label class="campo"><span>Giorno della settimana</span><select data-ed="g.${gi}.giornoSettimana">${opzioniGiorno(g.giornoSettimana)}</select></label>
        </div>
        ${g.esercizi.map((e, ei) => edEsercizio(gi, ei, e, g.esercizi)).join('')}
        <button class="btn largo" data-azione="ed-agg-es" data-g="${gi}">+ Aggiungi esercizio</button>
        <div class="riga-bottoni">
          <button class="btn" data-azione="ed-sposta-g" data-g="${gi}" data-d="-1"${gi === 0 ? ' disabled' : ''}>↑ Su</button>
          <button class="btn" data-azione="ed-sposta-g" data-g="${gi}" data-d="1"${gi === b.giorni.length - 1 ? ' disabled' : ''}>↓ Giù</button>
          <button class="btn testo pericolo" data-azione="ed-elimina-g" data-g="${gi}">Elimina giorno</button>
        </div>
      </section>`).join('')}

    <button class="btn largo" data-azione="ed-agg-g" style="margin-bottom:12px">+ Aggiungi giorno</button>

    <section class="card">
      <label class="campo"><span>Regole di progressione (una per riga)</span><textarea data-ed="regole" rows="4">${esc(b.regole)}</textarea></label>
      <label class="campo"><span>Note della scheda</span><textarea data-ed="note" rows="2">${esc(b.note)}</textarea></label>
    </section>

    <div class="barra-modifica">
      <button class="btn" data-azione="ed-annulla">Annulla</button>
      <button class="btn primario" data-azione="ed-salva">Salva scheda</button>
    </div>`;
}

function edEsercizio(gi, ei, e, lista) {
  const p = `g.${gi}.e.${ei}`;
  const campo = (nome, etichetta, attr = '') =>
    `<label class="campo"><span>${etichetta}</span><input data-ed="${p}.${nome}" value="${esc(e[nome])}" autocomplete="off" ${attr}></label>`;
  const riassunto = [
    e.serie && e.ripetizioni ? `${e.serie}×${e.perSerie || e.ripetizioni}` : '',
    e.kg ? e.kg + ' kg' : '',
    e.buffer ? 'B' + e.buffer : '',
    e.recupero ? 'rec ' + e.recupero : ''
  ].filter(Boolean).join(' · ');

  return `
    <div class="ed-esercizio${inSuperserie(lista, ei) ? ' in-ss' : ''}" id="ed-${gi}-${ei}">
      <button class="ed-testa" data-azione="ed-apri" data-g="${gi}" data-e="${ei}" aria-expanded="${e.aperto}">
        <span><b>${esc(e.nome || 'Nuovo esercizio')}</b><span class="muto piccolo">${esc(riassunto)}</span></span>
        <span class="muto">${e.aperto ? '▴' : '▾'}</span>
      </button>
      ${e.aperto ? `
      <div class="ed-corpo">
        ${campo('nome', 'Nome')}
        <div class="ed-griglia">
          ${campo('kg', 'Peso (kg)', 'inputmode="decimal"')}
          ${campo('serie', 'Serie', 'inputmode="numeric"')}
          ${campo('ripetizioni', 'Ripetizioni')}
          ${campo('buffer', 'Buffer', 'inputmode="numeric" placeholder="—"')}
          ${campo('recupero', 'Recupero', 'placeholder="90&quot;"')}
          ${campo('incremento', '+kg progr.', 'inputmode="decimal" placeholder="2,5"')}
        </div>
        ${campo('perSerie', 'Ripetizioni diverse per serie (facoltativo, es. 3-2-2-2-3)', 'placeholder="—"')}
        ${campo('note', 'Note')}
        ${ei < lista.length - 1 ? `<label class="spunta-campo"><input type="checkbox" data-ed="${p}.collegato"${e.collegato ? ' checked' : ''}> In superserie con l'esercizio successivo</label>` : ''}
        <div class="riga-bottoni">
          <button class="btn" data-azione="ed-sposta-es" data-g="${gi}" data-e="${ei}" data-d="-1"${ei === 0 ? ' disabled' : ''}>↑ Su</button>
          <button class="btn" data-azione="ed-sposta-es" data-g="${gi}" data-e="${ei}" data-d="1"${ei === lista.length - 1 ? ' disabled' : ''}>↓ Giù</button>
          <button class="btn testo pericolo" data-azione="ed-elimina-es" data-g="${gi}" data-e="${ei}">Elimina</button>
        </div>
      </div>` : ''}
    </div>`;
}

function impostaBozza(percorso, valore) {
  const p = percorso.split('.');
  let obj = bozza;
  if (p[0] === 'g') {
    obj = bozza.giorni[p[1]];
    if (p[2] === 'e') { obj = obj.esercizi[p[3]]; p.splice(0, 4); } else p.splice(0, 2);
  }
  obj[p[0]] = valore;
}

function sposta(lista, da, delta) {
  const a = da + delta;
  if (a < 0 || a >= lista.length) return;
  [lista[da], lista[a]] = [lista[a], lista[da]];
}

async function salvaBozza() {
  let nuova;
  try {
    nuova = schedaDaBozza(bozza);
  } catch (e) {
    toast(e.message, true);
    return;
  }
  // Esercizi rinominati: si può portare lo storico sul nuovo nome.
  const rinominati = new Map();
  bozza.giorni.forEach(g => g.esercizi.forEach(e => {
    if (e.orig && normalizza(e.orig) !== normalizza(e.nome) && ultimaVolta(e.orig)) rinominati.set(normalizza(e.orig), e.nome.trim());
  }));
  if (rinominati.size && await chiedi(
    `Hai rinominato ${rinominati.size === 1 ? 'un esercizio' : rinominati.size + ' esercizi'}.\nRinominarli anche nello storico, così grafici e carichi precedenti restano collegati?`,
    'Sì, rinomina')) {
    dati.sedute.forEach(sd => sd.esercizi.forEach(e => {
      const n = rinominati.get(normalizza(e.nome));
      if (n) e.nome = n;
    }));
  }
  dati.scheda = nuova;
  bozza = null;
  salva();
  render();
  window.scrollTo(0, 0);
  toast('Scheda salvata.');
}

// ---------- Storico ----------

function nomiEsercizi() {
  const mappa = new Map();
  dati.sedute.forEach(sd => sd.esercizi.forEach(e => {
    if (e.serie.length && !mappa.has(normalizza(e.nome))) mappa.set(normalizza(e.nome), e.nome);
  }));
  return [...mappa.entries()].sort((a, b) => a[1].localeCompare(b[1], 'it'));
}

function puntiGrafico(chiave, metrica) {
  const punti = [];
  dati.sedute.forEach(sd => {
    const es = sd.esercizi.find(e => normalizza(e.nome) === chiave && e.serie.length);
    if (!es) return;
    const serie = es.serie;
    let v;
    if (metrica === 'carico') v = Math.max(...serie.map(s => s.kg ?? 0));
    else if (metrica === 'e1rm') v = Math.max(...serie.map(s => (s.kg ?? 0) * (1 + (s.rip ?? 0) / 30)));
    else if (metrica === 'volume') v = serie.reduce((n, s) => n + (s.kg ?? 0) * (s.rip ?? 0), 0);
    else v = serie.reduce((n, s) => n + (s.rip ?? 0), 0);
    punti.push({ data: sd.inizio, v: Math.round(v * 10) / 10 });
  });
  return punti;
}

function svgGrafico(punti, unita) {
  if (!punti.length) return '<p class="vuoto">Nessun dato per questo esercizio.</p>';
  if (punti.every(p => !p.v)) return '<p class="vuoto">Nessun valore da mostrare (esercizio a corpo libero? prova «Ripetiz.»).</p>';
  const W = 340, H = 200, sx = 38, dx = 10, su = 18, giu = 24;
  const ts = punti.map(p => +new Date(p.data));
  let tMin = Math.min(...ts), tMax = Math.max(...ts);
  if (tMax === tMin) { tMin -= 86400000; tMax += 86400000; }
  const vs = punti.map(p => p.v);
  let vMin = Math.min(...vs), vMax = Math.max(...vs);
  const margine = (vMax - vMin) * 0.15 || Math.max(1, vMax * 0.1);
  vMin = Math.max(0, vMin - margine);
  vMax += margine;
  const x = t => sx + (t - tMin) / (tMax - tMin) * (W - sx - dx);
  const y = v => su + (1 - (v - vMin) / (vMax - vMin)) * (H - su - giu);

  let griglia = '';
  for (let k = 0; k <= 4; k++) {
    const v = vMin + (vMax - vMin) * k / 4;
    griglia += `<line x1="${sx}" x2="${W - dx}" y1="${y(v)}" y2="${y(v)}" stroke="#2a3240" stroke-width="1"/>
      <text x="${sx - 8}" y="${y(v) + 4}" text-anchor="end" fill="#8b95a7" font-size="11">${fmtNum(vMax - vMin > 8 ? Math.round(v) : Math.round(v * 10) / 10)}</text>`;
  }
  const dataBreve = t => new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  const linea = punti.map((p, k) => `${k ? 'L' : 'M'}${x(ts[k]).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const ultimo = punti[punti.length - 1];
  return `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento in ${unita}">
      ${griglia}
      <text x="${sx}" y="${H - 8}" fill="#8b95a7" font-size="11">${dataBreve(ts[0])}</text>
      ${punti.length > 1 ? `<text x="${W - dx}" y="${H - 8}" text-anchor="end" fill="#8b95a7" font-size="11">${dataBreve(ts[ts.length - 1])}</text>` : ''}
      <path d="${linea}" fill="none" stroke="#4cc38a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${punti.map((p, k) => `<circle cx="${x(ts[k]).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="#0e1116" stroke="#4cc38a" stroke-width="1.8"><title>${dataBreve(ts[k])}: ${fmtNum(p.v)} ${unita}</title></circle>`).join('')}
      <text x="${x(ts[ts.length - 1]).toFixed(1)}" y="${(y(ultimo.v) - 10).toFixed(1)}" text-anchor="end" fill="#e8ecf2" font-size="12" font-weight="700">${fmtNum(ultimo.v)}</text>
    </svg>`;
}

function renderStorico() {
  if (!dati.sedute.length) {
    contenuto.innerHTML = '<p class="vuoto">Nessuna seduta salvata. Completa il primo allenamento per vedere qui lo storico e i grafici.</p>';
    return;
  }
  const nomi = nomiEsercizi();
  if (!statoGrafico.esercizio || !nomi.some(([k]) => k === statoGrafico.esercizio)) statoGrafico.esercizio = nomi[0]?.[0] ?? null;
  const metrica = METRICHE[statoGrafico.metrica];
  const punti = statoGrafico.esercizio ? puntiGrafico(statoGrafico.esercizio, statoGrafico.metrica) : [];
  const record = punti.reduce((m, p) => (!m || p.v > m.v ? p : m), null);
  const sedute = [...dati.sedute].reverse();

  contenuto.innerHTML = `
    <section class="card">
      <h3>Andamento</h3>
      <label class="campo">
        <span>Esercizio</span>
        <select data-campo="grafico-esercizio">
          ${nomi.map(([k, n]) => `<option value="${esc(k)}"${k === statoGrafico.esercizio ? ' selected' : ''}>${esc(n)}</option>`).join('')}
        </select>
      </label>
      <div class="segmenti">
        ${Object.entries(METRICHE).map(([k, m]) => `<button data-azione="metrica" data-metrica="${k}" class="${k === statoGrafico.metrica ? 'attiva' : ''}">${m.nome}</button>`).join('')}
      </div>
      <div class="grafico">${svgGrafico(punti, metrica.unita)}</div>
      ${record && record.v ? `<div class="record">Migliore: <b>${fmtNum(record.v)} ${metrica.unita}</b> il ${esc(fmtData(record.data))} · ${punti.length} sedute</div>` : ''}
    </section>

    <h3 class="sezione">Sedute (${sedute.length})</h3>
    ${sedute.map(sd => {
      const nSerie = sd.esercizi.reduce((n, e) => n + e.serie.length, 0);
      const durata = sd.fine ? Math.round((new Date(sd.fine) - new Date(sd.inizio)) / 60000) : null;
      return `
      <details class="card seduta">
        <summary>
          <span><b>${esc(sd.giorno)}</b> <span class="muto">· ${esc(fmtData(sd.inizio))}</span></span>
          <span class="muto piccolo">${nSerie} serie${durata ? ' · ' + durata + "'" : ''}</span>
        </summary>
        <div class="seduta-dettaglio">
          ${sd.esercizi.map(e => `
            <div>${esc(e.nome)}
              <span class="muto">${e.serie.length ? esc(e.serie.map(fmtSerie).join(', ')) : 'non eseguito'}</span>
            </div>`).join('')}
          ${sd.note ? `<div><span class="muto">Note:</span> ${esc(sd.note)}</div>` : ''}
        </div>
        <div class="riga-bottoni">
          <button class="btn testo pericolo" data-azione="elimina-seduta" data-id="${esc(sd.id)}">Elimina seduta</button>
        </div>
      </details>`;
    }).join('')}
    <p class="muto piccolo">Formato: kg×ripetizioni · m = margine dichiarato.</p>`;
}

// ---------- Dati: export, import, backup ----------

const ESEMPIO_FORMATO = {
  formato: 'scheda-palestra',
  versione: 1,
  nome: 'Nome della scheda',
  dataInizio: 'AAAA-MM-GG',
  regoleProgressione: ['frase 1', 'frase 2'],
  giorni: [{
    nome: 'Upper A',
    giornoSettimana: 'Lunedì',
    esercizi: [
      { nome: 'Panca piana bilanciere', serie: 4, ripetizioni: '6', kg: 80, buffer: 3, recupero: 180 },
      { nome: 'Trazioni a cluster', serie: 5, ripetizioni: '2', ripetizioniPerSerie: [3, 2, 2, 2, 3], recupero: 120, note: 'Mai a cedimento' },
      { nome: 'Alzate laterali al cavo', serie: 4, ripetizioni: '15-20', recupero: 90, superserie: 'A' },
      { nome: 'Face pull', serie: 4, ripetizioni: '15-20', recupero: 90, superserie: 'A' }
    ]
  }]
};

function testoPerClaude(settimane) {
  const s = dati.scheda;
  const r = [];
  r.push(`DATI DI ALLENAMENTO (esportati dall'app Scheda Palestra il ${fmtDataLunga(new Date())})`);
  r.push('');
  r.push(`== SCHEDA ATTUALE: ${s.nome} (in uso dal ${s.dataInizio}) ==`);
  r.push('Notazione: serie×ripetizioni, B = buffer (ripetizioni di margine), rec = recupero, SS = superserie.');
  s.giorni.forEach(g => {
    r.push('');
    r.push(`${g.giornoSettimana ? g.giornoSettimana + ' – ' : ''}${g.nome}`);
    g.esercizi.forEach(e => r.push(`- ${e.superserie ? '[SS ' + e.superserie + '] ' : ''}${e.nome}: ${descrTarget(e)}${e.note ? ' (' + e.note + ')' : ''}`));
  });
  if (s.regoleProgressione.length) {
    r.push('');
    r.push('Regole di progressione:');
    s.regoleProgressione.forEach(x => r.push('- ' + x));
  }

  const limite = settimane ? Date.now() - settimane * 7 * 86400000 : 0;
  const sedute = dati.sedute.filter(sd => +new Date(sd.inizio) >= limite);
  r.push('');
  r.push(`== SEDUTE ${settimane ? 'DELLE ULTIME ' + settimane + ' SETTIMANE' : '(TUTTE)'}: ${sedute.length} ==`);
  r.push('Formato serie: kg×ripetizioni; "m2" = 2 ripetizioni di margine dichiarate; solo il numero = corpo libero.');
  if (!sedute.length) r.push('(nessuna seduta registrata nel periodo)');
  sedute.forEach(sd => {
    const durata = sd.fine ? ` (${Math.round((new Date(sd.fine) - new Date(sd.inizio)) / 60000)} min)` : '';
    r.push('');
    r.push(`${fmtDataLunga(sd.inizio)} – ${sd.giorno}${durata}`);
    sd.esercizi.forEach(e => {
      const obiettivo = e.target ? ` [obiettivo ${descrTarget(e.target)}]` : '';
      r.push(`- ${e.nome}: ${e.serie.length ? e.serie.map(fmtSerie).join(', ') : 'non eseguito'}${obiettivo}`);
    });
    if (sd.note) r.push(`  Note: ${sd.note}`);
  });

  r.push('');
  r.push('== FORMATO PER UNA NUOVA SCHEDA ==');
  r.push("Se aggiorni la scheda, rispondi con un unico blocco JSON in questo formato (l'app lo importa così com'è):");
  r.push(JSON.stringify(ESEMPIO_FORMATO, null, 2));
  r.push('Campi degli esercizi: nome e serie (intero) e ripetizioni (testo, "6" o "15-20") obbligatori;');
  r.push('kg = peso di lavoro da usare (facoltativo); ripetizioniPerSerie = un numero per ogni serie, se cambiano; buffer = ripetizioni di margine;');
  r.push('recupero = secondi (numero) oppure intervallo "60-90"; superserie = stessa lettera su esercizi consecutivi da alternare;');
  r.push('incremento = kg da aggiungere quando si progredisce (predefinito 2.5); note = testo libero.');
  r.push('Mantieni identici i nomi degli esercizi che restano, così lo storico e i grafici restano collegati.');
  return r.join('\n');
}

function renderDati() {
  const imp = dati.impostazioni;
  contenuto.innerHTML = `
    ${dati.scheda ? `
    <section class="card">
      <h3>Esporta per Claude</h3>
      <p class="muto piccolo">Testo con la scheda attuale e le ultime sedute. Copialo, incollalo nella chat di Claude e chiedi di aggiornare la scheda.</p>
      <label class="campo">
        <span>Periodo</span>
        <select data-campo="export-settimane">
          ${[[2, 'Ultime 2 settimane'], [4, 'Ultime 4 settimane'], [8, 'Ultime 8 settimane'], [0, 'Tutte le sedute']]
            .map(([v, t]) => `<option value="${v}"${v === settimaneExport ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
      </label>
      <textarea id="testo-export" class="mono" rows="8" readonly>${esc(testoPerClaude(settimaneExport))}</textarea>
      <div class="riga-bottoni">
        <button class="btn primario" data-azione="copia-export">Copia</button>
        ${navigator.share ? '<button class="btn" data-azione="condividi-export">Condividi</button>' : ''}
      </div>
    </section>` : ''}

    <section class="card">
      <h3>Importa nuova scheda</h3>
      <p class="muto piccolo">Incolla il JSON che ti ha dato Claude (va bene anche il messaggio intero), oppure scegli un file .json. Lo storico non viene toccato e la scheda attuale viene archiviata.</p>
      <textarea id="testo-import" class="mono" rows="5" placeholder='{ "formato": "scheda-palestra", … }'></textarea>
      <div class="riga-bottoni">
        <button class="btn primario" data-azione="controlla-import">Controlla</button>
        <label class="btn">Scegli file<input type="file" accept=".json,application/json,text/plain" data-campo="file-import" hidden></label>
      </div>
      <div id="anteprima-import"></div>
    </section>

    <section class="card">
      <h3>Backup completo</h3>
      <p class="muto piccolo">Salva in un file tutto: scheda, schede precedenti e storico. Conservalo su Google Drive: i dati dell'app vivono solo su questo telefono.
      ${imp.ultimoBackup ? `<br>Ultimo backup: ${esc(fmtData(imp.ultimoBackup))}.` : '<br>Nessun backup ancora.'}</p>
      <div class="riga-bottoni">
        <button class="btn primario" data-azione="scarica-backup">Salva backup</button>
        <label class="btn">Ripristina…<input type="file" accept=".json,application/json" data-campo="file-backup" hidden></label>
      </div>
    </section>

    <section class="card">
      <h3>Avviso di fine recupero</h3>
      <label class="spunta-campo"><input type="checkbox" data-campo="suono"${imp.suono ? ' checked' : ''}> Suono</label>
      <label class="spunta-campo"><input type="checkbox" data-campo="vibrazione"${imp.vibrazione ? ' checked' : ''}> Vibrazione</label>
      <div class="riga-bottoni"><button class="btn" data-azione="prova-avviso">Prova l'avviso</button></div>
      <p class="muto piccolo">Durante la seduta lo schermo resta acceso, così il timer suona anche se appoggi il telefono.</p>
    </section>

    <p class="muto piccolo">Scheda Palestra ${VERSIONE_APP} · ${dati.sedute.length} sedute salvate · ${dati.schedePrecedenti.length} schede archiviate.</p>`;
}

async function copiaTesto(testo) {
  try {
    await navigator.clipboard.writeText(testo);
  } catch (e) {
    const area = $('#testo-export');
    area.select();
    document.execCommand('copy');
  }
  toast('Testo copiato. Incollalo nella chat di Claude.');
}

function controllaImport(testo) {
  const box = $('#anteprima-import');
  schedaInAttesa = null;
  try {
    const s = validaScheda(estraiJSON(testo));
    schedaInAttesa = s;
    box.innerHTML = `
      <div class="nota" style="margin-top:12px">
        <b>${esc(s.nome)}</b> · dal ${esc(s.dataInizio)}<br>
        ${s.giorni.map(g => `${esc(g.giornoSettimana ? g.giornoSettimana + ' – ' : '')}${esc(g.nome)}: ${g.esercizi.length} esercizi`).join('<br>')}
      </div>
      <div class="riga-bottoni"><button class="btn primario" data-azione="conferma-import">Sostituisci la scheda attuale</button></div>`;
  } catch (e) {
    box.innerHTML = `<div class="nota" style="margin-top:12px;color:var(--pericolo);white-space:pre-line">${esc(e.message)}</div>`;
  }
}

function confermaImport() {
  if (!schedaInAttesa) return;
  if (dati.scheda) dati.schedePrecedenti.push({ ...dati.scheda, sostituitaIl: new Date().toISOString() });
  dati.scheda = schedaInAttesa;
  schedaInAttesa = null;
  salva();
  toast(dati.sedutaInCorso
    ? 'Nuova scheda importata. La seduta in corso continua con gli obiettivi di prima.'
    : 'Nuova scheda importata.');
  vai('scheda');
}

function scaricaBackup() {
  const contenutoFile = JSON.stringify({
    formato: 'backup-palestra',
    versione: 1,
    esportatoIl: new Date().toISOString(),
    dati: { ...dati, sedutaInCorso: null }
  }, null, 1);
  const nome = `backup-palestra-${dataISO(new Date())}.json`;
  const file = new File([contenutoFile], nome, { type: 'application/json' });

  const fatto = () => {
    dati.impostazioni.ultimoBackup = new Date().toISOString();
    salva();
    render();
  };

  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: nome })
      .then(() => { fatto(); toast('Backup condiviso.'); })
      .catch(e => { if (e.name !== 'AbortError') scaricaFile(file, nome, fatto); });
  } else {
    scaricaFile(file, nome, fatto);
  }
}

function scaricaFile(blob, nome, fatto) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  fatto();
  toast(`Backup salvato in Download: ${nome}`);
}

async function ripristinaBackup(testo) {
  let o;
  try { o = JSON.parse(testo); } catch (e) { toast('Il file non è un JSON valido.', true); return; }
  if (o?.formato !== 'backup-palestra' || !o.dati) {
    toast('Questo non è un file di backup di Scheda Palestra.', true);
    return;
  }
  const d = o.dati;
  const n = Array.isArray(d.sedute) ? d.sedute.length : 0;
  if (!await chiedi(`Ripristinare il backup del ${fmtData(o.esportatoIl)} (${n} sedute)? I dati attuali saranno sostituiti.`, 'Ripristina', true)) return;
  fermaTimer();
  rilasciaWakeLock();
  dati = Object.assign(datiVuoti(), d, { sedutaInCorso: null });
  dati.impostazioni = Object.assign(datiVuoti().impostazioni, d.impostazioni);
  salva();
  toast('Backup ripristinato.');
  vai('allena');
}

// ===================== Eventi =====================

const azioni = {
  inizia: b => iniziaSeduta(Number(b.dataset.giorno)),
  spunta: b => spunta(Number(b.dataset.i), Number(b.dataset.j)),
  termina: () => terminaSeduta(),
  'annulla-seduta': () => annullaSeduta(),
  metrica: b => { statoGrafico.metrica = b.dataset.metrica; render(); },
  'elimina-seduta': async b => {
    if (!await chiedi('Eliminare questa seduta dallo storico?', 'Elimina', true)) return;
    dati.sedute = dati.sedute.filter(sd => sd.id !== b.dataset.id);
    salva();
    render();
  },
  'copia-export': () => copiaTesto($('#testo-export').value),
  'condividi-export': () => navigator.share({ text: $('#testo-export').value }).catch(() => {}),
  'controlla-import': () => controllaImport($('#testo-import').value),
  'conferma-import': () => confermaImport(),
  'scarica-backup': () => scaricaBackup(),
  'prova-avviso': () => { suona(); vibra(); },
  'modifica-scheda': () => { bozza = bozzaDa(dati.scheda); render(); window.scrollTo(0, 0); },
  'ed-apri': b => {
    const e = bozza.giorni[b.dataset.g].esercizi[b.dataset.e];
    e.aperto = !e.aperto;
    render();
  },
  'ed-agg-es': b => {
    const lista = bozza.giorni[b.dataset.g].esercizi;
    lista.push(nuovoEsercizioBozza());
    render();
    const id = `ed-${b.dataset.g}-${lista.length - 1}`;
    document.getElementById(id)?.scrollIntoView({ block: 'center' });
    document.querySelector(`#${id} input`)?.focus();
  },
  'ed-sposta-es': b => {
    sposta(bozza.giorni[b.dataset.g].esercizi, Number(b.dataset.e), Number(b.dataset.d));
    render();
    document.getElementById(`ed-${b.dataset.g}-${Number(b.dataset.e) + Number(b.dataset.d)}`)?.scrollIntoView({ block: 'center' });
  },
  'ed-elimina-es': async b => {
    const e = bozza.giorni[b.dataset.g].esercizi[b.dataset.e];
    if (!await chiedi(`Eliminare «${e.nome || 'Nuovo esercizio'}» dalla scheda? Lo storico resta.`, 'Elimina', true)) return;
    bozza.giorni[b.dataset.g].esercizi.splice(b.dataset.e, 1);
    render();
  },
  'ed-agg-g': () => {
    bozza.giorni.push({ nome: 'Nuovo giorno', giornoSettimana: '', note: '', esercizi: [nuovoEsercizioBozza()] });
    render();
    contenuto.querySelectorAll('.ed-giorno')[bozza.giorni.length - 1]?.scrollIntoView({ block: 'start' });
  },
  'ed-sposta-g': b => { sposta(bozza.giorni, Number(b.dataset.g), Number(b.dataset.d)); render(); },
  'ed-elimina-g': async b => {
    const g = bozza.giorni[b.dataset.g];
    if (!await chiedi(`Eliminare il giorno «${g.nome}» con tutti i suoi esercizi? Lo storico resta.`, 'Elimina', true)) return;
    bozza.giorni.splice(b.dataset.g, 1);
    render();
  },
  'ed-annulla': async () => {
    if (!await chiedi('Uscire senza salvare le modifiche alla scheda?', 'Esci senza salvare', true)) return;
    bozza = null;
    render();
    window.scrollTo(0, 0);
  },
  'ed-salva': () => salvaBozza()
};

document.addEventListener('pointerdown', sbloccaAudio, { passive: true });

document.addEventListener('click', e => {
  const d = e.target.closest('[data-dialogo]');
  if (d) { chiudiDialogo(d.dataset.dialogo === 'si'); return; }
  if (e.target.id === 'dialogo') { chiudiDialogo(false); return; }
  const tab = e.target.closest('[data-vista]');
  if (tab) { vai(tab.dataset.vista); return; }
  const t = e.target.closest('[data-timer]');
  if (t) { azioneTimer(t.dataset.timer); return; }
  const b = e.target.closest('[data-azione]');
  if (b && azioni[b.dataset.azione]) azioni[b.dataset.azione](b);
});

document.addEventListener('input', e => {
  const el = e.target;
  const sd = dati.sedutaInCorso;
  if (el.dataset.ed && bozza) {
    impostaBozza(el.dataset.ed, el.type === 'checkbox' ? el.checked : el.value);
    if (el.type === 'checkbox') render();
  } else if (el.dataset.k && sd) {
    sd.esercizi[el.dataset.i].serie[el.dataset.j][el.dataset.k] = el.value;
    salva();
  } else if (el.dataset.campo === 'note-seduta' && sd) {
    sd.note = el.value;
    salva();
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  const campo = el.dataset.campo;
  if (campo === 'grafico-esercizio') { statoGrafico.esercizio = el.value; render(); }
  else if (campo === 'export-settimane') { settimaneExport = Number(el.value); $('#testo-export').value = testoPerClaude(settimaneExport); }
  else if (campo === 'suono' || campo === 'vibrazione') { dati.impostazioni[campo] = el.checked; salva(); }
  else if ((campo === 'file-import' || campo === 'file-backup') && el.files[0]) {
    el.files[0].text().then(testo => {
      if (campo === 'file-import') { $('#testo-import').value = testo; controllaImport(testo); }
      else ripristinaBackup(testo);
      el.value = '';
    });
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (dati.sedutaInCorso) richiediWakeLock();
  tick();
});

setInterval(tick, 250);

// ===================== Avvio =====================

async function avvia() {
  if (!dati.scheda) {
    try {
      const r = await fetch('scheda-iniziale.json');
      dati.scheda = validaScheda(await r.json());
      salva();
    } catch (e) {
      toast('Impossibile caricare la scheda iniziale: ' + e.message, true);
    }
  }
  // Un recupero scaduto mentre l'app era chiusa non va riproposto.
  const t = dati.sedutaInCorso?.timer;
  if (t && t.fine < Date.now()) dati.sedutaInCorso.timer = null;
  if (dati.sedutaInCorso) richiediWakeLock();
  render();

  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

avvia();
