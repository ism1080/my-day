'use strict';

/* =====================================================================
   MY DAY — petite app de routine. Un seul fichier de logique.
   Les données vivent dans localStorage (clé STORAGE_KEY).
   ===================================================================== */

const STORAGE_KEY = 'myday.v1';
const XP_PER_LEVEL = 150;   // XP nécessaires pour monter d'un niveau
const PRAYER_XP = 10;
const CHECK_XP = 10;

const CATS = {
  deen:  { icon: '🕌', name: 'Deen',             short: 'Deen' },
  work:  { icon: '💼', name: 'Travail / argent', short: 'Travail' },
  skill: { icon: '🧠', name: 'Skill / projet',   short: 'Skill' },
  body:  { icon: '🏃', name: 'Corps',            short: 'Corps' },
  life:  { icon: '🏠', name: 'Vie perso',        short: 'Vie perso' },
};

const PRAYERS = [
  { id: 'fajr',    name: 'Fajr' },
  { id: 'dhuhr',   name: 'Dhuhr' },
  { id: 'asr',     name: 'Asr' },
  { id: 'maghrib', name: 'Maghrib' },
  { id: 'isha',    name: 'Isha' },
];

// Niveaux d'une mission. Les XP sont cumulés : passer de "min" à "normal" donne +10, pas +20.
const LEVELS = [
  { key: 'min',    label: '10 min',  xp: 10 },
  { key: 'normal', label: '30 min',  xp: 20 },
  { key: 'deep',   label: '60 min+', xp: 30 },
];
const LEVEL_INDEX = { min: 0, normal: 1, deep: 2 };

const DEFAULT_SETTINGS = {
  prayers: { fajr: '05:15', dhuhr: '13:42', asr: '17:15', maghrib: '20:12', isha: '22:07' },
  margin: 20,          // minutes avant l'heure où la prière est mise en avant
  dayStart: '04:00',   // avant cette heure, on est encore "hier" (utile si tu te couches tard)
  tasks: [
    { id: 'work',  cat: 'work',  type: 'mission', name: 'Travail / avenir',  hint: 'Une action concrète : démarche, candidature, appel, dossier.' },
    { id: 'skill', cat: 'skill', type: 'mission', name: 'Skill / projet',    hint: 'Apprendre ou avancer sur un projet.' },
    { id: 'body',  cat: 'body',  type: 'mission', name: 'Corps / extérieur', hint: 'Marcher, bouger, sortir.' },
    { id: 'tidy',  cat: 'life',  type: 'check',   name: 'Ranger 5 minutes' },
    { id: 'sleep', cat: 'life',  type: 'check',   name: 'Au lit avant 00:00' },
  ],
};

const LINES = [
  'Pas besoin d\'avoir envie. Juste 10 minutes.',
  'Tu ne choisis pas ton humeur. Tu choisis ce que tu fais.',
  'Une petite journée réussie est une journée réussie.',
  'Commence mal, mais commence.',
  'Le prochain pas suffit.',
  'En retard ? Non. Tu commences maintenant.',
  'Fais-le court, fais-le moche, mais fais-le.',
];

/* ===== État ===== */
let state = load();
let view = 'home';
let overlay = null;      // { type: 'nope' | 'close' }
let audioCtx = null;
let toastTimer = null;

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* données illisibles → repart de zéro */ }
  if (!s || typeof s !== 'object') s = { settings: structuredClone(DEFAULT_SETTINGS), days: {}, totalXp: 0, timer: null };
  s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings);
  s.settings.prayers = Object.assign({}, DEFAULT_SETTINGS.prayers, s.settings.prayers);
  if (!Array.isArray(s.settings.tasks)) s.settings.tasks = structuredClone(DEFAULT_SETTINGS.tasks);
  s.days = s.days || {};
  s.totalXp = s.totalXp || 0;
  for (const d of Object.values(s.days)) { d.awarded = d.awarded || {}; d.prayers = d.prayers || {}; d.tasks = d.tasks || {}; }
  return s;
}
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* stockage plein ou bloqué */ } }

