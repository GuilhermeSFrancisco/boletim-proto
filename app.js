/* Boletim de câmera — prototype v4. Standalone PWA, data only on this device (localStorage).
   Every TAKE holds its own values and inherits from the take before. The DAY page holds rolls and scenes (one sheet per
   roll, like the APACERJ paper report); the TAKE page holds takes and shots. A call sheet PDF gives the day's scenes. */
'use strict';

const KEY = 'boletim-proto-v4', OLD_KEY = 'boletim-proto-v3';
// ShotSize's own colours (amber, Signal Blue, green, Machine Yellow, red, light blue, white, grey); any other can be picked
const PALETTE = ['#F28A2E', '#2E9BE6', '#3FBF7F', '#FFC91F', '#E5484D', '#9AD3F7', '#F8F8F8', '#7A7A82'];
// [value, label on the sheet, English name (screen and CSV take type)]
const TYPES = [['Take', '', 'Take'], ['Claquete', 'slate', 'Slate only'], ['Disparo', 'false', 'False start'], ['MOS', 'MOS', 'MOS'],
  ['Tail', 'tail', 'Tail slate'], ['Pickup', 'PU', 'Pickup'], ['Insert', 'ins', 'Insert'], ['VFX', 'VFX', 'VFX plate'], ['Wild', 'wild', 'Wild'], ['Test', 'test', 'Test']];
const NO_NUMBER = ['Claquete', 'Disparo', 'Wild', 'Test'];                 // these don't use up a take number
const DETAIL = ['lens', 'stop', 'filters', 'focus', 'height', 'tilt', 'fps', 'shutter', 'wb', 'iso', 'lut'];   // a change here splits the details block
const CAMSET = ['fps', 'shutter', 'wb', 'iso'];
// + Shot offers all of these in grey (nothing is saved without a tap); Repeat fills them at once
const SHOT_SUGGEST = ['fps', 'shutter', 'wb', 'iso', 'lens', 'stop', 'filters', 'focus', 'height', 'tilt', 'lut'];

const F = {
  fps:     { label: 'FPS', list: 'fps', keys: true },
  shutter: { label: 'Shutter', list: 'shutter', keys: true, suffix: '°' },
  wb:      { label: 'WB', list: 'wb', keys: true, suffix: 'K' },
  iso:     { label: 'ISO', list: 'iso', keys: true },
  scene:   { label: 'Scene', kind: 'text', list: 'scenes', ph: 'e.g. 12, 5.03, 2.17pt1' },
  shot:    { label: 'Shot', kind: 'text', ph: 'e.g. 1, 2A, posição 3' },
  lens:    { label: 'Lens', list: 'lenses', keys: true, units: ['mm'] },
  stop:    { label: 'Stop', kind: 'stop' },
  filters: { label: 'Filter', kind: 'filters' },
  focus:   { label: 'Focus', keys: true, units: ['m', 'ft', "'", '"'], range: true },
  height:  { label: 'Height', keys: true, units: ['m', 'cm'], range: true },
  tilt:    { label: 'Tilt', keys: true, units: ['°', '−'], range: true },
  lut:     { label: 'LUT', kind: 'text', list: 'luts', ph: 'LUT name' },
  tc:      { label: 'TC', keys: true, units: [':'] },
  desc:    { label: 'Shot description', kind: 'area', ph: 'What the shot is: wide, MCU, insert, tracking in…' },
  notes:   { label: 'Notes · this take', kind: 'area', ph: 'Anything else about this take' },
};
const ORDER = ['scene', 'shot', 'lens', 'stop', 'filters', 'focus', 'height', 'tilt', 'fps', 'shutter', 'wb', 'iso', 'lut', 'tc', 'desc', 'notes'];
const HIDEABLE = ['focus', 'height', 'tilt', 'lut', 'tc', 'desc', 'fps', 'shutter', 'wb', 'iso'];
const LABEL = { fps: 'fps', shutter: '°', wb: 'K' };

// Stops: cinema notation (full stop + fraction). Third-stop series for the CSV value.
const FULL = ['1', '1.4', '2', '2.8', '4', '5.6', '8', '11', '16', '22', '32'];
const THIRDS = ['1', '1.1', '1.2', '1.4', '1.6', '1.8', '2', '2.2', '2.5', '2.8', '3.2', '3.5', '4', '4.5', '5', '5.6', '6.3', '7.1',
  '8', '9', '10', '11', '13', '14', '16', '18', '20', '22', '25', '29', '32'];
const FRAC = { '¼': 0.25, '⅓': 1 / 3, '½': 0.5, '⅔': 2 / 3, '¾': 0.75 };
function stopDecimal(v) {
  if (!v) return '';
  const [base, fr] = String(v).replace(/^T/, '').split(' ');
  const i = FULL.indexOf(base);
  if (!fr) return base;
  if (i < 0 || !(fr in FRAC)) return base;
  if (fr === '⅓' || fr === '⅔') return THIRDS[i * 3 + (fr === '⅓' ? 1 : 2)] || base;
  return (Number(base) * Math.pow(2, FRAC[fr] / 2)).toFixed(1).replace(/\.0$/, '');
}

const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const uid = () => Math.random().toString(36).slice(2, 10);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);
const pad3 = n => String(n).padStart(3, '0');
const dmy = d => d.split('-').reverse().join('/');

function defaults() {
  return {
    project: 'Untitled project', theme: 'dark', stopStyle: 'cine', shotStart: '1', newestFirst: true, sceneDesc: {},
    cameras: [{ l: 'A', color: PALETTE[0], format: '', fps: '24', shutter: '180', wb: '5600', iso: '800' },
      { l: 'B', color: PALETTE[1], format: '', fps: '24', shutter: '180', wb: '5600', iso: '800' }],
    camera: 'A', viewDate: '', roll: {}, rolls: [], hidden: [], plans: {}, archive: [],
    lists: {
      lenses: ['18mm', '25mm', '32mm', '40mm', '50mm', '75mm', '100mm'],
      scenes: [], luts: [],
      fps: ['23.976', '24', '25', '29.97', '48', '50', '60', '120'],
      shutter: ['180', '172.8', '144', '90', '45'],
      iso: ['400', '500', '640', '800', '1280', '1600', '3200'],
      wb: ['3200', '4300', '5600', '6500'],
    },
    families: {   // density list depends on the filter family; Clear and Pola have none
      'Clear': [], 'ND': ['0.3', '0.6', '0.9', '1.2', '1.5', '1.8', '2.1', '2.4', '2.7', '3.0'],
      'IRND': ['0.3', '0.6', '0.9', '1.2', '1.5', '1.8', '2.1', '2.4', '2.7', '3.0'],
      'ND Grad SE': ['0.3', '0.6', '0.9', '1.2'], 'ND Grad HE': ['0.3', '0.6', '0.9', '1.2'], 'Pola': [], 'Pola rotate': [],
      'Glimmerglass': ['1/8', '1/4', '1/2', '1', '2', '3', '4'], 'Black Pro-Mist': ['1/8', '1/4', '1/2', '1', '2', '3', '4'],
      'Hollywood Black Magic': ['1/8', '1/4', '1/2', '1', '2', '3', '4'], 'Black Satin': ['1/8', '1/4', '1/2', '1', '2', '3', '4'],
      'Classic Soft': ['1/8', '1/4', '1/2', '1', '2'], 'Diopter': ['+1/2', '+1', '+2', '+3'],
    },
    used: {},
    takes: [],
  };
}

let S;
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!s) try { s = JSON.parse(localStorage.getItem(OLD_KEY)); } catch {}   // v3 test data carries over
  const d = defaults();
  if (!s) return d;
  for (const k in d) if (!(k in s)) s[k] = d[k];
  for (const c of s.cameras) for (const k of CAMSET) if (!(k in c)) c[k] = '';
  if (!s.families['Classic Soft']) s.families['Classic Soft'] = d.families['Classic Soft'];
  // the prototype's earlier default colours become the app palette (a colour the user picked stays)
  const OLD = ['#E8590C', '#1C7ED6', '#3E8E3E', '#C08A12', '#7D55B8', '#C2447A', '#2B9A93', '#55555C', '#B5452E', '#2E7FC4'];
  s.cameras.forEach((c, i) => { if (OLD.includes(String(c.color).toUpperCase())) c.color = PALETTE[i % PALETTE.length]; });
  return s;
}
S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Could not save on this device'); } }

/* ---------- undo: a checkpoint before every change; the UNDO button walks back (kept until the app closes) ---------- */
const HIST = []; let lastCk = '';
function checkpoint(label, key = '') {   // one checkpoint per field while its panel is open (key), not per keystroke
  if (key && key === lastCk) return;
  lastCk = key; HIST.push({ label, s: JSON.stringify(S) }); if (HIST.length > 40) HIST.shift();
  const b = $('#undo'); if (b) b.disabled = false;
}
function undo() {
  const c = HIST.pop(); if (!c) return toast('Nothing to undo');
  S = JSON.parse(c.s); lastCk = ''; save(); applyTheme(); closeSheet(); route(true); toast('Undone: ' + c.label);
}
const undoBtn = () => `<button class="nav undo" id="undo" ${HIST.length ? '' : 'disabled'} aria-label="Undo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"></path><path d="M3 13a9 9 0 1 0 3-7.7L3 7"></path></svg><span>UNDO</span></button>`;
function applyTheme() { document.documentElement.dataset.theme = S.theme; document.querySelector('meta[name=theme-color]').content = S.theme === 'light' ? '#FFFFFF' : '#0A0A0B'; }

/* ---------- lists keep their own order (ascending, as in Setup); the last one used is marked, not moved ---------- */
function markUsed(list, v) { if (list && v) S.used[list + '|' + v] = Date.now(); }
function recent(list, arr) { let best = null, at = 0; for (const v of arr || S.lists[list]) { const u = S.used[list + '|' + v] || 0; if (u > at) { at = u; best = v; } } return best; }
const recentCls = (list, v, arr) => recent(list, arr) === v ? 'recent' : '';

/* ---------- derived numbering ---------- */
const cam = l => S.cameras.find(c => c.l === l) || { l, color: PALETTE[7], format: '' };
const ink = hex => { const n = parseInt(String(hex).slice(1), 16), L = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); return L > 150 ? '#0A0A0B' : '#FFFFFF'; };
const take = id => S.takes.find(t => t.id === id);
const sameShot = (a, b) => a.cam === b.cam && a.scene === b.scene && a.shot === b.shot;
// A number typed by hand (takeN / clipN) holds for that take, and the ones after it count on from it.
function clipNo(t) { let n = 0; for (const x of S.takes) { if (x.cam === t.cam && x.roll === t.roll) n = x.clipN ? Number(x.clipN) : n + 1; if (x === t) return n; } return n; }
function takeNo(t) {   // slate only / false start / wild don't use up a number; reclassifying one renumbers the takes after it
  let n = 0;
  for (const x of S.takes) {
    if (!sameShot(x, t)) continue;
    if (x === t) return x.takeN ? Number(x.takeN) : n + 1;
    if (!NO_NUMBER.includes(x.type)) n = x.takeN ? Number(x.takeN) : n + 1;
  }
  return n + 1;
}
const typeOf = v => TYPES.find(x => x[0] === v) || TYPES[0];
function takeLabel(t) { const ty = typeOf(t.type); return NO_NUMBER.includes(t.type) ? ty[1] : String(takeNo(t)) + (ty[1] ? ' ' + ty[1] : ''); }

