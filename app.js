/* Boletim de câmera — prototype. Standalone PWA, data only on this device (localStorage). */
'use strict';

const KEY = 'boletim-proto-v1';
const TAKE_TYPES = [
  ['Take', 'Take'], ['Claquete', 'Slate only'], ['Disparo', 'False start'], ['MOS', 'MOS'],
  ['Tail', 'Tail slate'], ['Pickup', 'Pickup'], ['Wild', 'Wild'], ['Insert', 'Insert'], ['VFX plate', 'VFX plate'], ['Test', 'Test'],
];
const COUNTS_UP = ['Take', 'Pickup', 'MOS', 'Tail', 'Insert', 'VFX plate'];   // these use up a take number
const SMART_1 = ['fps', 'shutter', 'iso', 'wb'];                               // first tap: camera settings
const SMART_2 = ['lens', 'stop', 'focus', 'filters', 'height', 'tilt'];        // second tap: the rest
const LISTS = {
  lenses: 'Lenses', filters: 'Filter families', densities: 'Filter densities', scenes: 'Scenes',
  stops: 'Stops', fps: 'Frame rates', shutter: 'Shutter angles', iso: 'ISO / EI', wb: 'White balance (K)',
};

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);

function defaults() {
  return {
    project: { name: 'Untitled project', numbering: 'us', inherit: 'smart' },
    cameras: ['A', 'B'],
    lists: {
      lenses: ['Enso 18mm', 'Enso 24mm', 'Enso 32mm', 'Enso 40mm', 'Enso 50mm', 'Enso 75mm', 'Enso 100mm'],
      filters: ['Clear', 'ND', 'IRND', 'ND Grad SE', 'ND Grad HE', 'Pola', 'Pola rotate', 'Glimmerglass', 'Black Pro-Mist',
        'Hollywood Black Magic', 'Black Satin', 'Diopter'],
      densities: ['1/8', '1/4', '1/2', '1', '2', '0.3', '0.6', '0.9', '1.2', '1.5', '1.8', '2.1', '2.4', '+1/2', '+1', '+2'],
      scenes: [],
      stops: ['T1.4', 'T1.6', 'T1.8', 'T2', 'T2.2', 'T2.5', 'T2.8', 'T3.2', 'T3.5', 'T4', 'T4.5', 'T5', 'T5.6', 'T6.3', 'T7.1',
        'T8', 'T9', 'T10', 'T11', 'T13', 'T14', 'T16', 'T22'],
      fps: ['23.976', '24', '25', '29.97', '30', '48', '50', '60', '120'],
      shutter: ['180', '172.8', '144', '90', '45', '360'],
      iso: ['400', '500', '640', '800', '1280', '1600', '3200'],
      wb: ['3200', '4300', '5600', '6500'],
    },
    used: {},
    rolls: [],
  };
}