/* ===== Utilitaires ===== */
const pad = n => String(n).padStart(2, '0');
function h(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function uid() { return 't' + Math.random().toString(36).slice(2, 8); }
function hashKey(k) { let x = 0; for (const c of k) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; }
function toMin(hhmm) { const [hh, mm] = String(hhmm || '00:00').split(':').map(Number); return (hh || 0) * 60 + (mm || 0); }
function nowMin(d = new Date()) { return d.getHours() * 60 + d.getMinutes(); }
function dateToKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function keyToDate(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function todayKey() { return dateToKey(new Date(Date.now() - toMin(state.settings.dayStart) * 60000)); }
function addDays(k, n) { const d = keyToDate(k); d.setDate(d.getDate() + n); return dateToKey(d); }
function fmtDuration(min) { if (min < 60) return min + ' min'; const hh = Math.floor(min / 60), mm = min % 60; return mm ? `${hh}h${pad(mm)}` : `${hh}h`; }
function fmtCountdown(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
function fmtClock(ts) { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

function missions() { return state.settings.tasks.filter(t => t.type === 'mission'); }
function checks() { return state.settings.tasks.filter(t => t.type === 'check'); }
function taskById(id) { return state.settings.tasks.find(t => t.id === id); }

function getDay(k = todayKey()) {
  let d = state.days[k];
  if (!d) d = state.days[k] = { prayers: {}, tasks: {}, awarded: {}, xp: 0, startedAt: null, closed: false, success: false };
  return d;
}

function levelInfo() {
  const level = Math.floor(state.totalXp / XP_PER_LEVEL) + 1;
  return { level, into: state.totalXp % XP_PER_LEVEL, need: XP_PER_LEVEL };
}

// Le "minimum du jour" = les 5 prières + chaque mission au moins au niveau 10 min.
function minimumProgress(day) {
  const ms = missions();
  const total = PRAYERS.length + ms.length;
  const done = PRAYERS.filter(p => day.prayers[p.id]).length + ms.filter(t => day.tasks[t.id]).length;
  return { done, total };
}

// Une fois réussie, une journée le reste (on ne retire jamais rien).
function checkSuccess(day) {
  if (day.success) return;
  const { done, total } = minimumProgress(day);
  if (total > 0 && done === total) { day.success = true; toast('Minimum du jour atteint. Journée réussie. 🔥', 4000); }
}

function streakInfo() {
  const t = todayKey();
  let streak = 0, k = state.days[t]?.success ? t : addDays(t, -1);
  while (state.days[k]?.success) { streak++; k = addDays(k, -1); }
  const keys = Object.keys(state.days).filter(x => state.days[x].success).sort();
  let best = 0, run = 0, prev = null;
  for (const x of keys) { run = (prev && addDays(prev, 1) === x) ? run + 1 : 1; best = Math.max(best, run); prev = x; }
  return { streak, best, successDays: keys.length };
}

/* ===== Prières & bloc du moment ===== */
function prayerSeq() { return PRAYERS.map(p => ({ ...p, time: state.settings.prayers[p.id], min: toMin(state.settings.prayers[p.id]) })); }

function prayerStatus(day, now = new Date()) {
  const seq = prayerSeq(), n = nowMin(now), margin = +state.settings.margin || 0, dayStart = toMin(state.settings.dayStart);
  return seq.map((p, i) => {
    const next = seq[i + 1];
    let cls = '';
    if (day.prayers[p.id]) cls = 'done';
    else if (i === seq.length - 1 ? (n >= p.min || n < dayStart) : (n >= p.min && n < next.min)) cls = 'now';
    else if (n < p.min && p.min - n <= margin) cls = 'soon';
    return { ...p, cls };
  });
}

function nextPrayer(now = new Date()) {
  const seq = prayerSeq(), n = nowMin(now);
  let next = seq.find(p => p.min > n), tomorrow = false;
  if (!next) { next = seq[0]; tomorrow = true; }
  return { ...next, inMin: tomorrow ? 1440 - n + next.min : next.min - n };
}
function nextPrayerText() { const p = nextPrayer(); return `${p.name} à ${p.time} · dans ${fmtDuration(p.inMin)}`; }

function currentBlock(now = new Date()) {
  const s = prayerSeq(), n = nowMin(now), dayStart = toMin(state.settings.dayStart);
  if (n >= dayStart && n < s[0].min) return { title: 'Nuit', text: 'Repos. Fajr à ' + s[0].time + '.' };
  if (n >= s[0].min && n < s[1].min) return { title: 'Matin', text: 'Commence la journée. Choisis une mission, même petite.', cat: 'work' };
  if (n >= s[1].min && n < s[2].min) return { title: 'Après Dhuhr', text: 'Bloc travail / avenir.', cat: 'work' };
  if (n >= s[2].min && n < s[3].min) return { title: 'Après Asr', text: 'Mouvement / extérieur.', cat: 'body' };
  if (n >= s[3].min && n < s[4].min) return { title: 'Après Maghrib', text: 'Temps perso, famille, détente.', cat: 'skill' };
  return { title: 'Après Isha', text: 'Ferme la journée. Prépare le sommeil.', close: true };
}

/* ===== Actions ===== */
// Donne des XP pour un élément, sans jamais en donner deux fois pour la même chose.
function grant(day, key, targetXp, label) {
  const diff = targetXp - (day.awarded[key] || 0);
  if (diff > 0) { day.awarded[key] = targetXp; day.xp += diff; state.totalXp += diff; toast(`${label} · +${diff} XP`); }
  else toast(label);
}
function togglePrayer(id) {
  const day = getDay(), name = PRAYERS.find(p => p.id === id).name;
  if (day.prayers[id]) { delete day.prayers[id]; toast(`${name} retirée. Tes XP restent.`); }
  else { day.prayers[id] = true; grant(day, 'prayer:' + id, PRAYER_XP, name + ' ✓'); }
  checkSuccess(day); save(); render();
}
function setLevel(id, level) {
  const day = getDay(), task = taskById(id);
  if (!task || !(level in LEVEL_INDEX)) return;
  if (day.tasks[id] === level) { delete day.tasks[id]; toast('Retiré. Tes XP restent.'); }
  else { day.tasks[id] = level; grant(day, 'task:' + id, LEVELS[LEVEL_INDEX[level]].xp, task.name + ' ✓'); }
  checkSuccess(day); save(); render();
}
function toggleCheck(id) {
  const day = getDay(), task = taskById(id);
  if (!task) return;
  if (day.tasks[id]) { delete day.tasks[id]; toast('Retiré. Tes XP restent.'); }
  else { day.tasks[id] = 'done'; grant(day, 'task:' + id, CHECK_XP, task.name + ' ✓'); }
  save(); render();
}

// Prochaine étape d'une mission : 10 min → min, +20 → normal, +30 → deep.
function nextStep(task, day) {
  if (!task || task.type !== 'mission') return null;
  const cur = day.tasks[task.id];
  if (!cur) return { level: 'min', minutes: 10, label: '10 min', gain: 10 };
  if (cur === 'min') return { level: 'normal', minutes: 20, label: '+20 min', gain: 10 };
  if (cur === 'normal') return { level: 'deep', minutes: 30, label: '+30 min', gain: 10 };
  return null;
}
function startTimer(id) {
  const task = taskById(id), dayKey = todayKey(), day = getDay(dayKey), step = nextStep(task, day);
  if (!step) return;
  ensureAudio();
  state.timer = { taskId: id, dayKey, level: step.level, minutes: step.minutes, endAt: Date.now() + step.minutes * 60000, finished: false, gained: 0 };
  overlay = null; save(); render();
}
function stopTimer() { state.timer = null; save(); render(); toast('Pas grave. Le bouton est toujours là.'); }
function finishTimer() {
  const t = state.timer;
  if (!t || t.finished) return;
  t.finished = true;
  const day = getDay(t.dayKey), task = taskById(t.taskId);
  if (task) {
    const target = LEVELS[LEVEL_INDEX[t.level]].xp, got = day.awarded['task:' + task.id] || 0;
    if (!day.tasks[task.id] || LEVEL_INDEX[day.tasks[task.id]] < LEVEL_INDEX[t.level]) day.tasks[task.id] = t.level;
    t.gained = Math.max(0, target - got);
    if (t.gained) { day.awarded['task:' + task.id] = target; day.xp += t.gained; state.totalXp += t.gained; }
  }
  checkSuccess(day); save(); beep(); render();
}
function dismissTimer() { state.timer = null; save(); render(); }

function closeDay() { getDay().closed = true; overlay = { type: 'close' }; save(); render(); }
function reopenDay() { getDay().closed = false; save(); render(); }

/* ===== Son (un simple bip, pas de mélodie) ===== */
function ensureAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* pas d'audio dispo */ }
}
function beep() {
  try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) { /* ignore */ }
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [0, 0.3, 0.6].forEach(t => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + t);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.2);
      o.connect(g).connect(audioCtx.destination); o.start(t0 + t); o.stop(t0 + t + 0.22);
    });
  } catch (e) { /* ignore */ }
}

