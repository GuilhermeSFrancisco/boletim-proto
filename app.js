/* Boletim de câmera — prototype. Standalone PWA, data only on this device (localStorage).
   Model follows ZoeLog: an ENTRY is one camera setup (scene, lens, stop, filters…); its TAKES are rows inside it. */
'use strict';

const KEY = 'boletim-proto-v2';
const CAM_COLORS = ['#A8432C', '#3E8E3E', '#2E7FC4', '#B7811A', '#7D55B8', '#B04A7A'];
const TAKE_TYPES = [   // [value, chip label, English name for the CSV]
  ['Claquete', 'claq', 'Slate only'], ['Disparo', 'disp', 'False start'], ['MOS', 'MOS', 'MOS'], ['Tail', 'tail', 'Tail slate'],
  ['Pickup', 'PU', 'Pickup'], ['Insert', 'ins', 'Insert'], ['VFX', 'vfx', 'VFX plate'], ['Wild', 'wild', 'Wild'], ['Test', 'test', 'Test'],
];
const COUNTS_UP = ['Take', 'MOS', 'Tail', 'Pickup', 'Insert', 'VFX'];   // these use up a take number
const SMART_1 = ['fps', 'shutter', 'wb', 'iso'];                      // Smartfill, first tap: camera settings
const SMART_2 = ['lens', 'stop', 'focus', 'height', 'filters', 'tilt']; // second tap: the rest

// Every tile of the entry. keys: show the keypad; units: unit keys on it; suffix: shown after a bare number.
const F = {
  scene:   { label: 'Scene', kind: 'text', list: 'scenes' },
  lens:    { label: 'Lens', list: 'lenses', keys: true, units: ['mm'] },
  stop:    { label: 'Stop', list: 'stops', keys: true, units: ['T'] },
  focus:   { label: 'Focus', keys: true, units: ['m', 'ft', "'", '"'] },
  height:  { label: 'Lens Height', keys: true, units: ['m', 'cm'] },
  filters: { label: 'Filters', kind: 'filters' },
  shutter: { label: 'Shutter', list: 'shutter', keys: true, suffix: '°' },
  fps:     { label: 'FPS', list: 'fps', keys: true, suffix: 'fps' },
  wb:      { label: 'Color Temp', list: 'wb', keys: true, suffix: 'K' },
  iso:     { label: 'ISO', list: 'iso', keys: true, suffix: 'EI' },
  tilt:    { label: 'Tilt', keys: true, units: ['°', '−'] },
  tc:      { label: 'Time Code', keys: true, units: [':'] },
  notes:   { label: 'Notes', kind: 'area' },
};
const ORDER = ['scene', 'lens', 'stop', 'focus', 'height', 'filters', 'shutter', 'fps', 'wb', 'iso', 'tilt', 'tc', 'notes'];
const LISTS = {
  lenses: 'Lenses', filters: 'Filter families', densities: 'Filter densities', scenes: 'Scenes',
  stops: 'Stops', fps: 'Frame rates', shutter: 'Shutter angles', iso: 'ISO / EI', wb: 'Color temp (K)',
};

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);

function defaults() {
  return {
    project: { name: 'Untitled project', inherit: 'smart' },
    cameras: ['A', 'B'],
    camera: 'A',                 // camera new entries go to
    roll: {},                    // current roll per camera
    lists: {
      lenses: ['18mm', '24mm', '32mm', '40mm', '50mm', '75mm', '100mm'],
      filters: ['Clear', 'ND', 'IRND', 'ND Grad SE', 'ND Grad HE', 'Pola', 'Pola rotate', 'Glimmerglass', 'Black Pro-Mist',
        'Hollywood Black Magic', 'Black Satin', 'Diopter'],
      densities: ['1/8', '1/4', '1/2', '1', '2', '0.3', '0.6', '0.9', '1.2', '1.5', '1.8', '2.1', '2.4', '+1/2', '+1', '+2'],
      scenes: [],
      stops: ['T1.4', 'T2', 'T2.8', 'T4', 'T5.6', 'T8', 'T11', 'T16', 'T2.2', 'T3.2', 'T4.5', 'T6.3'],
      fps: ['23.976', '24', '25', '29.97', '48', '50', '60', '120'],
      shutter: ['180', '172.8', '144', '90', '45'],
      iso: ['400', '500', '640', '800', '1280', '1600', '3200'],
      wb: ['3200', '4300', '5600', '6500'],
    },
    used: {},
    entries: [],
  };
}