let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch { S = defaults(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Could not save on this device'); } }

/* ---------- lists ordered by use ---------- */
function markUsed(list, v) { if (v) { S.used[list + '|' + v] = Date.now(); } }
function recent(list, n = 5) {
  return S.lists[list].filter(v => S.used[list + '|' + v])
    .sort((a, b) => S.used[list + '|' + b] - S.used[list + '|' + a]).slice(0, n);
}

/* ---------- model helpers ---------- */
const roll = id => S.rolls.find(r => r.id === id);
const lastTake = r => r.takes[r.takes.length - 1];
const shotLabel = () => S.project.numbering === 'uk' ? 'Slate' : 'Shot';
const fmtFilters = f => (f || []).filter(x => x.fam).map(x => x.fam + (x.dens ? ' ' + x.dens : '')).join(', ');
const val = (t, k) => k === 'filters' ? (t.filters && t.filters.length ? t.filters : null) : (t[k] ?? '') === '' ? null : t[k];
const ghostCount = t => Object.keys(t.ghost || {}).length;

function nextRollName(cam) {
  const n = S.rolls.filter(r => r.cam === cam).length + 1;
  return cam + String(n).padStart(3, '0');
}

function newRoll(cam, fromRoll) {
  const prev = fromRoll || [...S.rolls].reverse().find(r => r.cam === cam);
  const r = { id: uid(), cam, name: nextRollName(cam), date: today(), takes: [], seed: prev && prev.takes.length ? lastTake(prev) : null };
  S.rolls.push(r); save(); return r;
}

function blankTake() {
  return { id: uid(), scene: '', shot: '', take: 1, clip: 1, type: 'Take', circled: false, lens: '', stop: '', focus: '', filters: [],
    fps: '', shutter: '', iso: '', wb: '', height: '', tilt: '', tc: '', notes: '', ghost: {}, created: '' };
}

function stamp() {
  const d = new Date(), o = -d.getTimezoneOffset(), p = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = new Date(d.getTime() + o * 60000).toISOString().slice(0, 23);
  return local + (o >= 0 ? '+' : '-') + p(o / 60) + ':' + p(o % 60);
}

// The next take: identity carries over, the rest is inherited (grey until confirmed, or copied straight).
function newTake(r, opts = {}) {
  const prev = lastTake(r) || r.seed, t = blankTake();
  t.created = stamp();
  if (prev) {
    t.scene = prev.scene; t.shot = prev.shot;
    t.take = COUNTS_UP.includes(prev.type) ? Number(prev.take || 0) + 1 : Number(prev.take || 1);
    t.clip = lastTake(r) ? Number(prev.clip || 0) + 1 : 1;
    for (const k of [...SMART_1, ...SMART_2]) {
      const v = val(prev, k) ?? (prev.ghost || {})[k];
      if (v == null) continue;
      if (S.project.inherit === 'copy') t[k] = k === 'filters' ? JSON.parse(JSON.stringify(v)) : v;
      else t.ghost[k] = v;
    }
  }
  if (opts.scene !== undefined) { t.scene = opts.scene; t.shot = opts.shot; t.take = 1; }
  r.takes.push(t); save(); return t;
}

function confirmGhost(t, keys) {
  for (const k of keys) if (k in t.ghost) { t[k] = t.ghost[k]; delete t.ghost[k]; }
  save();
}

/* ---------- UI plumbing ---------- */
let toastTimer;
function toast(msg, ms = 1800) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function go(hash) { location.hash = hash; }
function closeSheet() { $('#sheet').innerHTML = ''; }
function sheet(title, body, onMount) {
  $('#sheet').innerHTML = `<div class="modal" data-close><div class="sheet"><div class="sheet-head"><h2>${h(title)}</h2>
    <button class="btn" data-close>Done</button></div><div class="sheet-body">${body}</div></div></div>`;
  $('#sheet .modal').addEventListener('click', e => { if (e.target.hasAttribute('data-close')) closeSheet(); });
  onMount && onMount($('#sheet .sheet-body'));
}

// Picker: recent first, then the whole list, then "add".
function pick(list, current, title, onPick, opts = {}) {
  const rec = recent(list), all = S.lists[list];
  const chips = arr => arr.map(v => `<button class="chip ${v === current ? 'on' : ''}" data-v="${h(v)}">${h(v)}</button>`).join('');
  const body = `${opts.clear ? `<div class="chips"><button class="chip" data-clear>None</button></div>` : ''}
    ${rec.length ? `<div class="sec-lbl">Recent</div><div class="chips">${chips(rec)}</div>` : ''}
    <div class="sec-lbl">All</div><div class="chips">${all.length ? chips(all) : '<span class="muted">Empty — add below.</span>'}</div>
    <div class="add-line"><input id="addv" placeholder="Add to ${h(LISTS[list].toLowerCase())}" autocomplete="off"><button class="btn sec" id="addb">Add</button></div>`;
  sheet(title, body, el => {
    const done = v => { markUsed(list, v); save(); closeSheet(); onPick(v); };
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => done(b.dataset.v));
    const c = el.querySelector('[data-clear]'); if (c) c.onclick = () => { closeSheet(); onPick(''); };
    const add = () => { const v = el.querySelector('#addv').value.trim(); if (!v) return; if (!S.lists[list].includes(v)) S.lists[list].push(v); done(v); };
    el.querySelector('#addb').onclick = add;
    el.querySelector('#addv').onkeydown = e => { if (e.key === 'Enter') add(); };
  });
}

/* ---------- views ---------- */
function header(title, sub, left = '', right = '') {
  return `<header class="top">${left}<h1>${h(title)}${sub ? `<small>${h(sub)}</small>` : ''}</h1>${right}</header>`;
}
const backBtn = to => `<button class="btn icon" onclick="go('${to}')" aria-label="Back">‹</button>`;

function viewHome() {
  const cams = S.cameras.map(cam => {
    const rolls = S.rolls.filter(r => r.cam === cam).reverse();
    return `<div class="card cam-block"><div class="cam-head"><div class="cam-letter">${h(cam)}</div>
      <div class="grow muted">${rolls.length ? rolls.length + ' roll' + (rolls.length > 1 ? 's' : '') : 'No rolls yet'}</div>
      <button class="btn sec" data-newroll="${h(cam)}">+ Roll</button></div>
      ${rolls.map(r => `<button class="roll-link" data-roll="${r.id}"><b>${h(r.name)}</b><span>${h(r.date)} · ${r.takes.length} take${r.takes.length === 1 ? '' : 's'}</span></button>`).join('')}
    </div>`;
  }).join('');
  $('#app').innerHTML = header(S.project.name, 'Camera report · prototype', '',
    `<button class="btn" onclick="go('help')">?</button><button class="btn" onclick="go('settings')">Setup</button>`) +
    `<main>${cams}<div class="sec-lbl">Export</div>
     <div class="card" style="padding:12px;display:flex;gap:8px;flex-wrap:wrap">
       <button class="btn" id="csvall">CSV · all rolls</button><button class="btn" id="pdfall">PDF · all rolls</button></div></main>`;
  $('#bar').innerHTML = '';
  document.querySelectorAll('[data-newroll]').forEach(b => b.onclick = () => { const r = newRoll(b.dataset.newroll); go('roll/' + r.id); });
  document.querySelectorAll('[data-roll]').forEach(b => b.onclick = () => go('roll/' + b.dataset.roll));
  $('#csvall').onclick = () => exportCSV(S.rolls);
  $('#pdfall').onclick = () => exportPDF(S.rolls);
}

function takeTitle(t) {
  const id = S.project.numbering === 'uk' ? `Slate ${t.shot || '–'}` : `${t.scene || '–'}${t.shot ? ' / ' + t.shot : ''}`;
  return `${id} · T${t.take}`;
}

function viewRoll(id) {
  const r = roll(id); if (!r) return go('');
  const rows = [...r.takes].reverse().map((t, i) => {
    const typ = t.type !== 'Take' ? `<span class="tag">${h(t.type)}</span>` : '';
    const g = t.ghost, show = (k, v) => v ? (k in g ? `<i style="color:var(--text-subtle)">${h(v)}</i>` : h(v)) : '';
    const f = k => t[k] || g[k];
    const meta = [show('lens', f('lens')), show('stop', f('stop')), show('focus', f('focus') && f('focus') + 'm'),
      show('filters', fmtFilters(t.filters.length ? t.filters : g.filters))].filter(Boolean).join(' ');
    return `<button class="take-row ${i === 0 ? 'last' : ''}" data-take="${t.id}">
      <span class="take-id">${h(takeTitle(t))}</span><span class="take-tags">${typ}${t.circled ? '<span class="circle">✓</span>' : ''}</span>
      <span class="take-meta">Clip ${h(t.clip)}${meta ? ' · ' + meta : ''}</span></button>`;
  }).join('');
  $('#app').innerHTML = header(`Cam ${r.cam} · ${r.name}`, `${r.date} · ${r.takes.length} takes`, backBtn(''),
    `<button class="btn" id="exp">Export</button>`) +
    `<main>${rows || `<div class="empty">No takes on this roll yet.<br>Start with <b>New shot</b>.</div>`}
      <div class="sec-lbl">Roll</div><div class="card" style="padding:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="cardchg">Card change → ${h(nextRollName(r.cam))}</button><button class="btn danger" id="delroll">Delete roll</button></div></main>`;
  $('#bar').innerHTML = `<button class="btn" id="newshot">New shot</button><button class="btn primary grow" id="newtake">New take</button>`;
  document.querySelectorAll('[data-take]').forEach(b => b.onclick = () => go(`take/${r.id}/${b.dataset.take}`));
  $('#newtake').onclick = () => {
    if (!r.takes.length && !r.seed) return newShot(r);
    const t = newTake(r); go(`take/${r.id}/${t.id}`);
  };
  $('#newshot').onclick = () => newShot(r);
  $('#exp').onclick = () => sheet('Export ' + r.name, `<div style="padding:12px;display:grid;gap:8px">
      <button class="btn" id="e1">CSV · this roll</button><button class="btn" id="e2">PDF · this roll</button>
      <button class="btn" id="e3">CSV · all rolls of ${h(r.date)}</button></div>`, el => {
    el.querySelector('#e1').onclick = () => { closeSheet(); exportCSV([r]); };
    el.querySelector('#e2').onclick = () => { closeSheet(); exportPDF([r]); };
    el.querySelector('#e3').onclick = () => { closeSheet(); exportCSV(S.rolls.filter(x => x.date === r.date)); };
  });
  $('#cardchg').onclick = () => { const n = newRoll(r.cam, r); toast('New roll ' + n.name); go('roll/' + n.id); };
  $('#delroll').onclick = () => {
    if (!confirm(`Delete roll ${r.name} and its ${r.takes.length} takes?`)) return;
    S.rolls = S.rolls.filter(x => x !== r); save(); go('');
  };
}

function newShot(r) {
  const prev = lastTake(r) || r.seed;
  const uk = S.project.numbering === 'uk';
  let scene = prev ? prev.scene : '', shot = uk && prev ? String(Number(prev.shot || 0) + 1) : '';
  const draw = () => sheet('New shot', `
    <div class="row"><label>Scene</label><button class="val ${scene ? '' : 'empty-val'}" id="ns-scene">${h(scene || 'Choose')}</button></div>
    <div class="row"><label>${shotLabel()}</label><input class="val" id="ns-shot" value="${h(shot)}" placeholder="${uk ? '1, 2, 3…' : 'e.g. A, B, Posição 2'}" autocomplete="off"></div>
    <div style="padding:12px"><button class="btn primary block" id="ns-go">Start at take 1</button></div>`, el => {
    el.querySelector('#ns-scene').onclick = () => { shot = el.querySelector('#ns-shot').value; pick('scenes', scene, 'Scene', v => { scene = v; draw(); }); };
    el.querySelector('#ns-go').onclick = () => {
      shot = el.querySelector('#ns-shot').value.trim();
      closeSheet(); const t = newTake(r, { scene, shot }); go(`take/${r.id}/${t.id}`);
    };
  });
  draw();
}

/* Take editor */
function viewTake(rid, tid) {
  const r = roll(rid), t = r && r.takes.find(x => x.id === tid); if (!t) return go(r ? 'roll/' + rid : '');
  const idx = r.takes.indexOf(t);
  const g = t.ghost;

  const listRow = (k, label, list, suffix = '') => {
    const v = t[k], gv = g[k];
    const text = v ? v + suffix : gv ? gv + suffix : '—';
    return `<div class="row ${gv != null ? 'ghosted' : ''}"><label>${label}</label>
      <button class="val ${v ? '' : 'empty-val'}" data-list="${k}" data-src="${list}" ${gv != null ? 'style="font-style:italic"' : ''}>${h(text)}</button></div>`;
  };
  const numRow = (k, label, ph) => `<div class="row"><label>${label}</label>
      <input class="val" data-num="${k}" inputmode="decimal" value="${h(t[k])}" placeholder="${h(g[k] != null ? g[k] : ph)}" autocomplete="off"></div>`;

  const s1 = SMART_1.some(k => k in g), s2 = SMART_2.some(k => k in g);
  const smart = s1 || s2 ? `<div class="card" style="padding:10px 12px;margin-bottom:4px;display:flex;gap:8px;align-items:center">
      <span class="muted" style="flex:1">Grey = same as last take</span>
      ${s1 ? `<button class="btn sec" id="sm1">Smartfill · camera</button>` : `<button class="btn sec" id="sm2">Smartfill · rest</button>`}</div>` : '';

  const filters = t.filters.map((f, i) => `<div class="row"><label>Filter ${i + 1}</label><div class="filter-line">
      <button class="val" data-ffam="${i}">${h(f.fam || 'Family')}</button>
      <button class="val dens ${f.dens ? '' : 'empty-val'}" data-fdens="${i}">${h(f.dens || '—')}</button>
      <button class="btn icon" data-fdel="${i}" aria-label="Remove filter">×</button></div></div>`).join('');
  const fGhost = g.filters ? `<div class="row ghosted"><label>Filters</label><button class="val empty-val" id="fghost" style="font-style:italic">${h(fmtFilters(g.filters))}</button></div>` : '';

  const types = TAKE_TYPES.map(([v, en]) => `<button class="chip ${t.type === v ? 'on' : ''}" data-type="${h(v)}">${h(v)}${v !== en ? `<small>${h(en)}</small>` : ''}</button>`).join('');

  $('#app').innerHTML = header(takeTitle(t), `Cam ${r.cam} · ${r.name} · clip ${t.clip}`, backBtn('roll/' + r.id),
    `<button class="btn icon" id="prevt" ${idx ? '' : 'disabled'} aria-label="Previous take">↑</button><button class="btn icon" id="nextt" ${idx < r.takes.length - 1 ? '' : 'disabled'} aria-label="Next take">↓</button>`) +
    `<main>${smart}
    <div class="card">
      <div class="row"><label>Scene</label><button class="val ${t.scene ? '' : 'empty-val'}" data-list="scene" data-src="scenes">${h(t.scene || '—')}</button></div>
      <div class="row"><label>${shotLabel()}</label><input class="val" data-txt="shot" value="${h(t.shot)}" autocomplete="off"></div>
      <div class="row"><label>Take</label><div class="stepper"><button class="btn icon" data-step="-1">−</button>
        <input data-num="take" inputmode="numeric" value="${h(t.take)}"><button class="btn icon" data-step="1">+</button></div></div>
      <div class="row"><label>Clip</label><input class="val" data-num="clip" inputmode="numeric" value="${h(t.clip)}"></div>
      <div class="row"><label>Circle</label><span style="flex:1" class="muted">${t.circled ? 'Circled' : 'Not circled'}</span><button class="switch ${t.circled ? 'on' : ''}" id="circ" aria-label="Circle take"></button></div>
    </div>
    <div class="sec-lbl">Type</div><div class="card chips">${types}</div>
    <div class="sec-lbl">Lens</div><div class="card">
      ${listRow('lens', 'Lens', 'lenses')}${listRow('stop', 'Stop', 'stops')}${numRow('focus', 'Focus m', 'm')}</div>
    <div class="sec-lbl">Filters</div><div class="card">${fGhost}${filters}
      <div class="row"><button class="btn sec block" id="addf">+ Filter</button></div></div>
    <div class="sec-lbl">Camera</div><div class="card">
      ${listRow('fps', 'fps', 'fps')}${listRow('shutter', 'Shutter', 'shutter', '°')}${listRow('iso', 'ISO / EI', 'iso')}${listRow('wb', 'WB', 'wb', 'K')}</div>
    <div class="sec-lbl">Position · VFX</div><div class="card">${numRow('height', 'Height m', 'only if needed')}${numRow('tilt', 'Tilt °', 'only if needed')}</div>
    <div class="sec-lbl">Notes</div><div class="card" style="padding:0 12px">
      <div class="row" style="padding:4px 0"><label>Timecode</label><input class="val" data-txt="tc" value="${h(t.tc)}" placeholder="optional" autocomplete="off"></div>
      <textarea class="notes" data-txt="notes" placeholder="Notes">${h(t.notes)}</textarea></div>
    <div style="padding:20px 0"><button class="btn danger block" id="delt">Delete take</button></div></main>`;
  $('#bar').innerHTML = `<button class="btn" onclick="go('roll/${r.id}')">Roll</button><button class="btn primary grow" id="newtake">New take</button>`;

  const redraw = () => { const y = scrollY; viewTake(rid, tid); scrollTo(0, y); };
  document.querySelectorAll('[data-list]').forEach(b => b.onclick = () => {
    const k = b.dataset.list, src = b.dataset.src;
    pick(src, t[k] || g[k], b.closest('.row').querySelector('label').textContent, v => { t[k] = v; delete g[k]; save(); redraw(); }, { clear: k !== 'scene' });
  });
  document.querySelectorAll('[data-num],[data-txt]').forEach(i => i.oninput = () => {
    const k = i.dataset.num || i.dataset.txt; t[k] = i.dataset.num && ['take', 'clip'].includes(k) ? Number(i.value) || '' : i.value.trim();
    if (t[k] !== '') delete g[k]; save();
  });
  document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { t.take = Math.max(1, Number(t.take || 1) + Number(b.dataset.step)); save(); redraw(); });
  document.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { t.type = b.dataset.type; save(); redraw(); });
  $('#circ').onclick = () => { t.circled = !t.circled; save(); redraw(); };
  const sm1 = $('#sm1'), sm2 = $('#sm2');
  if (sm1) sm1.onclick = () => { confirmGhost(t, SMART_1); redraw(); };
  if (sm2) sm2.onclick = () => { confirmGhost(t, SMART_2); redraw(); };
  if ($('#fghost')) $('#fghost').onclick = () => { confirmGhost(t, ['filters']); redraw(); };
  $('#addf').onclick = () => {
    if (g.filters) confirmGhost(t, ['filters']);
    pick('filters', '', 'Filter family', fam => { t.filters.push({ fam, dens: '' }); save(); redraw();
      pick('densities', '', fam + ' · density', dens => { t.filters[t.filters.length - 1].dens = dens; save(); redraw(); }, { clear: true }); });
  };
  document.querySelectorAll('[data-ffam]').forEach(b => b.onclick = () => { const i = +b.dataset.ffam;
    pick('filters', t.filters[i].fam, 'Filter family', v => { if (v) t.filters[i].fam = v; else t.filters.splice(i, 1); save(); redraw(); }, { clear: true }); });
  document.querySelectorAll('[data-fdens]').forEach(b => b.onclick = () => { const i = +b.dataset.fdens;
    pick('densities', t.filters[i].dens, t.filters[i].fam + ' · density', v => { t.filters[i].dens = v; save(); redraw(); }, { clear: true }); });
  document.querySelectorAll('[data-fdel]').forEach(b => b.onclick = () => { t.filters.splice(+b.dataset.fdel, 1); save(); redraw(); });
  $('#prevt').onclick = () => idx && go(`take/${r.id}/${r.takes[idx - 1].id}`);
  $('#nextt').onclick = () => idx < r.takes.length - 1 && go(`take/${r.id}/${r.takes[idx + 1].id}`);
  $('#newtake').onclick = () => { const n = newTake(r); go(`take/${r.id}/${n.id}`); };
  $('#delt').onclick = () => { if (!confirm('Delete this take?')) return; r.takes.splice(idx, 1); save(); go('roll/' + r.id); };
}