// Filters: full names in the CSV, short form on screen ("ND1.2 · Clr · BSat ¼")
const SHORT = { 'Clear': 'Clr', 'Pola': 'Pol', 'Pola rotate': 'Pol rot', 'Glimmerglass': 'Glim', 'Black Pro-Mist': 'BPM', 'Hollywood Black Magic': 'HBM',
  'Black Satin': 'BSat', 'Classic Soft': 'CSoft', 'Diopter': 'Dio', 'ND Grad SE': 'NDG SE', 'ND Grad HE': 'NDG HE' };
const FR = { '1/8': '⅛', '1/4': '¼', '1/2': '½', '+1/2': '+½', '3/4': '¾' };
const fmtFilters = f => (f || []).filter(x => x.fam).map(x => x.fam + (x.dens ? ' ' + x.dens : '')).join(', ');
const shortFilters = f => (f || []).filter(x => x.fam).map(x => { const s = SHORT[x.fam] || x.fam, d = FR[x.dens] || x.dens || '';
  return d ? (/^(IR)?ND$/.test(s) ? s + d : s + ' ' + d) : s; }).join(' · ');
const fmtStop = v => v ? 'T' + v : '';
function show(k, v) {
  if (k === 'filters') return shortFilters(v);
  if (v === '' || v == null) return '';
  if (k === 'stop') return fmtStop(v);
  return F[k] && F[k].suffix && /^[\d.]+$/.test(v) ? v + F[k].suffix : v;
}
const has = (t, k) => k === 'filters' ? (t.filters || []).length > 0 : (t[k] ?? '') !== '';
const detailKey = t => DETAIL.map(k => k === 'filters' ? fmtFilters(t.filters) : t[k] || '').join('|');
const visible = k => !S.hidden.includes(k);
function detailParts(t, prev, full) {   // [text, changed?]: what changed since the take before in the same scene is marked
  const parts = [], val = (x, k) => k === 'filters' ? fmtFilters(x.filters) : x[k] || '';
  const add = (k, txt) => { if (visible(k) && txt) parts.push([txt, !!prev && prev.scene === t.scene && val(prev, k) !== val(t, k)]); };
  add('lens', t.lens); add('stop', fmtStop(t.stop)); add('filters', shortFilters(t.filters)); add('focus', t.focus && 'F ' + t.focus);
  add('height', t.height && 'H ' + t.height); add('tilt', t.tilt && 'tilt ' + t.tilt + (/[°\d]$/.test(t.tilt) && !/°/.test(t.tilt) ? '°' : ''));
  add('fps', t.fps && t.fps + 'fps'); add('shutter', t.shutter && t.shutter + '°'); add('wb', t.wb && t.wb + 'K'); add('iso', t.iso && 'ISO ' + t.iso);
  add('lut', t.lut && 'LUT ' + t.lut);
  if (full) add('desc', t.desc);
  return parts;
}
const detailText = (t, full) => detailParts(t, null, full).map(p => p[0]).join(' · ');

function stamp() {
  const d = new Date(), o = -d.getTimezoneOffset(), p = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return new Date(d.getTime() + o * 60000).toISOString().slice(0, 23) + (o >= 0 ? '+' : '-') + p(o / 60) + ':' + p(o % 60);
}

/* ---------- rolls ---------- */
function nextRollName(l) {
  const r = S.roll[l]; if (!r) return l + '001';
  const m = r.match(/^(.*?)(\d+)$/); return m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') : r + '-2';
}
function openRoll(l, r, date = today()) {
  S.roll[l] = r;
  if (!S.rolls.some(x => x.cam === l && x.roll === r && x.date === date)) S.rolls.push({ cam: l, roll: r, date });
  save();
}
const curRoll = l => { if (!S.roll[l]) openRoll(l, l + '001'); return S.roll[l]; };
function rollsOn(date, l) {   // rolls of one camera on one day: the ones with takes, then empty ones just started
  const out = [];
  for (const t of S.takes) if (t.date === date && t.cam === l && !out.includes(t.roll)) out.push(t.roll);
  for (const x of S.rolls) if (x.date === date && x.cam === l && !out.includes(x.roll)) out.push(x.roll);
  return out;
}

/* ---------- creating takes ---------- */
function blank(l) {
  const t = { id: uid(), cam: l, roll: curRoll(l), date: today(), created: stamp(), type: 'Take', circled: false, filters: [], sug: {} };
  for (const k of ORDER) if (!(k in t)) t[k] = '';
  if (!S.rolls.some(x => x.cam === l && x.roll === t.roll && x.date === t.date)) S.rolls.push({ cam: l, roll: t.roll, date: t.date });
  return t;
}
const lastOf = l => S.takes.filter(t => !l || t.cam === l).pop();
function insertAfterCam(t) { S.takes.push(t); save(); return t; }

function addTake(from) {          // the next take is a copy of this one; only notes and TC start empty
  const t = blank(from.cam);
  for (const k of ORDER) if (k !== 'notes' && k !== 'tc') t[k] = k === 'filters' ? JSON.parse(JSON.stringify(from.filters)) : from[k];
  t.sug = JSON.parse(JSON.stringify(from.sug || {})); t.noRepeat = from.noRepeat;
  return insertAfterCam(t);
}
function suggestFrom(t, from) {   // every value of the take before goes in grey: one tap (Repeat) keeps them
  if (!from) return;
  for (const k of SHOT_SUGGEST) { const v = has(from, k) ? from[k] : from.sug[k]; if (v && (k !== 'filters' || v.length)) t.sug[k] = JSON.parse(JSON.stringify(v)); }
}
const nextShot = s => /^\d+$/.test(s) ? String(Number(s) + 1) : /^[A-Y]$/.test(s) ? String.fromCharCode(s.charCodeAt(0) + 1) : '';
function addShot(from) {
  const t = blank(from.cam);
  t.scene = from.scene; t.shot = nextShot(from.shot);
  suggestFrom(t, from);
  return insertAfterCam(t);
}
function addScene(l, scene, shot, head) {   // a new scene starts from the camera's defaults (shown before you start); the rest in grey
  const from = lastOf(l), c = cam(l), t = blank(l);
  t.scene = scene; t.shot = shot;
  if (head && !S.sceneDesc[scene]) S.sceneDesc[scene] = head;   // the call sheet heading describes the scene, not the shot
  suggestFrom(t, from);
  for (const k of CAMSET) if (c[k]) { t[k] = c[k]; delete t.sug[k]; }
  if (scene && !S.lists.scenes.includes(scene)) S.lists.scenes.push(scene);
  return insertAfterCam(t);
}

/* ---------- plumbing ---------- */
let toastTimer;
function toast(msg, ms = 1800, action) {
  const el = $('#toast');
  el.innerHTML = h(msg) + (action ? ` <button id="tact">${h(action.label)}</button>` : '');
  el.classList.toggle('act', !!action); el.classList.add('show');
  if (action) $('#tact').onclick = () => { el.classList.remove('show'); action.fn(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), action ? Math.max(ms, 5000) : ms);
}
function go(hash) { location.hash = hash; }
function closeSheet() { $('#sheet').innerHTML = ''; }
function sheet(title, body, onMount, noClose) {
  $('#sheet').innerHTML = `<div class="modal" data-close><div class="sheet"><div class="sh-head"><h2>${h(title)}</h2><button class="x" data-close aria-label="Close">✕</button></div>${body}
    ${noClose ? '' : '<button class="btn" data-close>Close</button>'}</div></div>`;
  $('#sheet .modal').addEventListener('click', ev => { if (ev.target.hasAttribute('data-close')) closeSheet(); });
  onMount && onMount($('#sheet .sheet'));
}
function setToolbar(html) {
  const tb = $('#toolbar'); tb.innerHTML = html; tb.style.display = html ? '' : 'none';
  document.documentElement.style.setProperty('--tb-h', (html ? tb.offsetHeight : 0) + 'px');
}

/* ---------- DAY page: rolls and scenes ---------- */
function days() { return [...new Set([...S.takes.map(t => t.date), ...S.rolls.map(r => r.date), ...Object.keys(S.plans), today()])].sort(); }
const camsInView = () => S.camera ? [S.camera] : S.cameras.map(c => c.l);

function rollHTML(l, r) {
  const takes = S.takes.filter(t => t.date === S.viewDate && t.cam === l && t.roll === r);
  const groups = [];
  for (const t of takes) { const g = groups[groups.length - 1]; if (g && sameShot(g[0], t)) g.push(t); else groups.push([t]); }
  const rev = S.newestFirst, flip = a => rev ? [...a].reverse() : a;   // newest on top: the roll in use stays in sight
  const shown = flip(groups);
  const rows = shown.map((g0, gi) => {
    const runs = []; for (const t of g0) { const ru = runs[runs.length - 1]; if (ru && detailKey(ru[0]) === detailKey(t)) ru.push(t); else runs.push([t]); }
    const g = flip(g0), runStart = new Map(flip(runs).map(ru => [flip(ru)[0], ru]));
    const nextG = shown[gi + 1], sceneEnd = !nextG || nextG[0].scene !== g0[0].scene;
    const prevG = shown[gi - 1], sd = S.sceneDesc[g0[0].scene];
    const head = (!prevG || prevG[0].scene !== g0[0].scene) && sd ? `<tr class="scene-head"><td colspan="4">${h(g0[0].scene)} · ${h(sd)}</td></tr>` : '';
    return head + g.map((t, i) => {
      const ru = runStart.get(t), prev = ru && prevTake(ru[0]);   // compare the run's first take with the take before it
      const det = ru ? `<td class="det" rowspan="${ru.length}"><button data-det="${ru.map(x => x.id).join(',')}" style="-webkit-line-clamp:${ru.length * 2}">${
        detailParts(ru[0], prev).map(([x, chg]) => chg ? `<b class="chg">${h(x)}</b>` : h(x)).join(' · ') || '<span style="color:var(--subtle)">—</span>'}</button></td>` : '';
      return `<tr class="${i === g.length - 1 ? (sceneEnd ? 'grp-end scene-end' : 'grp-end') : ''}">
        ${i === 0 ? `<td class="sc" rowspan="${g.length}">${h(t.scene || '—')}</td><td class="sc" rowspan="${g.length}">${h(t.shot || '—')}</td>` : ''}
        <td class="tc-cell"><button data-t="${t.id}"><span class="tk ${t.circled ? 'circ' : ''} ${NO_NUMBER.includes(t.type) ? 'sp' : ''}">${h(takeLabel(t))}</span>
          <span class="clipno">${pad3(clipNo(t))}</span></button></td>${det}</tr>`;
    }).join('');
  }).join('');
  const c = cam(l), isCur = S.roll[l] === r;
  const add = isCur ? `<div class="roll-add"><button class="addbtn" data-newscene="${h(l)}">+ Scene in ${h(r)}</button></div>` : '';
  return `<section class="roll"><div class="roll-band" style="background:${c.color};color:${ink(c.color)}"><b>Cam ${h(l)} · Roll ${h(r)}</b>
      <span class="cnt">${takes.length} clip${takes.length === 1 ? '' : 's'}</span><button class="dots" data-rmenu="${h(l)}|${h(r)}" aria-label="Roll options">⋮</button></div>
    ${rev ? add : ''}${takes.length ? `<table class="rt"><colgroup><col style="width:17%"><col style="width:15%"><col style="width:28%"><col></colgroup>
    <tr><th>Scene</th><th>Shot</th><th>Take · Clip</th><th>Details</th></tr>${rows}</table>` : '<div class="roll-empty">Empty roll.</div>'}
    ${rev ? '' : add}</section>`;
}