/* ===== Toast ===== */
function toast(msg, ms = 2400) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ===== Rendu ===== */
function ring(pct, size, stroke) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - Math.min(1, Math.max(0, pct)))).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = view === 'home' ? renderHome() : view === 'progress' ? renderProgress() : renderSettings();
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  renderOverlay();
}

function renderHome() {
  const key = todayKey(), day = getDay(key), now = new Date();
  if (!day.startedAt) { day.startedAt = Date.now(); save(); }
  const dateStr = now.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  const { streak } = streakInfo(), lvl = levelInfo();
  const { done, total } = minimumProgress(day);
  const block = currentBlock(now);
  const line = LINES[hashKey(key) % LINES.length];

  let out = `
  <header class="top">
    <div>
      <div class="date">${h(dateStr)}</div>
      <div class="sub">Démarrée à ${fmtClock(day.startedAt)} · Niveau ${lvl.level}</div>
    </div>
    <div class="stats"><span class="chip">${state.totalXp} XP</span><span class="chip">🔥 ${streak}</span></div>
  </header>
  <p class="line">${h(line)}</p>`;

  if (day.closed) {
    out += `<section class="card block closed-banner">
      <div class="block-title">Journée fermée</div>
      <div class="block-text">Repose-toi. Fajr à ${h(state.settings.prayers.fajr)}.</div>
      <button class="block-btn" data-action="reopenDay">Rouvrir la journée</button>
    </section>`;
  }

  out += `
  <section class="card ring-card">
    <div class="ring-wrap">${ring(total ? done / total : 0, 84, 9)}<div class="ring-label">${done}/${total}</div></div>
    <div class="ring-text">
      <b>${day.success ? 'Minimum atteint ✓' : 'Minimum du jour'}</b>
      <span>${day.xp} XP aujourd'hui${day.success ? ' · <span class="ok">journée réussie</span>' : ''}</span>
    </div>
  </section>

  <button class="big-nope" data-action="nope">JE N'AI PAS ENVIE</button>`;

  // Bloc du moment
  let blockBtn = '';
  if (block.cat) {
    const t = missions().find(m => m.cat === block.cat && nextStep(m, day)) || missions().find(m => nextStep(m, day));
    if (t) { const s = nextStep(t, day); blockBtn = `<button class="block-btn" data-action="timer" data-id="${h(t.id)}">▶ ${s.label} de ${h(t.name)}</button>`; }
  } else if (block.close && !day.closed) {
    blockBtn = `<button class="block-btn" data-action="closeDay">Fermer la journée</button>`;
  }
  out += `
  <section class="card block">
    <div class="block-title">${h(block.title)}</div>
    <div class="block-text">${h(block.text)}</div>
    <div class="block-next" id="next-prayer">${h(nextPrayerText())}</div>
    ${blockBtn}
  </section>`;

  // Missions
  out += `<h2>Missions</h2>`;
  const ms = missions();
  if (!ms.length) out += `<section class="card"><p class="fine">Aucune mission. Ajoute-en dans Réglages.</p></section>`;
  for (const t of ms) {
    const cur = day.tasks[t.id], ci = cur ? LEVEL_INDEX[cur] : -1, step = nextStep(t, day);
    const xp = cur ? LEVELS[ci].xp : 0;
    out += `
    <section class="card mission${cur ? ' done' : ''}">
      <div class="m-head">
        <span class="m-icon">${CATS[t.cat]?.icon || '•'}</span>
        <div><div class="m-name">${h(t.name)}</div>${t.hint ? `<div class="m-hint">${h(t.hint)}</div>` : ''}</div>
        <span class="m-xp">${cur ? '+' + xp + ' XP' : ''}</span>
      </div>
      <div class="levels">
        ${LEVELS.map((l, i) => `<button class="lvl${i <= ci ? ' on' : ''}${i === ci ? ' cur' : ''}" data-action="level" data-id="${h(t.id)}" data-level="${l.key}">${l.label}</button>`).join('')}
      </div>
      ${step ? `<button class="m-timer" data-action="timer" data-id="${h(t.id)}">▶ Lancer ${step.label}${cur ? ' · +' + step.gain + ' XP' : ''}</button>` : ''}
    </section>`;
  }

  // Prières
  out += `<h2>Prières</h2>
  <section class="card">
    <div class="prayer-row">
      ${prayerStatus(day, now).map(p => `<button class="pr ${p.cls}" data-action="prayer" data-id="${p.id}"><span class="n">${p.name}</span><span class="t">${h(p.time)}</span><span class="k"></span></button>`).join('')}
    </div>
    <p class="fine">Les XP sont un outil pour structurer la journée. Rien de plus.</p>
  </section>`;

  // Vie perso (checks)
  const cs = checks();
  if (cs.length) {
    out += `<h2>Vie perso</h2><section class="card">
      ${cs.map(t => `<button class="check${day.tasks[t.id] ? ' on' : ''}" data-action="check" data-id="${h(t.id)}"><span class="box">${day.tasks[t.id] ? '✓' : ''}</span><span class="cn">${CATS[t.cat]?.icon || ''} ${h(t.name)}</span><span class="cx">+${CHECK_XP}</span></button>`).join('')}
    </section>`;
  }

  if (!day.closed) out += `<button class="close-day" data-action="closeDay">Fermer la journée</button>`;
  return out;
}