let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch { S = defaults(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Could not save on this device'); } }

/* ---------- lists ordered by use ---------- */
function markUsed(list, v) { if (list && v) S.used[list + '|' + v] = Date.now(); }
function ordered(list) {   // most recently used first, then the rest in the order of the list
  const u = k => S.used[list + '|' + k] || 0;
  return [...S.lists[list]].sort((a, b) => u(b) - u(a));
}

/* ---------- model ---------- */
const camColor = cam => CAM_COLORS[Math.max(0, S.cameras.indexOf(cam)) % CAM_COLORS.length];
const curRoll = cam => S.roll[cam] || (S.roll[cam] = cam + '001');
const entry = id => S.entries.find(e => e.id === id);
const fmtFilters = f => (f || []).filter(x => x.fam).map(x => x.fam + (x.dens ? ' ' + x.dens : '')).join(', ');
const has = (e, k) => k === 'filters' ? e.filters.length > 0 : (e[k] ?? '') !== '';
const show = (k, v) => k === 'filters' ? fmtFilters(v) : v === '' || v == null ? '' : F[k].suffix && /^[\d.]+$/.test(v) ? v + F[k].suffix : v;

function stamp() {
  const d = new Date(), o = -d.getTimezoneOffset(), p = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return new Date(d.getTime() + o * 60000).toISOString().slice(0, 23) + (o >= 0 ? '+' : '-') + p(o / 60) + ':' + p(o % 60);
}

function newEntry(cam) {
  const prev = S.entries.filter(e => e.cam === cam).pop();
  const e = { id: uid(), cam, date: today(), created: stamp(), scene: '', filters: [], takes: [], ghost: {} };
  for (const k of ORDER) if (k !== 'filters' && !(k in e)) e[k] = '';
  if (prev) for (const k of [...SMART_1, ...SMART_2]) {
    const v = has(prev, k) ? prev[k] : prev.ghost[k];
    if (v == null) continue;
    if (S.project.inherit === 'copy') e[k] = k === 'filters' ? JSON.parse(JSON.stringify(v)) : v;
    else e.ghost[k] = v;
  }
  S.entries.push(e); save(); return e;
}

function confirmGhost(e, keys) { for (const k of keys) if (k in e.ghost) { e[k] = e.ghost[k]; delete e.ghost[k]; } save(); }

function nextTakeNo(e) { return e.takes.filter(t => COUNTS_UP.includes(t.type)).reduce((m, t) => Math.max(m, t.n), 0) + 1; }
function nextClip(roll) {
  let m = 0; for (const e of S.entries) for (const t of e.takes) if (t.roll === roll) m = Math.max(m, t.clip);
  return m + 1;
}
function addTake(e, type = 'Take') {
  const roll = curRoll(e.cam);
  e.takes.push({ id: uid(), n: nextTakeNo(e), type, roll, clip: nextClip(roll), circled: false, created: stamp() });
  save();
}
const takeLabel = t => { const x = TAKE_TYPES.find(y => y[0] === t.type); return !x ? String(t.n) : ['Claquete', 'Disparo', 'Wild', 'Test'].includes(t.type) ? x[1] : t.n + ' ' + x[1]; };
const takeCSV = t => ({ Claquete: 'claquete', Disparo: 'disparo', Wild: 'wild', Test: 'test' })[t.type] || String(t.n);
const rollsOf = e => [...new Set(e.takes.map(t => t.roll))];

/* ---------- plumbing ---------- */
let toastTimer;
function toast(msg, ms = 1800) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function go(hash) { location.hash = hash; }
function closeSheet() { $('#sheet').innerHTML = ''; }
function sheet(title, body, onMount) {
  $('#sheet').innerHTML = `<div class="modal" data-close><div class="sheet"><h2>${h(title)}</h2>${body}
    <button class="btn" data-close>Cancel</button></div></div>`;
  $('#sheet .modal').addEventListener('click', ev => { if (ev.target.hasAttribute('data-close')) closeSheet(); });
  onMount && onMount($('#sheet .sheet'));
}
const ICON = {
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M5 11v9h14v-9"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>',
};

/* ---------- entry list (ZoeLog "All Entries") ---------- */
function viewList() {
  closePanel();
  // A setup left without scene, takes or any typed value was opened by mistake: drop it.
  const before = S.entries.length;
  S.entries = S.entries.filter(e => e.scene || e.takes.length || ORDER.some(k => has(e, k)));
  if (S.entries.length !== before) save();
  const byDay = {};
  for (const e of [...S.entries].reverse()) (byDay[e.date] ||= []).push(e);
  const blocks = Object.entries(byDay).map(([d, list]) => `<div class="day">${d === today() ? 'Today' : h(d)}</div>` + list.map(e => {
    const c = camColor(e.cam), rolls = rollsOf(e);
    const takes = [...e.takes].reverse();
    const rows = takes.slice(0, 5).map(t => `<tr class="${t.circled ? 'circled' : ''}"><td><span class="tk">${h(takeLabel(t))}</span></td><td>${String(t.clip).padStart(3, '0')}</td></tr>`).join('');
    const sum = ORDER.filter(k => !['scene', 'notes', 'tc'].includes(k)).map(k => has(e, k) ? `${F[k].label} <b>${h(show(k, e[k]))}</b>`
      : k in e.ghost ? `${F[k].label} <i>${h(show(k, e.ghost[k]))}</i>` : '').filter(Boolean);
    return `<button class="entry" data-e="${e.id}"><div class="band" style="background:${c}">Roll ${h(rolls.length ? rolls.join(' → ') : curRoll(e.cam))}</div>
      <div class="eb"><div class="e-scene" style="color:${c}">${h(e.scene || 'No scene').replace(/\//g, '/<wbr>')}</div>
      <div class="e-takes"><table><tr><th>Take</th><th>Clip</th></tr>${rows || '<tr><td colspan="2" style="color:var(--text-subtle)">—</td></tr>'}
        ${takes.length > 5 ? `<tr><td colspan="2" style="color:var(--text-subtle)">+${takes.length - 5}</td></tr>` : ''}</table></div>
      <div class="e-sum">${sum.slice(0, 4).join('<br>')}${sum.length > 4 ? ' …' : ''}</div></div></button>`;
  }).join('')).join('');
  $('#app').innerHTML = `<header class="top"><button class="nav l" onclick="go('help')">Help</button><h1>${h(S.project.name)}</h1>
    <button class="nav r" onclick="go('setup')">Setup</button></header>
    <main>${blocks || `<div class="empty">No entries yet.<br><br>Pick the camera below and tap <b>New</b> (✎) to start the first setup.</div>`}</main>`;
  $('#toolbar').innerHTML = `<button class="tb" id="exp" aria-label="Share">${ICON.share}</button>
    <div class="cams">${S.cameras.map(c => `<button data-cam="${h(c)}" class="${c === S.camera ? 'on' : ''}" style="${c === S.camera ? 'background:' + camColor(c) : ''}">${h(c)}</button>`).join('')}</div>
    <button class="tb" id="new" aria-label="New entry">${ICON.pen}</button>`;
  document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => go('e/' + b.dataset.e));
  document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { S.camera = b.dataset.cam; save(); viewList(); });
  $('#new').onclick = () => { const e = newEntry(S.camera); go('e/' + e.id + '/scene'); };
  $('#exp').onclick = exportSheet;
}