function viewDay() {
  closePanel();
  const ds = days(); if (!ds.includes(S.viewDate)) S.viewDate = today();
  const di = ds.indexOf(S.viewDate);
  if (S.camera && !S.cameras.some(c => c.l === S.camera)) S.camera = S.cameras[0].l;
  const blocks = camsInView().map(l => {
    const rs = rollsOn(S.viewDate, l), add = `<button class="addbtn big" data-newroll="${h(l)}" style="--cc:${cam(l).color}">+ Roll · Cam ${h(l)}</button>`;
    return S.newestFirst ? add + [...rs].reverse().map(r => rollHTML(l, r)).join('') : rs.map(r => rollHTML(l, r)).join('') + add;
  }).join('');
  const plan = S.plans[S.viewDate];
  const fmt = S.cameras.filter(c => c.format).map(c => c.l + ': ' + c.format).join(' · ');
  $('#app').innerHTML = `<header class="top"><button class="nav l" onclick="go('help')">Help</button><h1>Camera Report</h1>
    <span class="hbtns">${undoBtn()}<button class="nav" onclick="go('setup')">Setup</button></span></header>
    <div class="dayhead"><button class="projbtn" id="proj"><span class="lbl">Project</span><span class="v">${h(S.project)}</span>
        ${fmt ? `<span class="fmt">${h(fmt)}</span>` : ''}</button>
      <div><div class="lbl">Date</div><div class="datebar"><button id="dprev" ${di > 0 ? '' : 'disabled'} aria-label="Previous day">‹</button>
        <span class="v">${h(dmy(S.viewDate))}</span><button id="dnext" ${di < ds.length - 1 ? '' : 'disabled'} aria-label="Next day">›</button></div></div></div>
    <div class="daybar"><button class="pbtn" id="plan">${plan ? `Day plan · ${plan.scenes.length} scene${plan.scenes.length === 1 ? '' : 's'}` : '+ Day plan (call sheet)'}</button>
      <button class="pbtn" id="shareday">Share day</button></div>
    <div class="camsw">${S.cameras.map(c => `<button data-cam="${h(c.l)}" class="${S.camera === c.l ? 'on' : ''}" style="${S.camera === c.l ? 'background:' + c.color + ';color:' + ink(c.color) : '--cc:' + c.color}">Cam ${h(c.l)}</button>`).join('')}
      <button data-cam="" class="${S.camera ? '' : 'on all'}">${S.cameras.map(c => c.l).join(' + ')}</button>
      <button class="camedit" id="camedit" aria-label="Edit cameras">⋮</button></div>
    <main>${blocks}</main>`;

  const cur = lastOf(S.camera);
  setToolbar(cur ? `<button class="tbtn primary wide" id="cont"><span class="small">CONTINUE</span><span>Cam ${h(cur.cam)} · Scene ${h(cur.scene || '—')} · Shot ${h(cur.shot || '—')} · Take ${h(takeLabel(cur))}</span><span class="chev">›</span></button>` : '');
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => go('t/' + b.dataset.t));
  document.querySelectorAll('[data-det]').forEach(b => b.onclick = () => detailSheet(b.dataset.det.split(',').map(take)));
  document.querySelectorAll('[data-rmenu]').forEach(b => b.onclick = () => { const [l, r] = b.dataset.rmenu.split('|'); rollMenu(l, r); });
  document.querySelectorAll('[data-newroll]').forEach(b => b.onclick = () => rollSheet(b.dataset.newroll));
  document.querySelectorAll('[data-newscene]').forEach(b => b.onclick = () => sceneSheet(b.dataset.newscene));
  document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { S.camera = b.dataset.cam; save(); viewDay(); });
  $('#proj').onclick = projectSheet;
  $('#camedit').onclick = () => cameraSheet(S.camera || S.cameras[0].l);
  $('#undo').onclick = undo;
  $('#plan').onclick = () => go('plan');
  $('#shareday').onclick = () => shareSheet('Day ' + dmy(S.viewDate), S.takes.filter(t => t.date === S.viewDate));
  $('#dprev').onclick = () => { if (di > 0) { S.viewDate = ds[di - 1]; viewDay(); } };
  $('#dnext').onclick = () => { if (di < ds.length - 1) { S.viewDate = ds[di + 1]; viewDay(); } };
  if ($('#cont')) $('#cont').onclick = () => go('t/' + cur.id);
}

function detailSheet(list) {
  const t0 = list[0];
  const rows = list.map(t => `<div style="margin:0 4px 6px"><b>${h(takeLabel(t))}</b> · clip ${pad3(clipNo(t))}${t.circled ? ' · circled' : ''}
    ${t.tc ? ' · TC ' + h(t.tc) : ''}${t.notes ? `<br><span style="color:var(--muted)">${h(t.notes)}</span>` : ''}</div>`).join('');
  sheet(`${t0.scene || '—'} / ${t0.shot || '—'} · ${list.length} take${list.length > 1 ? 's' : ''}`,
    `<div class="detail">${h(detailText(t0, true)).replace(/ · /g, '<br>') || '—'}</div>${rows}
     <button class="btn primary" id="opent">Open take ${h(takeLabel(t0))}</button>`, el => {
      el.querySelector('#opent').onclick = () => { closeSheet(); go('t/' + t0.id); };
    });
}

function rollMenu(l, r) {
  const takes = S.takes.filter(t => t.cam === l && t.roll === r);
  sheet(`Cam ${l} · Roll ${r}`, `<button class="btn" id="rn">Rename roll</button><button class="btn" id="rs">Share this roll</button>
    <button class="btn danger" id="rd">Delete roll ${h(r)}${takes.length ? ` and its ${takes.length} take${takes.length > 1 ? 's' : ''}` : ''}</button>`, el => {
    el.querySelector('#rn').onclick = () => {
      const v = (prompt('New name for roll ' + r, r) || '').trim().toUpperCase(); if (!v || v === r) return;
      checkpoint('rename roll ' + r); takes.forEach(t => t.roll = v); S.rolls.forEach(x => { if (x.cam === l && x.roll === r) x.roll = v; }); if (S.roll[l] === r) S.roll[l] = v;
      save(); closeSheet(); viewDay();
    };
    el.querySelector('#rs').onclick = () => { closeSheet(); shareSheet('Roll ' + r, takes); };
    el.querySelector('#rd').onclick = () => {
      if (takes.length && !confirm(`Delete roll ${r} and its ${takes.length} take${takes.length > 1 ? 's' : ''}?`)) return;
      checkpoint('delete roll ' + r);
      S.takes = S.takes.filter(t => !(t.cam === l && t.roll === r)); S.rolls = S.rolls.filter(x => !(x.cam === l && x.roll === r));
      if (S.roll[l] === r) { const left = [...S.takes.filter(t => t.cam === l).map(t => t.roll), ...S.rolls.filter(x => x.cam === l).map(x => x.roll)]; if (left.length) S.roll[l] = left[left.length - 1]; else delete S.roll[l]; }
      save(); closeSheet(); viewDay();
      toast(`Roll ${r} deleted`, 5000, { label: 'Undo', fn: undo });
    };
  });
}

function rollSheet(l, from) {   // + Roll: the next number is suggested; the shot can carry on in the new roll (the card ran out)
  const last = from || lastOf(l);
  sheet(`New roll · Cam ${l}`, `<div class="rollpick"><button class="x big" id="rprev" aria-label="Previous number">‹</button>
      <input id="nr" value="${h(nextRollName(l))}" autocapitalize="characters" aria-label="Roll"><button class="x big" id="rnext" aria-label="Next number">›</button></div>
    <p>${S.roll[l] ? `Next after ${h(S.roll[l])}.` : 'First roll of this camera.'} Clip numbers start again at 001.</p>
    ${last ? `<button class="btn primary" id="same">Start · scene ${h(last.scene || '—')} / shot ${h(last.shot || '—')} goes on</button>
      <button class="btn" id="newsc">Start · new scene</button>` : '<button class="btn primary" id="newsc">Start roll</button>'}`, el => {
    const inp = el.querySelector('#nr');
    const step = d => { const m = inp.value.match(/^(.*?)(\d+)$/); if (m) inp.value = m[1] + String(Math.max(1, Number(m[2]) + d)).padStart(m[2].length, '0'); };
    el.querySelector('#rprev').onclick = () => step(-1); el.querySelector('#rnext').onclick = () => step(1);
    const start = () => { const v = inp.value.trim().toUpperCase(); if (!v) return null; checkpoint('new roll ' + v); openRoll(l, v); closeSheet(); return v; };
    if (el.querySelector('#same')) el.querySelector('#same').onclick = () => { if (!start()) return; const n = addTake(last); toast(`Roll ${n.roll} · take ${takeLabel(n)} · clip 001`); go('t/' + n.id); };
    el.querySelector('#newsc').onclick = () => { if (!start()) return; if (!location.hash.startsWith('#t/')) viewDay(); sceneSheet(l); };
  }, true);
}