function renderProgress() {
  const t = todayKey(), day = getDay(t);
  const { streak, best, successDays } = streakInfo(), lvl = levelInfo();
  const { done, total } = minimumProgress(day);
  const dow = (keyToDate(t).getDay() + 6) % 7;            // 0 = lundi
  const monday = addDays(t, -dow);
  const week = [...Array(7)].map((_, i) => { const k = addDays(monday, i), d = state.days[k]; return { k, xp: d?.xp || 0, ok: !!d?.success, today: k === t }; });
  const weekXp = week.reduce((a, w) => a + w.xp, 0);
  const max = Math.max(30, ...week.map(w => w.xp));
  const labels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const grid = [...Array(28)].map((_, i) => { const k = addDays(t, i - 27), d = state.days[k]; return { k, cls: d?.success ? 'ok' : (d?.xp ? 'some' : ''), today: k === t }; });

  return `
  <h1>Progrès</h1>
  <section class="card ring-card">
    <div class="ring-wrap">${ring(total ? done / total : 0, 84, 9)}<div class="ring-label">${done}/${total}</div></div>
    <div class="ring-text"><b>Aujourd'hui</b><span>${day.xp} XP · minimum ${done}/${total}${day.success ? ' · <span class="ok">réussie</span>' : ''}</span></div>
  </section>

  <div class="kpis">
    <div class="kpi"><b>${state.totalXp}</b><span>XP total</span></div>
    <div class="kpi"><b>Niv. ${lvl.level}</b><span>${lvl.into}/${lvl.need} XP vers le niveau ${lvl.level + 1}</span><div class="bar-wrap"><i style="width:${(lvl.into / lvl.need * 100).toFixed(0)}%"></i></div></div>
    <div class="kpi"><b>🔥 ${streak}</b><span>série en cours · record ${best}</span></div>
    <div class="kpi"><b>${successDays}</b><span>jour${successDays > 1 ? 's' : ''} réussi${successDays > 1 ? 's' : ''}</span></div>
  </div>

  <h2>Cette semaine · ${weekXp} XP</h2>
  <section class="card">
    <div class="week">
      ${week.map((w, i) => `<div class="wd${w.ok ? ' ok' : (w.xp ? ' some' : '')}${w.today ? ' today' : ''}"><span class="v">${w.xp || ''}</span><div class="b" style="height:${Math.max(3, w.xp / max * 80)}px"></div><span class="l">${labels[i]}</span></div>`).join('')}
    </div>
  </section>

  <h2>28 derniers jours</h2>
  <section class="card">
    <div class="grid28">${grid.map(g => `<div class="dot ${g.cls}${g.today ? ' today' : ''}" title="${g.k}"></div>`).join('')}</div>
    <div class="legend"><span><i class="ok"></i>minimum atteint</span><span><i class="some"></i>quelques XP</span><span><i></i>rien</span></div>
  </section>
  <p class="fine">Les XP ne descendent jamais. Une mauvaise journée coupe la série, pas le total.</p>`;
}