/* ---------- entry editor (tiles) ---------- */
let hideEmpty = false, active = null;

function tileHTML(e, k, cls = '') {
  const f = F[k], v = has(e, k) ? show(k, e[k]) : '', g = !v && k in e.ghost ? show(k, e.ghost[k]) : '';
  const len = (v || g).length;
  const vcls = f.kind === 'area' || f.kind === 'text' && len > 26 ? 'txt' : f.kind === 'text' ? '' : len > 7 ? 'sm' : '';
  if (hideEmpty && !v && !g && active !== k) return '';
  return `<button class="tile ${cls} ${active === k ? 'active' : ''}" data-f="${k}"><span class="lbl">${f.label}</span>
    <span class="v ${vcls} ${g ? 'ghost' : ''}">${h(v || g)}</span></button>`;
}

function renderTiles(e) {
  const last = e.takes.slice(-3).map(t => `<span class="tk">${h(takeLabel(t))}</span>`).join('');
  const rolls = rollsOf(e);
  const cr = `<button class="tile cr ${active === 'takes' ? 'active' : ''}" data-f="takes"><span class="lbl">Camera Report</span>
    <span class="v"><span style="color:${camColor(e.cam)}">${h(rolls.length ? rolls[rolls.length - 1] : curRoll(e.cam))}</span>${last || '<span class="tk" style="opacity:.5">+ take</span>'}</span></button>`;
  $('#tiles').innerHTML = tileHTML(e, 'scene', 'span2') + cr +
    ['lens', 'stop', 'focus', 'height', 'filters', 'shutter', 'fps', 'wb', 'iso'].map(k => tileHTML(e, k)).join('') +
    tileHTML(e, 'tilt') + tileHTML(e, 'tc', 'span2') + tileHTML(e, 'notes', 'span3');
  document.querySelectorAll('#tiles [data-f]').forEach(b => b.onclick = () => openPanel(e, b.dataset.f));
  const n = Object.keys(e.ghost).length;
  $('#greynote').innerHTML = n ? `<div class="grey-note"><span style="flex:1">Grey = same as the last setup. Tap Smartfill to keep them.</span></div>` : '';
}