function sceneSheet(l) {   // + Scene: no "next number" guess (scenes aren't shot in order); today's plan and scenes already shot instead
  const plan = (S.plans[S.viewDate] || S.plans[today()] || { scenes: [] }).scenes;
  const shotToday = new Set(S.takes.filter(t => t.date === today()).map(t => t.scene));
  const todo = plan.filter(p => !shotToday.has(p.id));
  const done = []; for (let i = S.takes.length - 1; i >= 0 && done.length < 6; i--) { const t = S.takes[i]; if (t.scene && !done.some(d => d.scene === t.scene)) done.push(t); }
  const c = cam(l);
  sheet(`New scene · Cam ${l} · ${curRoll(l)}`, `<div class="scgrid"><label class="scbox"><span class="lbl">Scene</span><input id="scn" autocomplete="off" autocapitalize="characters" placeholder="—"></label>
      <label class="scbox"><span class="lbl">Shot</span><input id="sht" value="${h(S.shotStart)}" autocomplete="off" autocapitalize="characters"></label></div>
    ${todo.length ? `<div class="p-sub">Today's plan · not shot yet</div><div class="chips">${todo.map(p => `<button class="chip plan" data-sc="${h(p.id)}" data-head="${h(p.head)}"><b>${h(p.id)}</b><small>${h(p.head)}</small></button>`).join('')}</div>` : ''}
    ${done.length ? `<div class="p-sub">Already shot · back to it</div><div class="chips">${done.map(t => `<button class="chip" data-sc="${h(t.scene)}">${h(t.scene)} <small>· last shot ${h(t.shot || '—')}</small></button>`).join('')}</div>` : ''}
    <div class="p-sub">From Cam ${h(l)} defaults (Setup)</div>
    <div class="camdef">${CAMSET.map(k => `<span><i>${F[k].label}</i>${h(c[k] ? show(k, c[k]) : '—')}</span>`).join('')}</div>
    <button class="btn primary" id="go">Start scene · take 1</button>`, el => {
    const sc = el.querySelector('#scn'), sh = el.querySelector('#sht'); let head = '';
    el.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => { sc.value = b.dataset.sc; head = b.dataset.head || ''; el.querySelectorAll('[data-sc]').forEach(x => x.classList.toggle('on', x === b)); });
    el.querySelector('#go').onclick = () => {   // no autofocus: an open keyboard swallowed the first tap on this button
      const s = sc.value.trim(); if (!s) { sc.focus(); return toast('Type the scene or pick one'); }
      checkpoint('new scene ' + s); const t = addScene(l, s, sh.value.trim(), head || planHead(s)); closeSheet(); go('t/' + t.id);
    };
  }, true);
}

function projectSheet() {
  sheet('Projects', `<label class="field" style="padding:0 4px 8px"><span>This project</span><input id="pn" value="${h(S.project)}"></label>
    <p>${days().length} day${days().length > 1 ? 's' : ''} · ${S.takes.length} takes · cameras ${h(S.cameras.map(c => c.l).join(', '))}</p>
    <button class="btn" id="pall">Share all days</button><button class="btn" id="pset">Cameras, lenses and lists (Setup)</button>
    ${S.archive.length ? `<div class="p-sub">Other projects</div>${S.archive.map((p, i) => `<button class="btn" data-open="${i}">${h(p.project)} <small>· ${p.takes.length} takes</small></button>`).join('')}` : ''}
    <button class="btn primary" id="pnew">+ New project</button>
    <p style="margin-top:8px">In the app, cameras and lenses come from the ShotSize project, picked like in the other tools.</p>`, el => {
    el.querySelector('#pn').oninput = ev => { S.project = ev.target.value || 'Untitled project'; save(); };
    el.querySelector('#pn').onchange = () => viewDay();
    el.querySelector('#pall').onclick = () => { closeSheet(); shareSheet('All days', S.takes); };
    el.querySelector('#pset').onclick = () => { closeSheet(); go('setup'); };
    const PJ = ['project', 'takes', 'roll', 'rolls', 'plans', 'sceneDesc'];
    const pack = () => Object.fromEntries(PJ.map(k => [k, S[k]]));
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
      checkpoint('switch project'); const i = +b.dataset.open, other = S.archive[i]; S.archive[i] = pack(); Object.assign(S, other); S.viewDate = ''; save(); closeSheet(); viewDay();
    });
    el.querySelector('#pnew').onclick = () => {
      const name = (prompt('Name of the new project') || '').trim(); if (!name) return;
      checkpoint('new project'); S.archive.push(pack()); Object.assign(S, { project: name, takes: [], roll: {}, rolls: [], plans: {}, sceneDesc: {}, viewDate: '' }); save(); closeSheet(); viewDay();
    };
  });
}

function planHead(scene) { for (const d in S.plans) { const x = S.plans[d].scenes.find(y => y.id === scene); if (x && x.head) return x.head; } return ''; }

function cameraSheet(l) {   // the cameras, edited where they show (the day page), not only in Setup
  const c = cam(l), i = S.cameras.indexOf(c);
  const defRow = k => `<div class="p-sub">${F[k].label}</div><div class="chips">${S.lists[F[k].list].map(v => `<button class="chip ${c[k] === v ? 'on' : ''}" data-def="${k}" data-v="${h(v)}">${h(show(k, v))}</button>`).join('')}
    <button class="chip" data-def="${k}" data-other>Other…</button></div>`;
  sheet('Cameras', `<div class="camtabs">${S.cameras.map(x => `<button data-ct="${h(x.l)}" class="${x === c ? 'on' : ''}" style="${x === c ? 'background:' + x.color + ';color:' + ink(x.color) : '--cc:' + x.color}">${h(x.l)}</button>`).join('')}
      <button data-ct="+" aria-label="Add a camera">+</button></div>
    <div class="camrow"><label class="field" style="padding:0;flex:none;width:72px"><span>Letter</span><input id="cl" value="${h(c.l)}" style="text-transform:uppercase"></label>
      <label class="field" style="padding:0;flex:1"><span>Format</span><input id="cf" value="${h(c.format)}" placeholder="e.g. Venice 2 · 6K 17:9"></label></div>
    <div class="p-sub">Color</div><div class="swatches">${PALETTE.map(col => `<button data-col="${col}" class="${c.color.toLowerCase() === col.toLowerCase() ? 'on' : ''}" style="background:${col}" aria-label="Color ${col}"></button>`).join('')}
      <label class="swatch-any" aria-label="Any color"><input type="color" id="cc" value="${h(c.color)}"><span>Other</span></label></div>
    <p style="margin-top:10px">Defaults for a new scene on Cam ${h(c.l)}:</p>${CAMSET.map(defRow).join('')}
    ${S.cameras.length > 1 ? `<button class="btn danger" id="crm" style="margin-top:12px">Remove Cam ${h(c.l)} (its takes stay)</button>` : ''}`, el => {
    const again = () => cameraSheet(c.l);
    const ck = what => checkpoint('camera ' + c.l + ' ' + what, 'cam|' + c.l + '|' + what);
    el.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => {
      if (b.dataset.ct !== '+') return cameraSheet(b.dataset.ct);
      checkpoint('add camera'); const used = S.cameras.map(x => x.l), nl = 'ABCDEFGHIJ'.split('').find(x => !used.includes(x)) || 'X';
      S.cameras.push({ l: nl, color: PALETTE[S.cameras.length % PALETTE.length], format: '', fps: c.fps, shutter: c.shutter, wb: c.wb, iso: c.iso }); save(); cameraSheet(nl);
    });
    el.querySelector('#cl').onchange = ev => { const v = ev.target.value.trim().toUpperCase(); if (!v || v === c.l || S.cameras.some(x => x.l === v)) return; ck('letter'); const old = c.l; c.l = v;
      S.takes.forEach(t => { if (t.cam === old) t.cam = v; }); S.rolls.forEach(x => { if (x.cam === old) x.cam = v; }); if (S.roll[old]) { S.roll[v] = S.roll[old]; delete S.roll[old]; } if (S.camera === old) S.camera = v; save(); cameraSheet(v); };
    el.querySelector('#cf').oninput = ev => { ck('format'); c.format = ev.target.value; save(); };
    el.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { ck('color'); c.color = b.dataset.col; save(); again(); });
    el.querySelector('#cc').onchange = ev => { ck('color'); c.color = ev.target.value; save(); again(); };
    el.querySelectorAll('[data-def]').forEach(b => b.onclick = () => {
      const k = b.dataset.def; let v = b.dataset.v;
      if (b.hasAttribute('data-other')) { v = (prompt(F[k].label + ' for Cam ' + c.l, c[k] || '') || '').trim(); if (!v) return; if (!S.lists[F[k].list].includes(v)) S.lists[F[k].list].push(v); }
      ck(k); c[k] = v; save(); again();
    });
    if (el.querySelector('#crm')) el.querySelector('#crm').onclick = () => { checkpoint('remove camera ' + c.l); S.cameras.splice(i, 1); if (S.camera === c.l) S.camera = S.cameras[0].l; save(); closeSheet(); route(); };
  });
  const m = $('#sheet .modal'); if (m) m.addEventListener('click', ev => { if (ev.target.hasAttribute('data-close') && !location.hash.startsWith('#t/')) route(); });
}

/* ---------- TAKE page ---------- */
let active = null;

function fieldHTML(t, k, big, extra = '') {
  if (!visible(k)) return '';
  const f = F[k], v = show(k, t[k]), s = !v && t.sug[k] != null ? show(k, t.sug[k]) : '';
  const cls = f.kind === 'area' ? 'txt' : k === 'filters' && (v || s).length > 7 ? 'fil' : '';
  return `<button class="tf ${big ? 'big' : ''} ${active === k ? 'active' : ''} ${s ? 'is-sug' : ''}" data-f="${k}"><span class="lbl">${f.label}</span>
    <span class="v ${cls} ${s ? 'sug' : ''}">${h(v || s)}</span>${extra}</button>`;
}
function row(cls, cells) { const c = cells.filter(Boolean); return c.length ? `<div class="tr c${c.length}">${c.join('')}</div>` : ''; }
const sugKeys = t => SHOT_SUGGEST.filter(k => t.sug[k] != null && !has(t, k) && visible(k));

function renderTake(t) {
  const list = S.takes.filter(x => x.cam === t.cam && x.roll === t.roll), i = list.indexOf(t);
  const c = cam(t.cam), ty = typeOf(t.type), p = prevTake(t);
  // ‹ take · clip › with + on top, like Scene and Shot; tapping the middle opens type, circle and the numbers
  const takeBox = `<div class="tf big takebox ${active === 'take' ? 'active' : ''}" data-f="take"><span class="lbl">Take ✎</span>
    <span class="plus" data-add="take" role="button" aria-label="New take">+</span>
    <div class="tline"><button class="tnav" data-nav="-1" ${i > 0 ? '' : 'disabled'} aria-label="Previous take">‹</button>
      <span class="tmid"><span class="tno ${t.circled ? 'circ' : ''}">${h(takeLabel(t))}</span><span class="cno">${pad3(clipNo(t))}</span>
      ${t.type !== 'Take' ? `<span class="typechip">${h(ty[2])}</span>` : ''}</span>
      <button class="tnav" data-nav="1" ${i < list.length - 1 ? '' : 'disabled'} aria-label="Next take">›</button></div></div>`;
  const sd = S.sceneDesc[t.scene];
  const prevNote = !t.notes && p && p.notes && visible('notes')
    ? `<div class="tr c1"><button class="notechip" data-prevnote>= Take ${h(takeLabel(p))}: “${h(p.notes.length > 48 ? p.notes.slice(0, 48) + '…' : p.notes)}”</button></div>` : '';
  $('#tp').innerHTML =
    row('', [`<div class="tf static"><span class="lbl">Camera / Format</span><span class="v" style="color:${c.color}">${h(t.cam)}${c.format ? ' · ' + h(c.format) : ''}</span></div>`,
      `<div class="tf roll-f ${active === 'roll' ? 'active' : ''}" style="--roll-color:${c.color}" data-f="roll"><span class="lbl">Roll</span><span class="v">${h(t.roll)}</span>
        <span class="plus" data-add="roll" role="button" aria-label="New roll">+</span></div>`]) +
    row('', [fieldHTML(t, 'scene', true, '<span class="plus" data-add="scene" role="button" aria-label="New scene">+</span>'),
      fieldHTML(t, 'shot', true, '<span class="plus" data-add="shot" role="button" aria-label="New shot">+</span>'), takeBox]) +
    (t.scene ? `<div class="tr c1"><button class="scdesc" data-scdesc><span class="lbl">Scene ${h(t.scene)}</span><span>${h(sd || 'Add a scene description')}</span></button></div>` : '') +
    row('', CAMSET.map(k => fieldHTML(t, k))) +
    row('', ['lens', 'stop', 'filters'].map(k => fieldHTML(t, k, true))) +
    row('', ['focus', 'height', 'tilt'].map(k => fieldHTML(t, k, true))) +
    row('', ['lut', 'tc'].map(k => fieldHTML(t, k))) +
    row('', [fieldHTML(t, 'desc')]) + row('', [fieldHTML(t, 'notes')]) + prevNote;

  document.querySelectorAll('#tp [data-f]').forEach(b => b.onclick = ev => {
    if (ev.target.closest('[data-add],[data-nav]')) return;
    const k = b.dataset.f;
    if (k === 'roll') return rollSheet(t.cam, t);
    openPanel(t, k);
  });
  document.querySelectorAll('#tp [data-nav]').forEach(b => b.onclick = () => { const n = list[i + Number(b.dataset.nav)]; if (n) go('t/' + n.id + (active && active !== 'take' ? '/' + active : '')); });
  document.querySelectorAll('#tp [data-add]').forEach(b => b.onclick = ev => { ev.stopPropagation(); doAdd(t, b.dataset.add); });
  const pn = $('#tp [data-prevnote]'); if (pn) pn.onclick = () => { checkpoint('repeat note'); t.notes = p.notes; save(); renderTake(t); };
  const scd = $('#tp [data-scdesc]'); if (scd) scd.onclick = () => {
    const v = prompt('Scene ' + t.scene + ' · description (whole scene)', sd || ''); if (v == null) return;
    checkpoint('scene description'); if (v.trim()) S.sceneDesc[t.scene] = v.trim(); else delete S.sceneDesc[t.scene]; save(); renderTake(t);
  };
  takeToolbar(t);
}
function doAdd(t, what) {
  closePanel();
  if (what === 'take' || what === 'shot') checkpoint('+ ' + what);
  if (what === 'take') { const n = addTake(t); toast(`Take ${takeLabel(n)} · clip ${pad3(clipNo(n))}`); go('t/' + n.id); }
  if (what === 'shot') { const n = addShot(t); go('t/' + n.id); }
  if (what === 'scene') sceneSheet(t.cam);
  if (what === 'roll') rollSheet(t.cam, t);
}

function takeToolbar(t) {   // the big + Take stays at the bottom, in reach of the thumb; Repeat shows above it while there is grey
  const ks = sugKeys(t), p = prevTake(t);
  const vals = ks.map(k => k === 'stop' ? fmtStop(t.sug[k]) : k === 'filters' ? shortFilters(t.sug[k]) : k === 'height' ? 'h ' + t.sug[k] : k === 'iso' ? 'ISO ' + t.sug[k] : LABEL[k] && /^[\d.]+$/.test(t.sug[k]) ? t.sug[k] + LABEL[k] : t.sug[k]);
  const rep = ks.length && !t.noRepeat ? `<div class="repeat"><div class="rp-t"><b>From ${p && p.shot !== t.shot ? 'shot ' + h(p.shot || '—') : 'the take before'}, not saved yet</b><span>${ks.length} field${ks.length > 1 ? 's' : ''}</span></div>
      <div class="rp-v">${h(vals.join(' · '))}</div>
      <div class="rp-b"><button class="tbtn" id="onebyone">Fill one by one</button><button class="tbtn yellow" id="repeat">⟳ Repeat all</button></div></div>` : '';
  setToolbar(`${rep}<button class="tbtn primary wide" id="addtake">+ Take</button>`);
  $('#addtake').onclick = () => doAdd(t, 'take');
  if ($('#repeat')) $('#repeat').onclick = () => {
    checkpoint('repeat');
    for (const k of ks) { t[k] = JSON.parse(JSON.stringify(t.sug[k])); if (F[k].list) markUsed(F[k].list, t[k]); delete t.sug[k]; }
    save(); renderTake(t);
    toast(`Repeated ${ks.length} field${ks.length > 1 ? 's' : ''}`, 5000, { label: 'Undo', fn: undo });
  };
  if ($('#onebyone')) $('#onebyone').onclick = () => { t.noRepeat = true; save(); renderTake(t); };
}

function viewTake(id, field) {
  const t = take(id); if (!t) return go('');
  active = null;
  $('#app').innerHTML = `<header class="top"><button class="nav l" id="back">‹ Day</button><h1>Cam ${h(t.cam)} · ${h(t.roll)}</h1>
    <span class="hbtns">${undoBtn()}<button class="nav" id="circ" aria-label="${t.circled ? 'Uncircle' : 'Circle'} this take">${t.circled ? '●' : '○'}</button>
    <button class="nav danger" id="del" aria-label="Delete this take"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg></button></span></header>
    <main><div class="tp" id="tp"></div></main>`;
  renderTake(t);
  $('#back').onclick = () => { S.viewDate = t.date; save(); go(''); };
  $('#undo').onclick = undo;
  $('#circ').onclick = () => { checkpoint(t.circled ? 'uncircle' : 'circle'); t.circled = !t.circled; save(); viewTake(t.id); toast(t.circled ? 'Circled' : 'Not circled'); };
  $('#del').onclick = () => {
    checkpoint('delete take ' + takeLabel(t));
    const list = S.takes.filter(x => x.cam === t.cam && x.roll === t.roll), i = list.indexOf(t), at = S.takes.indexOf(t);
    S.takes.splice(at, 1); save(); const n = list[i - 1] || list[i + 1]; n ? go('t/' + n.id) : go('');
    toast(`Take ${takeLabel(t)} deleted · clips after it move up`, 5000, { label: 'Undo', fn: undo });
  };
  if (field) openPanel(t, field);
}

/* ---------- bottom input panel ---------- */
function closePanel() { active = null; lastCk = ''; const p = $('#panel'); if (p) p.innerHTML = ''; document.documentElement.style.setProperty('--panel-h', '0px'); }
const nextField = k => { const i = ORDER.indexOf(k); return ORDER.slice(i + 1).find(visible) || null; };

function openPanel(t, k) {
  active = k; renderTake(t);
  if (k === 'take') panelTake(t);
  else if (F[k].kind === 'filters') panelFilters(t);
  else if (F[k].kind === 'stop') panelStop(t);
  else panelValue(t, k);
  fitPanel(k);
}
function fitPanel(k) {
  const p = $('#panel .panel'); const ph = p ? p.offsetHeight : 0;
  document.documentElement.style.setProperty('--panel-h', ph + 'px');
  const el = document.querySelector(`#tp [data-f="${k}"]`);
  if (el) { const r = el.getBoundingClientRect(), limit = innerHeight - ph - 8; if (r.bottom > limit) scrollBy({ top: r.bottom - limit, behavior: 'smooth' }); else if (r.top < 52) scrollBy({ top: r.top - 60, behavior: 'smooth' }); }
}
function panelShell(t, k, label, cur, body, empty, noNext) {
  $('#panel').innerHTML = `<div class="panel"><div class="p-head"><div style="flex:1;min-width:0"><div class="lbl">${h(label)}</div>
    <div class="cur ${empty ? 'empty-cur' : ''}" id="pcur">${h(cur)}</div></div>
    ${noNext ? '' : '<button class="pbtn" id="pnext">Next ›</button>'}<button class="pbtn done" id="pdone">Done</button></div>
    <div class="p-body">${body}</div></div>`;
  const keep = () => { if (k === 'stop') { markUsed('stops', t.stop); save(); } };   // only the final stop goes to Recent
  $('#pdone').onclick = () => { keep(); closePanel(); renderTake(t); };
  const n = $('#pnext'); if (n) n.onclick = () => { keep(); const nf = nextField(k); nf ? openPanel(t, nf) : (closePanel(), renderTake(t)); };
}
function setVal(t, k, v) {
  checkpoint(F[k] ? F[k].label : k, t.id + '|' + k);
  t[k] = v; if (v !== '' && !(Array.isArray(v) && !v.length)) delete t.sug[k];
  if (k === 'desc') for (const x of S.takes) if (sameShot(x, t) && x.roll === t.roll) x.desc = v;   // description belongs to the shot
  save(); renderTake(t);
  const c = $('#pcur'); if (c) { c.textContent = show(k, v) || show(k, t.sug[k]) || '—'; c.classList.toggle('empty-cur', !v); }
}
const prevTake = t => { const i = S.takes.indexOf(t); for (let j = i - 1; j >= 0; j--) if (S.takes[j].cam === t.cam) return S.takes[j]; return null; };

function panelValue(t, k) {
  const f = F[k], s = t.sug[k];
  let top = '';
  if (s != null && !has(t, k)) top = `<button class="chip last" data-same>Last: ${h(show(k, s))}</button>`;
  if (k === 'notes') { const p = prevTake(t); if (p && p.notes && p.notes !== t.notes) top = `<button class="chip last" data-prevnote>= Take ${h(takeLabel(p))}: ${h(p.notes.slice(0, 40))}${p.notes.length > 40 ? '…' : ''}</button>`; }
  const chips = f.list ? S.lists[f.list].filter(v => v !== s).map(v => `<button class="chip ${v === t[k] ? 'on' : recentCls(f.list, v)}" data-v="${h(v)}">${h(show(k, v))}</button>`).join('') : '';
  const range = f.range ? `<button class="chip" data-k="→">→ to (range)</button>${k === 'focus' ? '<button class="chip" data-k="∞">∞</button>' : ''}` : '';
  let input = '';
  if (f.kind === 'text') input = `<input class="p-text" id="ptext" value="${h(t[k])}" placeholder="${h(f.ph || '')}" autocomplete="off" autocapitalize="off">`;
  if (f.kind === 'area') input = `<textarea class="p-text" id="ptext" placeholder="${h(f.ph || '')}">${h(t[k])}</textarea>`;
  let keys = '';
  if (f.keys) {
    const u = [...(f.units || []), '', '', '', ''];
    const lay = ['7', '8', '9', '⌫', '4', '5', '6', u[0], '1', '2', '3', u[1], '.', '0', u[2] || '/', u[3] || 'C'];
    keys = `<div class="keys">${lay.map(x => x ? `<button data-k="${h(x)}" class="${/^[\d.]$/.test(x) || x === '⌫' ? '' : 'u'}">${h(x)}</button>` : '<span></span>').join('')}</div>`;
  }
  panelShell(t, k, f.label + (k === 'desc' ? ' · for this shot' : ''), show(k, t[k]) || show(k, s) || '—',
    `${input}${top || chips || range ? `<div class="chips" style="margin-top:${input ? 8 : 0}px">${top}${range}${chips}</div>` : ''}${keys}`, !has(t, k));
  const p = $('#panel');
  const after = () => { const nf = nextField(k); nf ? openPanel(t, nf) : (closePanel(), renderTake(t)); };
  p.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { markUsed(f.list, b.dataset.v); setVal(t, k, b.dataset.v); f.kind === 'text' ? panelValue(t, k) : after(); });
  const sm = p.querySelector('[data-same]'); if (sm) sm.onclick = () => { markUsed(f.list, s); setVal(t, k, s); after(); };
  const pn = p.querySelector('[data-prevnote]'); if (pn) pn.onclick = () => { setVal(t, 'notes', prevTake(t).notes); panelValue(t, k); };
  const ti = $('#ptext');
  if (ti) {
    ti.oninput = () => setVal(t, k, ti.value.trim());
    ti.onchange = () => { const v = ti.value.trim(); if (f.list && v && !S.lists[f.list].includes(v)) S.lists[f.list].push(v); markUsed(f.list, v); save(); };
    if (f.kind === 'text') ti.onkeydown = ev => { if (ev.key === 'Enter') { ti.onchange(); after(); } };
    setTimeout(() => ti.focus(), 60);
  }
  p.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    let v = String(t[k] ?? ''); const x = b.dataset.k;
    if (x === '⌫') v = v.endsWith(' → ') ? v.slice(0, -3) : v.slice(0, -1);
    else if (x === 'C') v = '';
    else if (x === '→') { if (v && !v.includes('→')) v += ' → '; }
    else if (x === '∞') v += '∞';
    else if (x === '−') { const m = v.match(/^(.* → )?(.*)$/); v = (m[1] || '') + (m[2].startsWith('-') ? m[2].slice(1) : '-' + m[2]); }
    else if (/^[\d.]$/.test(x) || x === '/' || x === ':') v += x;
    else v = v.replace(/(mm|cm|m|ft|'|"|°)$/, '') + x;
    setVal(t, k, v);
  });
}