function viewSettings() {
  const p = S.project;
  const lists = Object.entries(LISTS).map(([k, label]) => `<label class="field"><span>${h(label)} · one per line</span>
    <textarea data-listedit="${k}">${h(S.lists[k].join('\n'))}</textarea></label>`).join('');
  $('#app').innerHTML = header('Setup', 'Project and lists', backBtn(''), '') + `<main>
    <div class="card">
      <label class="field"><span>Project</span><input id="pname" value="${h(p.name)}"></label>
      <label class="field"><span>Cameras · letters, comma separated</span><input id="pcams" value="${h(S.cameras.join(', '))}"></label>
      <div class="field"><span>Numbering</span><div class="seg" id="pnum">
        <button data-v="us" class="${p.numbering === 'us' ? 'on' : ''}">Scene + shot</button><button data-v="uk" class="${p.numbering === 'uk' ? 'on' : ''}">Running slate</button></div></div>
      <div class="field"><span>New take inherits</span><div class="seg" id="pinh">
        <button data-v="smart" class="${p.inherit === 'smart' ? 'on' : ''}">Grey · Smartfill</button><button data-v="copy" class="${p.inherit === 'copy' ? 'on' : ''}">Copy everything</button></div></div>
    </div>
    <div class="sec-lbl">Lists · recent ones show first in every picker</div><div class="card">${lists}</div>
    <div style="padding:20px 0"><button class="btn danger block" id="reset">Erase everything on this device</button></div></main>`;
  $('#bar').innerHTML = '';
  $('#pname').oninput = e => { p.name = e.target.value || 'Untitled project'; save(); };
  $('#pcams').onchange = e => { const c = e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean); if (c.length) { S.cameras = [...new Set(c)]; save(); } };
  for (const [id, key] of [['#pnum', 'numbering'], ['#pinh', 'inherit']])
    $(id).querySelectorAll('button').forEach(b => b.onclick = () => { p[key] = b.dataset.v; save(); viewSettings(); });
  document.querySelectorAll('[data-listedit]').forEach(ta => ta.onchange = () => {
    S.lists[ta.dataset.listedit] = [...new Set(ta.value.split('\n').map(s => s.trim()).filter(Boolean))]; save();
  });
  $('#reset').onclick = () => { if (confirm('Erase all rolls, takes and lists on this device?')) { S = defaults(); save(); go(''); } };
}