function viewEntry(id, field) {
  const e = entry(id); if (!e) return go('');
  active = null;
  $('#app').innerHTML = `<header class="top"><button class="nav l" id="back">‹ All Entries</button><h1>Cam ${h(e.cam)}</h1>
    <button class="nav r" id="hide">${hideEmpty ? 'Show All' : 'Hide Empty'}</button></header>
    <main><div id="greynote"></div><div class="tiles" id="tiles"></div><button class="del" id="del">Delete entry</button></main>`;
  renderTiles(e);
  renderEntryToolbar(e);
  $('#back').onclick = () => go('');
  $('#hide').onclick = () => { hideEmpty = !hideEmpty; $('#hide').textContent = hideEmpty ? 'Show All' : 'Hide Empty'; renderTiles(e); };
  $('#del').onclick = () => {
    if (!confirm(`Delete this entry${e.takes.length ? ' and its ' + e.takes.length + ' takes' : ''}?`)) return;
    S.entries = S.entries.filter(x => x !== e); save(); go('');
  };
  if (field) openPanel(e, field);
}

function renderEntryToolbar(e) {
  const g1 = SMART_1.some(k => k in e.ghost), g2 = SMART_2.some(k => k in e.ghost);
  $('#toolbar').innerHTML = `<button class="tb" id="smart" ${g1 || g2 ? '' : 'disabled style="opacity:.35"'}>Smartfill${g1 && g2 ? '' : g2 ? ' · rest' : ''}</button>
    <span class="tb pill">${h(e.date)}</span><button class="tb" id="nextsetup">New setup ›</button>`;
  $('#smart').onclick = () => { confirmGhost(e, g1 ? SMART_1 : SMART_2); renderTiles(e); renderEntryToolbar(e); toast(g1 ? 'Camera settings kept' : 'Lens, filters and position kept'); };
  $('#nextsetup').onclick = () => { const n = newEntry(e.cam); go('e/' + n.id + '/scene'); };
}

/* ---------- bottom input panel ---------- */
function closePanel() {
  active = null; const p = $('#panel'); if (p) p.innerHTML = '';
  document.documentElement.style.setProperty('--panel-h', '0px');
}

function openPanel(e, k) {
  active = k; renderTiles(e);
  if (k === 'takes') panelTakes(e);
  else if (F[k].kind === 'filters') panelFilters(e);
  else panelValue(e, k);
  const p = $('#panel .panel');
  document.documentElement.style.setProperty('--panel-h', (p ? p.offsetHeight : 0) + 'px');
  const t = document.querySelector(`#tiles [data-f="${k}"]`);
  if (t) { const r = t.getBoundingClientRect(), limit = innerHeight - (p ? p.offsetHeight : 0) - 8; if (r.bottom > limit || r.top < 56) scrollBy({ top: r.bottom - limit + (r.top < 56 ? r.top - 64 : 0), behavior: 'smooth' }); }
}

const nextField = k => ORDER[ORDER.indexOf(k) + 1] || null;

function panelShell(e, k, label, cur, body, curEmpty) {
  $('#panel').innerHTML = `<div class="panel"><div class="p-head"><div style="flex:1;min-width:0"><div class="lbl">${h(label)}</div>
    <div class="cur ${curEmpty ? 'empty-cur' : ''}" id="pcur">${h(cur)}</div></div>
    ${k !== 'notes' && k !== 'takes' ? '<button class="pbtn" id="pnext">Next ›</button>' : ''}<button class="pbtn done" id="pdone">Done</button></div>
    <div class="p-body">${body}</div></div>`;
  $('#pdone').onclick = () => { closePanel(); renderTiles(e); renderEntryToolbar(e); };
  const n = $('#pnext'); if (n) n.onclick = () => { const nf = nextField(k); nf ? openPanel(e, nf) : (closePanel(), renderTiles(e)); };
}