function panelStop(t) {
  const s = t.sug.stop, cur = t.stop || '';
  const [base, fr] = cur.split(' ');
  const cine = S.stopStyle !== 'decimal';
  const rec = Object.keys(S.used).filter(x => x.startsWith('stops|')).sort((a, b) => S.used[b] - S.used[a]).map(x => x.slice(6)).slice(0, 4);   // a row of its own: here newest first is the point
  const body = `${s && !has(t, 'stop') ? `<div class="chips"><button class="chip last" data-same>Last: ${h(fmtStop(s))}</button></div>` : ''}
    ${rec.length ? `<div class="p-sub">Recent</div><div class="chips">${rec.map(v => `<button class="chip ${v === cur ? 'on' : ''}" data-full="${h(v)}">${h(fmtStop(v))}</button>`).join('')}</div>` : ''}
    <div class="p-sub">${cine ? 'Stop' : 'Stop · decimal'}</div><div class="chips">${(cine ? FULL : THIRDS).map(v => `<button class="chip ${v === base ? 'on' : ''}" data-base="${v}">${v}</button>`).join('')}</div>
    ${cine ? `<div class="p-sub">Plus</div><div class="chips">${['', '⅓', '½', '⅔', '¼', '¾'].map(x => `<button class="chip ${(fr || '') === x && base ? 'on' : ''}" data-fr="${x}">${x ? '+ ' + x : 'exact'}</button>`).join('')}</div>` : ''}
    <div class="p-sub">Notation</div><div class="seg"><button data-style="cine" class="${cine ? 'on' : ''}">2.8 ⅓ (cine)</button><button data-style="decimal" class="${cine ? '' : 'on'}">3.2 (decimal)</button></div>`;
  panelShell(t, 'stop', 'Stop', fmtStop(cur) || (s ? fmtStop(s) : '—'), body, !cur);
  const p = $('#panel');
  const set = v => { setVal(t, 'stop', v); panelStop(t); fitPanel('stop'); };
  p.querySelectorAll('[data-base]').forEach(b => b.onclick = () => set(b.dataset.base + (cine && fr ? ' ' + fr : '')));
  p.querySelectorAll('[data-fr]').forEach(b => b.onclick = () => set((base || '2.8') + (b.dataset.fr ? ' ' + b.dataset.fr : '')));
  p.querySelectorAll('[data-full]').forEach(b => b.onclick = () => set(b.dataset.full));
  p.querySelectorAll('[data-style]').forEach(b => b.onclick = () => { S.stopStyle = b.dataset.style; save(); panelStop(t); fitPanel('stop'); });
  const sm = p.querySelector('[data-same]'); if (sm) sm.onclick = () => set(s);
}