function viewHelp() {
  $('#app').innerHTML = header('How it works', 'Prototype · for testing on set', backBtn(''), '') + `<main class="card" style="padding:4px 16px 16px;font-size:15px">
    <p><b>Roll</b> = one card (or film roll). On Home, <b>+ Roll</b> opens the next one for that camera (A001, A002…).</p>
    <p><b>New shot</b> sets scene and shot and starts at take 1. <b>New take</b> carries everything over and counts the take up.
    False starts and slate-only clips keep the same take number.</p>
    <p><b>Grey values</b> are the last take's settings. <b>Smartfill · camera</b> confirms fps, shutter, ISO and WB;
    then <b>Smartfill · rest</b> confirms lens, stop, focus, filters, height and tilt. Tap a grey field to change just that one.
    Grey values that were never confirmed are left out of the export. In Setup you can switch to <b>Copy everything</b>.</p>
    <p><b>Filters</b> are family + density, so “Glimmerglass 1/4” needs no setup. Every list shows what you used last first.</p>
    <p><b>Card change</b> opens the next roll and continues the same shot.</p>
    <p><b>Export</b>: CSV with ZoeLog's column names (opens in Silverstack, Excel, Sheets) or PDF through the print sheet.</p>
    <p class="muted">Data stays on this phone only. Nothing is sent anywhere.</p></main>`;
  $('#bar').innerHTML = '';
}