function setVal(e, k, v) {
  e[k] = v; if (v !== '') delete e.ghost[k]; save();
  renderTiles(e); renderEntryToolbar(e);
  const c = $('#pcur'); if (c) { c.textContent = show(k, v) || show(k, e.ghost[k]) || '—'; c.classList.toggle('empty-cur', !v); }
}

function panelValue(e, k) {
  const f = F[k], g = e.ghost[k];
  const chips = f.list ? ordered(f.list).map(v => `<button class="chip ${v === e[k] ? 'on' : ''}" data-v="${h(v)}">${h(show(k, v))}</button>`).join('') : '';
  const same = g != null && !has(e, k) ? `<button class="chip on" data-same>Same: ${h(show(k, g))}</button>` : '';
  let input = '';
  if (f.kind === 'text') input = `<input class="p-text" id="ptext" value="${h(e[k])}" placeholder="${h(g || 'e.g. 02.13/posição 3')}" autocomplete="off" autocapitalize="off">`;
  if (f.kind === 'area') input = `<textarea class="p-text" id="ptext" placeholder="Notes">${h(e[k])}</textarea>`;
  let keys = '';
  if (f.keys) {
    const u = [...(f.units || []), '', '', '', ''];
    const layout = ['7', '8', '9', '⌫', '4', '5', '6', u[0], '1', '2', '3', u[1], '.', '0', u[2] || '/', u[3] || 'C'];
    keys = `<div class="keys">${layout.map((x, i) => x ? `<button data-k="${h(x)}" class="${/^[\d.]$/.test(x) || x === '⌫' ? '' : 'u'}">${h(x)}</button>` : '<span></span>').join('')}</div>`;
  }
  const cur = show(k, e[k]) || show(k, g) || '—';
  panelShell(e, k, f.label, cur, `${input}${same || chips ? `<div class="chips" style="margin-top:${input ? 8 : 0}px">${same}${chips}</div>` : ''}${keys}`, !has(e, k));
  const p = $('#panel');
  p.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    markUsed(f.list, b.dataset.v); setVal(e, k, b.dataset.v);
    if (f.kind !== 'text') { const nf = nextField(k); nf ? openPanel(e, nf) : closePanel(); } else panelValue(e, k);
  });
  const sm = p.querySelector('[data-same]'); if (sm) sm.onclick = () => { confirmGhost(e, [k]); setVal(e, k, e[k]); const nf = nextField(k); nf ? openPanel(e, nf) : closePanel(); };
  const ti = $('#ptext');
  if (ti) {
    ti.oninput = () => setVal(e, k, ti.value.trim());
    ti.onchange = () => { if (f.list && ti.value.trim() && !S.lists[f.list].includes(ti.value.trim())) S.lists[f.list].push(ti.value.trim()); markUsed(f.list, ti.value.trim()); save(); };
    if (f.kind === 'text') ti.onkeydown = ev => { if (ev.key === 'Enter') { ti.onchange(); openPanel(e, nextField(k)); } };
    setTimeout(() => ti.focus(), 50);
  }
  p.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    let v = String(e[k] ?? ''); const x = b.dataset.k;
    if (x === '⌫') v = v.slice(0, -1);
    else if (x === 'C') v = '';
    else if (x === 'T') v = v.startsWith('T') ? v.slice(1) : 'T' + v;
    else if (x === '−') v = v.startsWith('-') ? v.slice(1) : '-' + v;
    else if (/^[\d.]$/.test(x) || x === '/' || x === ':') v += x;
    else v = v.replace(/(mm|cm|m|ft|'|"|°)$/, '') + x;   // unit key replaces the unit
    setVal(e, k, v);
  });
}