function panelFilters(t) {   // type to search the families ("cl" → Clear, Classic Soft); a family without strengths goes in at once
  const s = t.sug.filters;
  let fam = null, q = '';
  const draw = () => {
    const rows = t.filters.map((x, i) => `<button class="chip on" data-del="${i}">${h(x.fam)} ${h(x.dens)} ✕</button>`).join('');
    const all = Object.keys(S.families), ql = q.toLowerCase();
    const famList = ql ? all.filter(f => f.toLowerCase().includes(ql) || (SHORT[f] || '').toLowerCase().startsWith(ql)) : all;
    const body = (s && !t.filters.length ? `<div class="chips"><button class="chip last" data-same>Last: ${h(shortFilters(s))}</button></div>` : '') +
      (rows ? `<div class="chips">${rows}</div>` : '') +
      (fam ? `<div class="p-sub">${h(fam)} · strength</div><div class="chips">${S.families[fam].map(d => `<button class="chip ${recentCls('dens:' + fam, d, S.families[fam])}" data-dens="${h(d)}">${h(FR[d] || d)}</button>`).join('')}</div>`
        : `<input class="p-text" id="fq" placeholder="Search or add a filter" value="${h(q)}" autocomplete="off">
          <div class="chips" style="margin-top:8px">${famList.map(v => `<button class="chip ${recentCls('fam', v, all)}" data-fam="${h(v)}">${h(v)}${S.families[v].length ? '' : ' <small>· adds now</small>'}</button>`).join('')}
          ${q && !all.some(f => f.toLowerCase() === ql) ? `<button class="chip last" data-newfam>+ Add “${h(q)}”</button>` : ''}</div>`);
    panelShell(t, 'filters', 'Filter · in matte box order', shortFilters(t.filters) || (s ? shortFilters(s) : '—'), body, !t.filters.length);
    const p = $('#panel');
    const push = (f, d) => { checkpoint('filter', t.id + '|filters'); t.filters.push({ fam: f, dens: d }); fam = null; q = ''; delete t.sug.filters; save(); renderTake(t); draw(); };
    p.querySelectorAll('[data-fam]').forEach(b => b.onclick = () => { const f = b.dataset.fam; markUsed('fam', f); if (!S.families[f].length) push(f, ''); else { fam = f; draw(); } });
    p.querySelectorAll('[data-dens]').forEach(b => b.onclick = () => { markUsed('dens:' + fam, b.dataset.dens); push(fam, b.dataset.dens); });
    p.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { checkpoint('filter', t.id + '|filters'); t.filters.splice(+b.dataset.del, 1); save(); renderTake(t); draw(); });
    const nf = p.querySelector('[data-newfam]'); if (nf) nf.onclick = () => { S.families[q] = []; push(q, ''); };
    const sm = p.querySelector('[data-same]'); if (sm) sm.onclick = () => { t.filters = JSON.parse(JSON.stringify(s)); delete t.sug.filters; save(); renderTake(t); draw(); };
    const fq = p.querySelector('#fq'); if (fq) { fq.oninput = () => { q = fq.value.trim(); draw(); const n = $('#fq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }; }
    fitPanel('filters');
  };
  draw();
}

function panelTake(t) {   // type, circle, and the take and clip numbers by hand (the takes after count on from them)
  const num = (id, label, v, man) => `<div class="numrow"><span class="lbl">${label}</span><button class="x" data-step="${id}|-1" aria-label="${label} minus">−</button>
    <input id="${id}" inputmode="numeric" value="${v}"><button class="x" data-step="${id}|1" aria-label="${label} plus">+</button>
    ${man ? `<button class="pbtn" data-auto="${id}">Auto</button>` : '<span class="auto">auto</span>'}</div>`;
  const body = `<div class="p-sub">What was this clip</div><div class="chips">${TYPES.map(([v, , en]) => `<button class="chip ${t.type === v ? 'on' : ''}" data-type="${v}">${h(en)}</button>`).join('')}</div>
    <div class="p-sub">Circle</div><div class="chips"><button class="chip ${t.circled ? 'on' : ''}" id="circ2">${t.circled ? '● Circled' : 'Circle this take'}</button></div>
    <div class="p-sub">Numbers</div>${NO_NUMBER.includes(t.type) ? '' : num('tn', 'Take', takeNo(t), t.takeN)}${num('cn', 'Clip', clipNo(t), t.clipN)}
    <p style="margin:8px 4px 0;font-size:13px;color:var(--muted)">Slate only and false start don't use a take number: changing one renumbers the takes after it. A number typed here holds, and the next ones count on from it.</p>`;
  panelShell(t, 'take', 'Take · Clip', `${takeLabel(t)} · ${pad3(clipNo(t))}`, body, false, true);
  const p = $('#panel'), again = () => { save(); renderTake(t); panelTake(t); fitPanel('take'); };
  p.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { checkpoint('take type'); t.type = b.dataset.type; again(); });
  $('#circ2').onclick = () => { checkpoint(t.circled ? 'uncircle' : 'circle'); t.circled = !t.circled; again(); };
  const setN = (id, v) => { v = Math.max(1, Math.round(Number(v) || 0)); if (!v) return; checkpoint(id === 'tn' ? 'take number' : 'clip number'); if (id === 'tn') t.takeN = v; else t.clipN = v; again(); };
  p.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const [id, d] = b.dataset.step.split('|'); setN(id, (id === 'tn' ? takeNo(t) : clipNo(t)) + Number(d)); });
  p.querySelectorAll('.numrow input').forEach(inp => inp.onchange = () => setN(inp.id, inp.value));
  p.querySelectorAll('[data-auto]').forEach(b => b.onclick = () => { checkpoint('auto number'); if (b.dataset.auto === 'tn') delete t.takeN; else delete t.clipN; again(); });
}