function renderSettings() {
  const s = state.settings;
  const catOpts = sel => Object.entries(CATS).map(([k, c]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${c.icon} ${c.short}</option>`).join('');
  return `
  <h1>Réglages</h1>

  <section class="card">
    <h2 style="margin-top:0">Horaires de prière</h2>
    ${PRAYERS.map(p => `<div class="row"><label>${p.name}</label><input type="time" data-setting="prayer" data-id="${p.id}" value="${h(s.prayers[p.id])}"></div>`).join('')}
    <div class="row"><label>Mise en avant (min avant)</label><input type="number" min="0" max="120" data-setting="margin" value="${+s.margin || 0}"></div>
    <div class="row"><label>Nouvelle journée à</label><input type="time" data-setting="dayStart" value="${h(s.dayStart)}"></div>
    <p class="fine">Avant « nouvelle journée à », tu es encore sur la journée d'hier. Pratique si tu te couches après minuit.</p>
  </section>

  <section class="card">
    <h2 style="margin-top:0">Tâches</h2>
    ${s.tasks.map(t => `<div class="trow">
      <input type="text" data-task="name" data-id="${h(t.id)}" value="${h(t.name)}" placeholder="Nom de la tâche">
      <button class="del" data-action="delTask" data-id="${h(t.id)}" aria-label="Supprimer">✕</button>
      <select data-task="cat" data-id="${h(t.id)}">${catOpts(t.cat)}</select>
      <select data-task="type" data-id="${h(t.id)}"><option value="mission"${t.type === 'mission' ? ' selected' : ''}>Mission</option><option value="check"${t.type === 'check' ? ' selected' : ''}>Check</option></select>
    </div>`).join('')}
    <button class="btn ghost" data-action="addTask">+ Ajouter une tâche</button>
    <p class="fine"><b>Mission</b> = 3 paliers (10 / 30 / 60 min), compte dans le minimum du jour.<br><b>Check</b> = simple case à cocher, +${CHECK_XP} XP.</p>
  </section>

  <section class="card">
    <h2 style="margin-top:0">Sauvegarde</h2>
    <p class="fine" style="margin-top:0">Pour passer du PC au téléphone : « Copier » ici, puis coller et « Importer » sur l'autre appareil.</p>
    <button class="btn ghost" data-action="export">Copier mes données</button>
    <textarea id="dataBox" placeholder="Colle ici des données copiées depuis un autre appareil"></textarea>
    <button class="btn" data-action="import">Importer</button>
  </section>

  <section class="card">
    <button class="btn danger" data-action="reset">Tout effacer</button>
  </section>

  <p class="fine">MY DAY · données stockées uniquement sur cet appareil.</p>`;
}

function renderOverlay() {
  const ov = document.getElementById('overlay');
  let html = '';
  if (state.timer) html = state.timer.finished ? timerDoneHtml() : timerHtml();
  else if (overlay?.type === 'nope') html = nopeHtml();
  else if (overlay?.type === 'close') html = closeHtml();
  ov.innerHTML = html; ov.hidden = !html;
  document.body.classList.toggle('locked', !!html);
}

function nopeHtml() {
  const day = getDay();
  const fresh = missions().filter(t => !day.tasks[t.id]);
  const more = missions().filter(t => day.tasks[t.id] && nextStep(t, day));
  const list = fresh.length ? fresh : more;
  let title, sub;
  if (fresh.length) { title = 'Pas besoin d\'avoir envie.'; sub = 'Fais seulement 10 minutes.'; }
  else if (more.length) { title = 'Ton minimum est fait.'; sub = 'Un cran de plus ? Pas obligé.'; }
  else { title = 'Tout est fait aujourd\'hui.'; sub = 'Sérieusement. C\'est bon. Repose-toi.'; }
  return `<div class="sheet">
    <p class="big">${h(title)}</p>
    <p class="med">${h(sub)}</p>
    <div class="pick">${list.map(t => { const s = nextStep(t, day); return `<button data-action="timer" data-id="${h(t.id)}"><span>${CATS[t.cat]?.icon || ''}</span><span>${h(t.name)}</span><small>${s.label}</small></button>`; }).join('')}</div>
    <button class="link" data-action="closeOverlay">Pas maintenant</button>
  </div>`;
}

function timerHtml() {
  const t = state.timer, task = taskById(t.taskId);
  const remaining = t.endAt - Date.now(), pct = 1 - remaining / (t.minutes * 60000);
  return `<div class="sheet">
    <div class="t-task">${CATS[task?.cat]?.icon || ''} ${h(task?.name || 'Mission')}</div>
    <div class="t-ring">${ring(pct, 220, 12)}<div class="t-time" id="t-time">${fmtCountdown(remaining)}</div></div>
    <p class="t-sub">Juste ça. Rien d'autre.</p>
    <button class="link" data-action="stopTimer">Arrêter</button>
  </div>`;
}

function timerDoneHtml() {
  const t = state.timer, task = taskById(t.taskId), day = getDay(t.dayKey), step = nextStep(task, day);
  return `<div class="sheet">
    <div class="done-check">✓</div>
    <p class="big">Tu l'as fait.</p>
    <div class="gain">${t.gained ? '+' + t.gained + ' XP' : 'Déjà compté ✓'}</div>
    <div class="pick">
      ${step ? `<button data-action="continueTimer"><span>▶</span><span>Encore ${step.label}</span><small>+${step.gain} XP</small></button>` : ''}
      <button data-action="dismissTimer"><span>✓</span><span>C'est bon pour aujourd'hui</span></button>
    </div>
  </div>`;
}

function closeHtml() {
  const day = getDay(), { done, total } = minimumProgress(day);
  const doneMissions = missions().filter(t => day.tasks[t.id]);
  const prayersDone = PRAYERS.filter(p => day.prayers[p.id]).length;
  return `<div class="sheet">
    <p class="big">${day.success ? 'Journée réussie.' : 'Journée fermée.'}</p>
    <p class="med">${day.success ? 'Le minimum est fait. Le reste, c\'est du bonus.' : 'Ce qui est fait est fait. Demain est un nouveau jour.'}</p>
    <div class="recap">
      <div><span>XP aujourd'hui</span><b>+${day.xp}</b></div>
      <div><span>Prières</span><b>${prayersDone}/5</b></div>
      <div><span>Missions</span><b>${doneMissions.length}/${missions().length}</b></div>
      <div><span>Minimum</span><b>${done}/${total}</b></div>
    </div>
    <p class="fine">Fajr demain à ${h(state.settings.prayers.fajr)}. Bonne nuit.</p>
    <button class="link" data-action="closeOverlay">Fermer</button>
  </div>`;
}

/* ===== Événements ===== */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action, id = el.dataset.id;
  switch (a) {
    case 'view': view = el.dataset.view; render(); window.scrollTo(0, 0); break;
    case 'nope': overlay = { type: 'nope' }; render(); break;
    case 'closeOverlay': overlay = null; render(); break;
    case 'prayer': togglePrayer(id); break;
    case 'level': setLevel(id, el.dataset.level); break;
    case 'check': toggleCheck(id); break;
    case 'timer': startTimer(id); break;
    case 'stopTimer': stopTimer(); break;
    case 'dismissTimer': dismissTimer(); break;
    case 'continueTimer': { const tid = state.timer?.taskId; state.timer = null; if (tid) startTimer(tid); else render(); break; }
    case 'closeDay': closeDay(); break;
    case 'reopenDay': reopenDay(); break;
    case 'addTask': {
      state.settings.tasks.push({ id: uid(), cat: 'life', type: 'check', name: 'Nouvelle tâche' });
      save(); render();
      const inputs = document.querySelectorAll('[data-task="name"]'); inputs[inputs.length - 1]?.focus();
      break;
    }
    case 'delTask': {
      const t = taskById(id);
      if (t && confirm(`Supprimer « ${t.name} » ?`)) { state.settings.tasks = state.settings.tasks.filter(x => x.id !== id); save(); render(); }
      break;
    }
    case 'export': {
      const data = JSON.stringify(state), box = document.getElementById('dataBox');
      box.value = data;
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(data).then(() => toast('Copié dans le presse-papiers.'), () => { box.select(); toast('Sélectionne et copie le texte ci-dessous.'); });
      else { box.select(); toast('Sélectionne et copie le texte ci-dessous.'); }
      break;
    }
    case 'import': {
      const box = document.getElementById('dataBox');
      try {
        const s = JSON.parse(box.value);
        if (!s || typeof s !== 'object' || !s.settings || !s.days) throw new Error('format');
        if (!confirm('Remplacer toutes les données de cet appareil par celles-ci ?')) break;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        state = load(); render(); toast('Données importées.');
      } catch (e) { toast('Données non reconnues.'); }
      break;
    }
    case 'reset': {
      if (confirm('Tout effacer ? XP, historique, réglages. Irréversible.')) {
        localStorage.removeItem(STORAGE_KEY); state = load(); view = 'home'; render(); toast('Remis à zéro.');
      }
      break;
    }
  }
});

document.addEventListener('change', e => {
  const el = e.target, s = el.dataset.setting;
  if (s === 'prayer') { if (/^\d\d:\d\d$/.test(el.value)) state.settings.prayers[el.dataset.id] = el.value; }
  else if (s === 'margin') state.settings.margin = Math.max(0, Math.min(120, +el.value || 0));
  else if (s === 'dayStart') { if (/^\d\d:\d\d$/.test(el.value)) state.settings.dayStart = el.value; }
  else if (el.dataset.task) {
    const t = taskById(el.dataset.id); if (!t) return;
    if (el.dataset.task === 'name') t.name = el.value.trim() || t.name;
    else if (el.dataset.task === 'cat' && CATS[el.value]) t.cat = el.value;
    else if (el.dataset.task === 'type' && (el.value === 'mission' || el.value === 'check')) t.type = el.value;
  } else return;
  save();
});

/* ===== Horloge : timer, changement de jour, compte à rebours ===== */
let lastKey = todayKey();
setInterval(() => {
  const t = state.timer;
  if (t && !t.finished) {
    if (Date.now() >= t.endAt) finishTimer();
    else {
      const el = document.getElementById('t-time'); if (el) el.textContent = fmtCountdown(t.endAt - Date.now());
      const fg = document.querySelector('#overlay .ring-fg');
      if (fg) { const c = +fg.getAttribute('stroke-dasharray'); fg.setAttribute('stroke-dashoffset', (c * ((t.endAt - Date.now()) / (t.minutes * 60000))).toFixed(1)); }
    }
  }
  const nk = todayKey(); if (nk !== lastKey) { lastKey = nk; render(); }
  const np = document.getElementById('next-prayer');
  if (np) { const txt = nextPrayerText(); if (np.textContent !== txt) np.textContent = txt; }
}, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (state.timer && !state.timer.finished && Date.now() >= state.timer.endAt) finishTimer(); else render(); } });

/* ===== Démarrage ===== */
if (state.timer && !state.timer.finished && Date.now() >= state.timer.endAt) finishTimer();
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne non dispo, l'app marche quand même */ });
}