function panelFilters(e) {
  const g = e.ghost.filters;
  let fam = null;
  const draw = () => {
    const rows = e.filters.map((x, i) => `<div class="filt-row"><span>${h(x.fam)} ${h(x.dens)}</span><button class="x" data-del="${i}" aria-label="Remove">×</button></div>`).join('');
    const body = (g && !e.filters.length ? `<div class="chips"><button class="chip on" data-same>Same: ${h(fmtFilters(g))}</button></div>` : '') + rows +
      (fam ? `<div class="p-sub">${h(fam)} · density</div><div class="chips"><button class="chip" data-dens="">none</button>${ordered('densities').map(d => `<button class="chip" data-dens="${h(d)}">${h(d)}</button>`).join('')}</div>`
        : `<div class="p-sub">${e.filters.length ? 'Add another' : 'Family'}</div><div class="chips">${ordered('filters').map(v => `<button class="chip" data-fam="${h(v)}">${h(v)}</button>`).join('')}</div>`);
    panelShell(e, 'filters', 'Filters', fmtFilters(e.filters) || (g ? fmtFilters(g) : '—'), body, !e.filters.length);
    const p = $('#panel');
    p.querySelectorAll('[data-fam]').forEach(b => b.onclick = () => {
      fam = b.dataset.fam; markUsed('filters', fam);
      if (fam === 'Clear') { e.filters.push({ fam, dens: '' }); fam = null; delete e.ghost.filters; save(); renderTiles(e); }
      draw();
    });
    p.querySelectorAll('[data-dens]').forEach(b => b.onclick = () => { markUsed('densities', b.dataset.dens); e.filters.push({ fam, dens: b.dataset.dens }); fam = null; delete e.ghost.filters; save(); renderTiles(e); renderEntryToolbar(e); draw(); });
    p.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { e.filters.splice(+b.dataset.del, 1); save(); renderTiles(e); draw(); });
    const sm = p.querySelector('[data-same]'); if (sm) sm.onclick = () => { confirmGhost(e, ['filters']); renderTiles(e); renderEntryToolbar(e); draw(); };
    document.documentElement.style.setProperty('--panel-h', $('#panel .panel').offsetHeight + 'px');
  };
  draw();
}

function panelTakes(e) {
  const roll = curRoll(e.cam), n = nextTakeNo(e);
  const rows = [...e.takes].reverse().map(t => `<div class="trow"><span class="tk">${h(takeLabel(t))}</span>
    <span class="clip">${h(t.roll)} · clip ${String(t.clip).padStart(3, '0')}</span>
    <button class="circ ${t.circled ? 'on' : ''}" data-circ="${t.id}">${t.circled ? '● Circled' : 'Circle'}</button>
    <button class="x" data-tdel="${t.id}" aria-label="Delete take">×</button></div>`).join('');
  const body = `<div class="rollline">Roll <b>${h(roll)}</b><span style="flex:1"></span><button class="pbtn" id="card">Card change ›</button></div>
    <div class="take-add"><button class="big" data-add="Take">+ Take ${n}</button>
    ${TAKE_TYPES.map(([v, lbl]) => `<button class="chip" data-add="${v}">${h(['Claquete', 'Disparo', 'Wild', 'Test'].includes(v) ? lbl : n + ' ' + lbl)}</button>`).join('')}</div>
    <div style="margin-top:10px">${rows || '<p class="muted" style="color:var(--text-subtle);margin:8px 4px">No takes yet.</p>'}</div>`;
  panelShell(e, 'takes', 'Camera Report · takes', `${e.takes.length} take${e.takes.length === 1 ? '' : 's'}`, body, false);
  const p = $('#panel');
  const redraw = () => { renderTiles(e); panelTakes(e); document.documentElement.style.setProperty('--panel-h', $('#panel .panel').offsetHeight + 'px'); };
  p.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { addTake(e, b.dataset.add); redraw(); });
  p.querySelectorAll('[data-circ]').forEach(b => b.onclick = () => { const t = e.takes.find(x => x.id === b.dataset.circ); t.circled = !t.circled; save(); redraw(); });
  p.querySelectorAll('[data-tdel]').forEach(b => b.onclick = () => { e.takes = e.takes.filter(x => x.id !== b.dataset.tdel); save(); redraw(); });
  $('#card').onclick = () => {
    const m = roll.match(/^(.*?)(\d+)$/);
    S.roll[e.cam] = m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') : roll + '-2';
    save(); toast('Now on roll ' + S.roll[e.cam]); redraw();
  };
}