/* ---------- export ---------- */
function rowsOf(rolls) {
  const out = [];
  for (const r of rolls) for (const t of r.takes) out.push([r, t]);
  return out;
}

function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(() => {});
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function checkGrey(rolls, then) {
  const n = rowsOf(rolls).filter(([, t]) => ghostCount(t)).length;
  if (!n) return then();
  sheet('Grey values', `<p style="padding:0 14px" class="muted">${n} take${n > 1 ? 's have' : ' has'} grey values that were never confirmed.</p>
    <div style="padding:12px;display:grid;gap:8px"><button class="btn primary" id="g1">Fill them from the take before, then export</button>
    <button class="btn" id="g2">Export without them</button></div>`, el => {
    el.querySelector('#g1').onclick = () => { rowsOf(rolls).forEach(([, t]) => confirmGhost(t, Object.keys(t.ghost))); closeSheet(); then(); route(); };
    el.querySelector('#g2').onclick = () => { closeSheet(); then(); };
  });
}

const CSV_COLS = ['Scene', 'Date', 'Camera', 'Roll', 'Take', 'Clip', 'Circled', 'Lens', 'Filters', 'Stop', 'Focus', 'Lens Height',
  'Color Temp', 'FPS', 'Shutter', 'ISO', 'Time Code', 'Tilt', 'Notes', 'Take Type', 'Shot', 'Take Origin'];