/* ---------- DAY PLAN: the call sheet's scenes, found without AI ---------- */
// A scene id: 12, 74.1, 5.03, 5_20, 1.28C, 6_08A, 2.17pt1. Today's scenes show up at least twice in a call sheet
// (schedule, cast, technical breakdown); tomorrow's preview only once. "End of Day #N" ends the day when the next one follows.
const SID = String.raw`(\d{1,3}(?:[._]\d{1,3})?(?:[A-Z](?![a-zà-ú]))?(?:pt\d)?)`;
const IE = /(?:INT|EXT|I\/E|E\/I)\b/;
function parseCallSheet(text) {
  const lines = text.split('\n').map(s => s.trim());
  const eod = []; lines.forEach((l, i) => { const m = l.match(/End of Day\s*#\s*(\d+)/); if (m) eod.push([i, m[1]]); });
  const cut = eod.length ? Math.max(...eod.filter(e => e[1] === eod[0][1]).map(e => e[0])) : lines.length;
  const hits = [], heads = {};
  const reList = new RegExp(String.raw`\b[Cc][Ee][Nn][Aa][Ss]?\s+((?:` + SID + String.raw`(?:\s*(?:,|e|\/|&)\s*)?)+)`, 'g');
  const reStart = new RegExp('^' + SID + String.raw`(?=\s|\||Dia|$)`);
  const reMid = new RegExp(String.raw`\s` + SID + String.raw`\s+(?:INT|EXT|I\/E|E\/I)\b`, 'g');
  const reHash = new RegExp('#' + SID + String.raw`(?!\s*de\b)(?![\d_])`, 'g');
  const reId = new RegExp(SID, 'g');
  const head = (id, s) => { const m = s.match(IE); if (m && !heads[id]) heads[id] = s.slice(m.index, m.index + 42).replace(/\s+/g, ' ').replace(/[•|]/g, '·').trim(); };
  lines.forEach((l, i) => {
    if (i >= cut) return;
    for (const m of l.matchAll(reList)) for (const x of m[1].match(reId) || []) { hits.push([x, i]); head(x, l.slice(m.index)); }
    const ahead = lines.slice(i, i + 5).join(' ').slice(0, 120);
    const ms = l.match(reStart); if (ms && IE.test(ahead)) { hits.push([ms[1], i]); head(ms[1], ahead); }
    for (const m of l.matchAll(reMid)) if (!/(?:\bDia|\bD)\s*$/i.test(l.slice(0, m.index + 1))) { hits.push([m[1], i]); head(m[1], l.slice(m.index)); }   // "Dia 19 EXT" is the story day
    for (const m of l.matchAll(reHash)) hits.push([m[1], i]);
  });
  const seen = new Map();
  for (const [x, i] of hits) { if (!seen.has(x)) seen.set(x, new Set()); seen.get(x).add(i); }
  let today = [], maybe = [];
  for (const [x, ls] of seen) {
    const child = [...seen.keys()].some(y => y !== x && y.startsWith(x + 'pt') && seen.get(y).size >= 2);
    if (ls.size >= 2 && !child) today.push(x); else if (!/^\d$/.test(x)) maybe.push(x);
  }
  // a production that numbers scenes 5.03 / 5_20 never has a bare 1 or 09: those are cast ids and counts
  if (today.filter(x => /[._]/.test(x)).length >= 2) { today = today.filter(x => /[._]/.test(x)); maybe = maybe.filter(x => /[._]/.test(x)); }
  const standby = [...text.matchAll(new RegExp(String.raw`STAND ?BY:?\s*` + SID, 'gi'))].map(m => m[1]);
  const mk = id => ({ id, head: heads[id] || '' });
  return { today: today.map(mk), maybe: maybe.filter(x => !standby.includes(x)).map(mk), standby };
}

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
async function pdfText(buf) {   // pdf.js runs in the page, offline once cached; lines come from the text items' line ends
  if (!window.pdfjsLib) {
    await new Promise((ok, no) => { const s = document.createElement('script'); s.crossOrigin = 'anonymous'; s.src = PDFJS + 'pdf.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  }
  const doc = await pdfjsLib.getDocument({ data: buf }).promise, out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent(); let line = '';
    for (const it of tc.items) { line += it.str; if (it.hasEOL) { out.push(line); line = ''; } }
    if (line) out.push(line);
  }
  return out.join('\n');
}

let planDraft = null;
function viewPlan() {
  closePanel();
  const plan = S.plans[S.viewDate];
  const shot = new Set(S.takes.filter(t => t.date === S.viewDate).map(t => t.scene));
  const d = planDraft;
  const list = d ? `<div class="p-sub">Found ${d.today.length} scene${d.today.length === 1 ? '' : 's'} for the day</div>
      <div class="plist">${[...d.today.map(x => [x, true]), ...d.maybe.map(x => [x, false])].map(([x, on], i) => `<label class="prow ${on ? '' : 'maybe'}"><input type="checkbox" data-pi="${i}" ${on ? 'checked' : ''}>
        <b>${h(x.id)}</b><span>${h(x.head) || (on ? '' : 'found once: notes or the next day’s preview?')}</span></label>`).join('')}</div>
      ${d.standby.length ? `<p>Stand by: ${h(d.standby.join(', '))}</p>` : ''}
      <div class="rowbtns"><button class="btn" id="addsc">+ Scene</button><button class="btn primary" id="use">Use as the plan for ${h(dmy(S.viewDate))}</button></div>` : '';
  $('#app').innerHTML = `<header class="top"><button class="nav l" onclick="go('')">‹ Day</button><h1>Day plan · ${h(dmy(S.viewDate))}</h1><span></span></header>
    <main class="planv">
    ${plan && !d ? `<div class="p-sub">Today's plan</div><div class="plist">${plan.scenes.map(x => `<div class="prow"><b>${h(x.id)}</b><span>${h(x.head)}</span>${shot.has(x.id) ? '<i>shot</i>' : ''}</div>`).join('')}</div>
      ${plan.standby && plan.standby.length ? `<p>Stand by: ${h(plan.standby.join(', '))}</p>` : ''}<button class="btn danger" id="clear">Remove the plan</button>` : ''}
    <div class="p-sub">${plan ? 'Replace with another call sheet' : 'Read the call sheet'}</div>
    <label class="btn primary filebtn">Choose the call sheet PDF<input type="file" id="pdf" accept="application/pdf,.pdf"></label>
    <details><summary>Or paste the text, or type the scenes</summary>
      <textarea class="p-text" id="ptxt" placeholder="Paste the call sheet text, or type: 12, 42, 7A"></textarea><button class="btn" id="readtxt">Find the scenes</button></details>
    <div id="pstat"></div>${list}
    <p class="hint">No AI and nothing leaves the phone: the app looks for “Cena 12”, “74.1 EXT”, “5_20 … INT” in the PDF. Untick a wrong one, add a missing one.
      The scene heading becomes the shot description.</p></main>`;
  setToolbar('');
  const run = (text, src) => { planDraft = parseCallSheet(text); if (!planDraft.today.length && !planDraft.maybe.length) { planDraft = null; $('#pstat').innerHTML = `<p>No scenes found in ${h(src)}.</p>`; return; } viewPlan(); };
  $('#pdf').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    $('#pstat').innerHTML = '<p>Reading the PDF…</p>';
    try { run(await pdfText(await f.arrayBuffer()), f.name); } catch (e) { $('#pstat').innerHTML = '<p>Could not read this PDF here (needs internet the first time). Paste the text instead.</p>'; }
  };
  $('#readtxt').onclick = () => {
    const v = $('#ptxt').value; if (!v.trim()) return;
    const typed = !/\n/.test(v.trim()) && /^[\w.\s,;/-]+$/.test(v);
    if (typed) { planDraft = { today: v.split(/[,;\s]+/).filter(Boolean).map(id => ({ id, head: '' })), maybe: [], standby: [] }; viewPlan(); } else run(v, 'the text');
  };
  if ($('#clear')) $('#clear').onclick = () => { delete S.plans[S.viewDate]; save(); viewPlan(); };
  if (d) {
    const all = [...d.today, ...d.maybe];
    $('#addsc').onclick = () => { const id = (prompt('Scene') || '').trim(); if (id) { d.today.push({ id, head: '' }); viewPlan(); } };
    $('#use').onclick = () => {
      const picked = [...document.querySelectorAll('[data-pi]')].filter(c => c.checked).map(c => all[+c.dataset.pi]);
      S.plans[S.viewDate] = { scenes: picked, standby: d.standby }; planDraft = null; save(); go('');
      toast(`Plan: ${picked.length} scene${picked.length === 1 ? '' : 's'}`);
    };
  }
}

/* ---------- setup & help ---------- */
function viewSetup() {
  closePanel();
  const famText = Object.entries(S.families).map(([f, d]) => f + (d.length ? ': ' + d.join(', ') : '')).join('\n');
  const lists = [['lenses', 'Lenses'], ['scenes', 'Scenes'], ['fps', 'Frame rates'], ['shutter', 'Shutter angles'], ['iso', 'ISO / EI'], ['wb', 'White balance (K)'], ['luts', 'LUTs']]
    .map(([k, label]) => `<label class="field"><span>${label} · one per line</span><textarea data-listedit="${k}">${h(S.lists[k].join('\n'))}</textarea></label>`).join('');
  $('#app').innerHTML = `<header class="top"><button class="nav l" onclick="go('')">‹ Day</button><h1>Setup</h1><span></span></header><main>
    <label class="field"><span>Project</span><input id="pname" value="${h(S.project)}"></label>
    <div class="field"><span>Look</span><div class="seg" id="theme"><button data-v="dark" class="${S.theme !== 'light' ? 'on' : ''}">Night (ShotSize)</button><button data-v="light" class="${S.theme === 'light' ? 'on' : ''}">Day (paper)</button></div></div>
    <div class="field"><span>Cameras · letter, color, format, defaults for a new scene</span>
      <button class="btn" id="cams" style="width:100%">${S.cameras.map(c => `<b style="color:${c.color}">${h(c.l)}</b>`).join(' · ')} · Edit cameras</button></div>
    <div class="field"><span>Lists on the day page</span><div class="seg" id="order"><button data-v="1" class="${S.newestFirst ? 'on' : ''}">Newest on top</button><button data-v="0" class="${S.newestFirst ? '' : 'on'}">Oldest on top</button></div></div>
    <div class="field"><span>A new scene starts at shot</span><div class="seg" id="shotstart"><button data-v="1" class="${S.shotStart !== 'A' ? 'on' : ''}">1</button><button data-v="A" class="${S.shotStart === 'A' ? 'on' : ''}">A</button></div></div>
    <div class="field"><span>Fields on the take page</span><div class="checks">${HIDEABLE.map(k => `<button class="chip ${visible(k) ? 'on' : ''}" data-hide="${k}">${F[k].label}</button>`).join('')}</div></div>
    <label class="field"><span>Filter families · "Family: strengths" one per line (no strengths = goes in at once)</span><textarea id="fams" style="min-height:180px">${h(famText)}</textarea></label>
    ${lists}
    <div class="field"><button class="btn" id="reset" style="width:100%;min-height:44px;border:1px solid var(--line-strong);border-radius:8px;background:none;color:var(--danger);font-weight:700">Erase everything on this device</button></div></main>`;
  setToolbar('');
  $('#pname').oninput = ev => { S.project = ev.target.value || 'Untitled project'; save(); };
  $('#theme').querySelectorAll('button').forEach(b => b.onclick = () => { S.theme = b.dataset.v; save(); applyTheme(); viewSetup(); });
  $('#shotstart').querySelectorAll('button').forEach(b => b.onclick = () => { S.shotStart = b.dataset.v; save(); viewSetup(); });
  $('#cams').onclick = () => cameraSheet(S.camera || S.cameras[0].l);
  $('#order').querySelectorAll('button').forEach(b => b.onclick = () => { S.newestFirst = b.dataset.v === '1'; save(); viewSetup(); });
  document.querySelectorAll('[data-hide]').forEach(b => b.onclick = () => { const k = b.dataset.hide; S.hidden = visible(k) ? [...S.hidden, k] : S.hidden.filter(x => x !== k); save(); viewSetup(); });
  $('#fams').onchange = ev => {
    const fams = {};
    ev.target.value.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => { const [f, d] = line.split(':'); fams[f.trim()] = d ? d.split(',').map(x => x.trim()).filter(Boolean) : []; });
    if (Object.keys(fams).length) { S.families = fams; save(); }
  };
  document.querySelectorAll('[data-listedit]').forEach(ta => ta.onchange = () => { S.lists[ta.dataset.listedit] = [...new Set(ta.value.split('\n').map(s => s.trim()).filter(Boolean))]; save(); });
  $('#reset').onclick = () => { if (confirm('Erase all takes and lists on this device?')) { S = defaults(); save(); applyTheme(); go(''); } };
}

function viewHelp() {
  closePanel();
  $('#app').innerHTML = `<header class="top"><button class="nav l" onclick="go('')">‹ Day</button><h1>How it works</h1><span></span></header>
    <main class="help">
    <p><b>UNDO</b> (top) walks back your last changes, one at a time, until you close the app.</p>
    <p><b>Day page</b> = rolls and scenes. Newest on top (Setup can turn it around). Pick the camera at the top (or all of them); <b>⋮</b> next to them edits the cameras (color, format, defaults). <b>+ Roll</b> starts a card (the next number is
    suggested). Inside the roll, <b>+ Scene</b> starts a scene at shot 1. <b>Continue</b> (bottom) opens the last take.
    Tap a take to open it, the details to read everything, <b>⋮</b> on a roll to rename, share or delete it.</p>
    <p><b>Day plan</b>: choose the call sheet PDF. The app finds the day's scenes (no AI, nothing leaves the phone); you confirm the list.
    Those scenes show first in <b>+ Scene</b>.</p>
    <p><b>Take page</b> = takes and shots. <b>+</b> on Scene, Shot and Take, and the big <b>+ Take</b> at the bottom (a copy of this take).
    In Take · Clip, <b>‹ ›</b> walk through the roll; tap the number to mark slate only, false start, MOS… or type the take and clip numbers. <b>○</b> circles, the bin deletes (with Undo).</p>
    <p><b>+ Shot</b>: everything from the shot before comes in grey, camera settings too: nothing is saved without a tap.
    The yellow box lists the values; <b>Repeat all</b> keeps them (change the lens first, and Repeat fills the rest), or fill one by one.</p>
    <p><b>Focus, height, tilt</b>: <b>→</b> makes a range (5 → 2 m). <b>Filter</b>: type to search; Clear and Pola go in at once.</p>
    <p><b>Stop</b>: pick the stop and the fraction (2.8 + ⅓). The CSV gets the real number (3.2) so Silverstack reads it.</p>
    <p><b>Share</b> (day or roll): PDF, CSV for Silverstack's ZoeLog import, or CSV for its ScriptE import (shot in its own column).
    Data stays on this phone.</p></main>`;
  setToolbar('');
}

/* ---------- export ---------- */
function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(() => {});
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function shareSheet(title, list) {
  if (!list.length) return toast('Nothing to share yet');
  sheet('Share · ' + title, `<button class="btn" id="pdf">PDF</button><button class="btn" id="zl">CSV · Silverstack "ZoeLog CSV" import</button>
    <button class="btn" id="se">CSV · Silverstack "ScriptE CSV" import</button>`, el => {
    el.querySelector('#pdf').onclick = () => { closeSheet(); exportPDF(list); };
    el.querySelector('#zl').onclick = () => { closeSheet(); exportCSV(list, 'zoelog'); };
    el.querySelector('#se').onclick = () => { closeSheet(); exportCSV(list, 'scripte'); };
  });
}
const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csvTake = t => ({ Claquete: 'claquete', Disparo: 'disparo', Wild: 'wild', Test: 'test' })[t.type] || String(takeNo(t));
function exportCSV(list, fmt) {
  let cols, rowOf;
  if (fmt === 'zoelog') {   // ZoeLog's own column names: Silverstack has an importer for them (no Shot column there, so scene/shot go together)
    cols = ['Scene', 'Date', 'Camera', 'Roll', 'Take', 'Clip', 'Circled', 'Lens', 'Filters', 'Stop', 'Focus', 'Lens Height', 'Color Temp', 'FPS', 'Shutter',
      'ISO', 'Time Code', 'Tilt', 'Lut', 'Description', 'Notes', 'Origin Date', 'Take Origin'];
    rowOf = t => [t.shot ? `${t.scene}/${t.shot}` : t.scene, t.date, t.cam, t.roll, csvTake(t), clipNo(t), t.circled ? 'true' : 'false', t.lens, fmtFilters(t.filters),
      t.stop && 'T' + stopDecimal(t.stop), t.focus, t.height, t.wb && t.wb + 'K', t.fps && t.fps + 'fps', t.shutter && t.shutter + ' degrees', t.iso && t.iso + 'EI',
      t.tc, t.tilt, t.lut, t.desc, t.notes, t.created, t.created];
  } else {                  // ScriptE's names: Slate → Shot, Lens → Lens Name, Description → Shot Descriptors, Notes → Comment
    cols = ['Scene', 'Slate', 'Take', 'Camera', 'Roll', 'Clip', 'Circled', 'Lens', 'Stop', 'Filters', 'Focus', 'Lens Height', 'Color Temp', 'ISO', 'FPS', 'Shutter',
      'Timecode', 'Start Time', 'Description', 'Notes'];
    rowOf = t => [t.scene, t.shot, csvTake(t), t.cam, t.roll, clipNo(t), t.circled ? 'true' : 'false', t.lens, stopDecimal(t.stop), fmtFilters(t.filters), t.focus, t.height,
      t.wb, t.iso, t.fps, t.shutter, t.tc, t.created, t.desc, t.notes];
  }
  const lines = [cols.map(q).join(','), ...list.map(t => rowOf(t).map(q).join(','))];
  const rolls = [...new Set(list.map(t => t.cam + t.roll))];
  const base = (S.project || 'report').replace(/\W+/g, '_') + '_' + list[0].date + (rolls.length === 1 ? '_' + list[0].roll : '') + (fmt === 'scripte' ? '_ScriptE' : '_ZoeLog');
  shareFile(base + '.csv', '﻿' + lines.join('\r\n'), 'text/csv');
}

function exportPDF(list) {
  const rolls = [];
  for (const t of list) { let r = rolls.find(x => x.cam === t.cam && x.roll === t.roll); if (!r) rolls.push(r = { cam: t.cam, roll: t.roll, takes: [] }); r.takes.push(t); }
  $('#print').innerHTML = rolls.map(r => { const c = cam(r.cam); return `<section class="ph"><h1>${h(S.project)} — Camera report</h1>
    <div class="meta">Camera <b>${h(r.cam)}</b>${c.format ? ' · ' + h(c.format) : ''} · Roll <b>${h(r.roll)}</b> · ${h(dmy(r.takes[0].date))} ·
      ${r.takes.length} clips · circled ${r.takes.filter(t => t.circled).length}</div>
    <table><thead><tr><th>Scene</th><th>Shot</th><th>Take</th><th>Clip</th><th>Details</th><th>Notes</th></tr></thead><tbody>
    ${r.takes.map((t, i) => { const p = r.takes[i - 1], same = p && sameShot(p, t), sameDet = same && detailKey(p) === detailKey(t);
      return `<tr><td>${same ? '' : h(t.scene)}</td><td>${same ? '' : h(t.shot)}</td><td class="n">${h(takeLabel(t))}${t.circled ? ' ●' : ''}</td><td class="n">${pad3(clipNo(t))}</td>
      <td>${sameDet ? '〃' : h(detailText(t, true))}</td><td>${h([t.tc && 'TC ' + t.tc, t.notes].filter(Boolean).join(' — '))}</td></tr>`; }).join('')}
    </tbody></table></section>`; }).join('');
  setTimeout(() => window.print(), 50);
}

/* ---------- router ---------- */
function route(keepScroll) {
  closeSheet();
  const [v, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (v === 't') viewTake(a, b);
  else if (v === 'setup') viewSetup();
  else if (v === 'help') viewHelp();
  else if (v === 'plan') viewPlan();
  else { planDraft = null; viewDay(); }
  if (!keepScroll && (v !== 't' || !b)) scrollTo(0, 0);
}
applyTheme();
addEventListener('hashchange', () => route());
route();

// Offline cache only when published (https), so edits show up while testing on localhost.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