/* ---------- setup & help ---------- */
function viewSetup() {
  closePanel();
  const p = S.project;
  const lists = Object.entries(LISTS).map(([k, label]) => `<label class="field"><span>${h(label)} · one per line</span>
    <textarea data-listedit="${k}">${h(S.lists[k].join('\n'))}</textarea></label>`).join('');
  const rolls = S.cameras.map(c => `<label class="field"><span>Camera ${h(c)} · current roll</span><input data-roll="${h(c)}" value="${h(curRoll(c))}" autocapitalize="characters"></label>`).join('');
  $('#app').innerHTML = `<header class="top"><button class="nav l" onclick="go('')">‹ All Entries</button><h1>Setup</h1><span></span></header><main>
    <label class="field"><span>Project</span><input id="pname" value="${h(p.name)}"></label>
    <label class="field"><span>Cameras · letters, comma separated</span><input id="pcams" value="${h(S.cameras.join(', '))}"></label>
    ${rolls}
    <div class="field"><span>A new setup inherits from the last one</span><div class="seg" id="pinh">
      <button data-v="smart" class="${p.inherit === 'smart' ? 'on' : ''}">Grey · Smartfill</button><button data-v="copy" class="${p.inherit === 'copy' ? 'on' : ''}">Copy everything</button></div></div>
    <div class="field"><span>Lists · the last used show first</span></div>${lists}
    <button class="del" id="reset">Erase everything on this device</button></main>`;
  $('#toolbar').innerHTML = '';
  $('#pname').oninput = ev => { p.name = ev.target.value || 'Untitled project'; save(); };
  $('#pcams').onchange = ev => { const c = ev.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean); if (c.length) { S.cameras = [...new Set(c)]; if (!S.cameras.includes(S.camera)) S.camera = S.cameras[0]; save(); viewSetup(); } };
  document.querySelectorAll('[data-roll]').forEach(i => i.onchange = () => { if (i.value.trim()) { S.roll[i.dataset.roll] = i.value.trim().toUpperCase(); save(); } });
  $('#pinh').querySelectorAll('button').forEach(b => b.onclick = () => { p.inherit = b.dataset.v; save(); viewSetup(); });
  document.querySelectorAll('[data-listedit]').forEach(ta => ta.onchange = () => { S.lists[ta.dataset.listedit] = [...new Set(ta.value.split('\n').map(s => s.trim()).filter(Boolean))]; save(); });
  $('#reset').onclick = () => { if (confirm('Erase all entries, takes and lists on this device?')) { S = defaults(); save(); go(''); } };
}

function viewHelp() {
  closePanel();
  $('#app').innerHTML = `<header class="top"><button class="nav l" onclick="go('')">‹ All Entries</button><h1>How it works</h1><span></span></header>
    <main class="help">
    <p>An <b>entry</b> is one camera setup: scene, lens, stop, filters, height. Its <b>takes</b> live inside it (claq, disp, 1, 2…).</p>
    <p><b>✎ New</b> opens a setup for the camera picked at the bottom. Tap any box to fill it; the keypad has the units (mm, m, cm, T, °).
    <b>Next ›</b> jumps to the next box, <b>Done</b> closes the keypad, <b>‹ All Entries</b> goes back. Everything saves as you type.</p>
    <p><b>Camera Report</b> box: add takes. <b>+ Take</b> counts up; claq and disp don't use a number. Circle a take there.
    <b>Card change</b> moves this camera to the next roll; the clip count restarts.</p>
    <p><b>Grey values</b> come from the last setup of the same camera. <b>Smartfill</b> keeps fps, shutter, color temp and ISO;
    tap again to keep lens, stop, focus, height, filters and tilt. Or tap a box and pick <b>Same</b>. Unconfirmed grey values are not exported.</p>
    <p><b>Filters</b>: family, then density. Lists show what you used last first.</p>
    <p><b>Share</b> (↑): CSV with ZoeLog's columns, or PDF through the print sheet. Data stays on this phone.</p></main>`;
  $('#toolbar').innerHTML = '';
}

/* ---------- export ---------- */
function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(() => {});
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function exportSheet() {
  sheet('Share', `<button class="btn" id="x1">CSV · today</button><button class="btn" id="x2">PDF · today</button>
    <button class="btn" id="x3">CSV · everything</button>`, el => {
    const td = () => S.entries.filter(e => e.date === today());
    el.querySelector('#x1').onclick = () => { closeSheet(); exportCSV(td()); };
    el.querySelector('#x2').onclick = () => { closeSheet(); exportPDF(td()); };
    el.querySelector('#x3').onclick = () => { closeSheet(); exportCSV(S.entries); };
  });
}