function exportCSV(rolls) {
  if (!rowsOf(rolls).length) return toast('Nothing to export yet');
  checkGrey(rolls, () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [CSV_COLS.map(q).join(',')];
    for (const [r, t] of rowsOf(rolls)) {
      const typeEn = (TAKE_TYPES.find(x => x[0] === t.type) || [, t.type])[1];
      lines.push([
        t.shot && S.project.numbering !== 'uk' ? `${t.scene}/${t.shot}` : t.scene, r.date, r.cam, r.name, t.take, t.clip, t.circled ? 'true' : 'false',
        t.lens, fmtFilters(t.filters), t.stop, t.focus && t.focus + 'm', t.height && t.height + 'm', t.wb && t.wb + 'K', t.fps && t.fps + 'fps',
        t.shutter && t.shutter + ' degrees', t.iso && t.iso + 'EI', t.tc, t.tilt, t.notes, typeEn, t.shot, t.created,
      ].map(q).join(','));
    }
    const base = rolls.length === 1 ? rolls[0].name : (S.project.name || 'boletim').replace(/\W+/g, '_');
    shareFile(base + '.csv', '﻿' + lines.join('\r\n'), 'text/csv');
  });
}

function exportPDF(rolls) {
  rolls = rolls.filter(r => r.takes.length);
  if (!rolls.length) return toast('Nothing to export yet');
  checkGrey(rolls, () => {
    $('#print').innerHTML = rolls.map(r => `<section class="ph"><h1>${h(S.project.name)} — Camera report</h1>
      <div class="meta">Camera ${h(r.cam)} · Roll ${h(r.name)} · ${h(r.date)} · ${r.takes.length} takes · circled: ${r.takes.filter(t => t.circled).length}</div>
      <table><thead><tr><th>Clip</th><th>Scene</th><th>${shotLabel()}</th><th>Take</th><th>Type</th><th>◯</th><th>Lens</th><th>Stop</th><th>Focus</th>
      <th>Filters</th><th>fps · shutter</th><th>ISO · WB</th><th>Height · tilt</th><th>Notes</th></tr></thead><tbody>
      ${r.takes.map(t => `<tr><td class="c">${h(t.clip)}</td><td>${h(t.scene)}</td><td>${h(t.shot)}</td><td class="c">${h(t.take)}</td>
        <td>${t.type === 'Take' ? '' : h(t.type)}</td><td class="c">${t.circled ? '●' : ''}</td><td>${h(t.lens)}</td><td>${h(t.stop)}</td>
        <td>${t.focus ? h(t.focus) + ' m' : ''}</td><td>${h(fmtFilters(t.filters))}</td>
        <td>${[t.fps, t.shutter && t.shutter + '°'].filter(Boolean).map(h).join(' · ')}</td>
        <td>${[t.iso, t.wb && t.wb + 'K'].filter(Boolean).map(h).join(' · ')}</td>
        <td>${[t.height && t.height + ' m', t.tilt && t.tilt + '°'].filter(Boolean).map(h).join(' · ')}</td><td>${h([t.tc, t.notes].filter(Boolean).join(' — '))}</td></tr>`).join('')}
      </tbody></table></section>`).join('');
    setTimeout(() => window.print(), 50);
  });
}

/* ---------- router ---------- */
function route() {
  closeSheet();
  const [v, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (v === 'roll') viewRoll(a);
  else if (v === 'take') viewTake(a, b);
  else if (v === 'settings') viewSettings();
  else if (v === 'help') viewHelp();
  else viewHome();
  if (v !== 'take') scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