function checkGrey(entries, then) {
  const n = entries.filter(e => Object.keys(e.ghost).length).length;
  if (!n) return then();
  sheet('Grey values', `<p>${n} setup${n > 1 ? 's have' : ' has'} grey values that were never confirmed.</p>
    <button class="btn primary" id="g1">Keep them, then export</button><button class="btn" id="g2">Export without them</button>`, el => {
    el.querySelector('#g1').onclick = () => { entries.forEach(e => confirmGhost(e, Object.keys(e.ghost))); closeSheet(); then(); route(); };
    el.querySelector('#g2').onclick = () => { closeSheet(); then(); };
  });
}

const CSV_COLS = ['Scene', 'Date', 'Camera', 'Roll', 'Take', 'Clip', 'Circled', 'Lens', 'Filters', 'Stop', 'Focus', 'Lens Height',
  'Color Temp', 'FPS', 'Shutter', 'ISO', 'Time Code', 'Tilt', 'Notes', 'Take Type', 'Origin Date', 'Take Origin'];
function exportCSV(entries) {
  if (!entries.some(e => e.takes.length)) return toast('No takes to export yet');
  checkGrey(entries, () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [CSV_COLS.map(q).join(',')];
    for (const e of entries) for (const t of e.takes) {
      const typeEn = t.type === 'Take' ? 'Take' : TAKE_TYPES.find(x => x[0] === t.type)[2];
      lines.push([e.scene, e.date, e.cam, t.roll, takeCSV(t), t.clip, t.circled ? 'true' : 'false', e.lens, fmtFilters(e.filters), e.stop, e.focus, e.height,
        e.wb && e.wb + 'K', e.fps && e.fps + 'fps', e.shutter && e.shutter + ' degrees', e.iso && e.iso + 'EI', e.tc, e.tilt, e.notes, typeEn, e.created, t.created].map(q).join(','));
    }
    shareFile((S.project.name || 'report').replace(/\W+/g, '_') + '_' + today() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv');
  });
}

function exportPDF(entries) {
  const rolls = {};
  for (const e of entries) for (const t of e.takes) (rolls[e.cam + '|' + t.roll] ||= []).push([e, t]);
  if (!Object.keys(rolls).length) return toast('No takes to export yet');
  checkGrey(entries, () => {
    $('#print').innerHTML = Object.entries(rolls).map(([key, rows]) => { const [cam, roll] = key.split('|'); return `<section class="ph">
      <h1>${h(S.project.name)} — Camera report</h1><div class="meta">Camera ${h(cam)} · Roll ${h(roll)} · ${h(rows[0][0].date)} · ${rows.length} takes · circled ${rows.filter(r => r[1].circled).length}</div>
      <table><thead><tr><th>Clip</th><th>Scene</th><th>Take</th><th>◯</th><th>Lens</th><th>Stop</th><th>Focus</th><th>Filters</th><th>Height · tilt</th>
      <th>fps · shutter</th><th>ISO · K</th><th>Notes</th></tr></thead><tbody>
      ${rows.map(([e, t]) => `<tr><td class="c">${String(t.clip).padStart(3, '0')}</td><td>${h(e.scene)}</td><td class="c">${h(takeLabel(t))}</td><td class="c">${t.circled ? '●' : ''}</td>
        <td>${h(e.lens)}</td><td>${h(e.stop)}</td><td>${h(e.focus)}</td><td>${h(fmtFilters(e.filters))}</td><td>${h([e.height, e.tilt && e.tilt + '°'].filter(Boolean).join(' · '))}</td>
        <td>${h([e.fps, e.shutter && e.shutter + '°'].filter(Boolean).join(' · '))}</td><td>${h([e.iso, e.wb && e.wb + 'K'].filter(Boolean).join(' · '))}</td>
        <td>${h([e.tc, e.notes].filter(Boolean).join(' — '))}</td></tr>`).join('')}</tbody></table></section>`; }).join('');
    setTimeout(() => window.print(), 50);
  });
}

/* ---------- router ---------- */
function route() {
  closeSheet();
  const [v, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (v === 'e') viewEntry(a, b);
  else if (v === 'setup') viewSetup();
  else if (v === 'help') viewHelp();
  else viewList();
  if (v !== 'e' || !b) scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();

// Offline cache only when published (https), so edits show up while testing on localhost.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
