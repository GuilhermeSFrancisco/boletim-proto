/* Boletim de câmera — prototype v3. Standalone PWA, data only on this device (localStorage).
   Every TAKE holds its own values and inherits from the take before. The DAY page shows one sheet per roll
   (like the APACERJ paper report), grouped by scene and shot; the TAKE page is the user's sketch. */
'use strict';

const KEY = 'boletim-proto-v3';
const PALETTE = ['#B5452E', '#3E8E3E', '#2E7FC4', '#C08A12', '#7D55B8', '#C2447A', '#2B9A93', '#55555C'];
// [value, label on the sheet, English name for CSV take type]
const TYPES = [['Take', '', 'Take'], ['Claquete', 'claq', 'Slate only'], ['Disparo', 'false', 'False start'], ['MOS', 'MOS', 'MOS'],
  ['Tail', 'tail', 'Tail slate'], ['Pickup', 'PU', 'Pickup'], ['Insert', 'ins', 'Insert'], ['VFX', 'VFX', 'VFX plate'], ['Wild', 'wild', 'Wild'], ['Test', 'test', 'Test']];
const NO_NUMBER = ['Claquete', 'Disparo', 'Wild', 'Test'];                 // these don't use up a take number
const DETAIL = ['lens', 'stop', 'filters', 'focus', 'height', 'tilt', 'fps', 'shutter', 'wb', 'iso', 'lut'];   // a change here splits the details block
const SHOT_SUGGEST = ['stop', 'filters', 'lens', 'height', 'tilt', 'focus'];   // + Shot clears these and offers the last value

const F = {
  fps:     { label: 'FPS', list: 'fps', keys: true },
  shutter: { label: 'Shutter', list: 'shutter', keys: true, suffix: '°' },
  wb:      { label: 'WB', list: 'wb', keys: true, suffix: 'K' },
  iso:     { label: 'ISO', list: 'iso', keys: true },
  scene:   { label: 'Scene', kind: 'text', list: 'scenes', ph: 'e.g. 2.35' },
  shot:    { label: 'Shot', kind: 'text', ph: 'e.g. 1, 2A, posição 3' },
  lens:    { label: 'Lens', list: 'lenses', keys: true, units: ['mm'] },
  stop:    { label: 'Stop', kind: 'stop' },
  filters: { label: 'Filter', kind: 'filters' },
  focus:   { label: 'Focus', keys: true, units: ['m', 'ft', "'", '"'] },
  height:  { label: 'Height', keys: true, units: ['m', 'cm'] },
  tilt:    { label: 'Tilt', keys: true, units: ['°', '−'] },
  lut:     { label: 'LUT', kind: 'text', list: 'luts', ph: 'LUT name' },
  tc:      { label: 'TC', keys: true, units: [':'] },
  desc:    { label: 'Description', kind: 'area', ph: 'What the shot is: wide, MCU, insert, tracking in…' },
  notes:   { label: 'Notes', kind: 'area', ph: 'Anything else about this take' },
};
const ORDER = ['scene', 'shot', 'lens', 'stop', 'filters', 'focus', 'height', 'tilt', 'fps', 'shutter', 'wb', 'iso', 'lut', 'tc', 'desc', 'notes'];
const HIDEABLE = ['focus', 'height', 'tilt', 'lut', 'tc', 'desc', 'fps', 'shutter', 'wb', 'iso'];

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

function defaults() {
  return {
    project: 'Untitled project', theme: 'light', stopStyle: 'cine',
    cameras: [{ l: 'A', color: PALETTE[0], format: '' }, { l: 'B', color: PALETTE[1], format: '' }],
    camera: 'A', show: [], viewDate: '', roll: {}, hidden: [],
    lists: {
      lenses: ['18mm', '25mm', '32mm', '40mm', '50mm', '75mm', '100mm'],
      scenes: [], luts: [],
      fps: ['23.976', '24', '25', '29.97', '48', '50', '60', '120'],
      shutter: ['180', '172.8', '144', '90', '45'],
      iso: ['400', '500', '640', '800', '1280', '1600', '3200'],
      wb: ['3200', '4300', '5600', '6500'],
    },
    families: {   // density list depends on the filter family
      'Clear': [], 'ND': ['0.3', '0.6', '0.9', '1.2', '1.5', '1.8', '2.1', '2.4', '2.7', '3.0'],
      'IRND': ['0.3', '0.6', '0.9', '1.2', '1.5', '1.8', '2.1', '2.4', '2.7', '3.0'],
      'ND Grad SE': ['0.3', '0.6', '0.9', '1.2'], 'ND Grad HE': ['0.3', '0.6', '0.9', '1.2'], 'Pola': [], 'Pola rotate': [],
      'Glimmerglass': ['1/8', '1/4', '1/2', '1', '2', '3', '4'], 'Black Pro-Mist': ['1/8', '1/4', '1/2', '1', '2', '3', '4'],
      'Hollywood Black Magic': ['1/8', '1/4', '1/2', '1', '2', '3', '4'], 'Black Satin': ['1/8', '1/4', '1/2', '1', '2', '3', '4'],
      'Diopter': ['+1/2', '+1', '+2', '+3'],
    },
    used: {},
    takes: [],
  };
}

let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch { S = defaults(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Could not save on this device'); } }
function applyTheme() { document.documentElement.dataset.theme = S.theme; document.querySelector('meta[name=theme-color]').content = S.theme === 'light' ? '#FFFFFF' : '#0A0A0B'; }

/* ---------- lists ordered by use ---------- */
function markUsed(list, v) { if (list && v) S.used[list + '|' + v] = Date.now(); }
function ordered(list, arr) { const u = k => S.used[list + '|' + k] || 0; return [...(arr || S.lists[list])].sort((a, b) => u(b) - u(a)); }

/* ---------- derived numbering ---------- */
const cam = l => S.cameras.find(c => c.l === l) || { l, color: PALETTE[7], format: '' };
const curRoll = l => S.roll[l] || (S.roll[l] = l + '001');
const take = id => S.takes.find(t => t.id === id);
const sameShot = (a, b) => a.cam === b.cam && a.scene === b.scene && a.shot === b.shot;
function clipNo(t) { let n = 0; for (const x of S.takes) { if (x.cam === t.cam && x.roll === t.roll) n++; if (x === t) return n; } return n; }
function takeNo(t) {   // claq / false start / wild don't use up a number; reclassifying one renumbers the takes after it
  let n = 0;
  for (const x of S.takes) { if (!sameShot(x, t)) continue; if (x === t) return NO_NUMBER.includes(x.type) ? n + 1 : n + 1; if (!NO_NUMBER.includes(x.type)) n++; }
  return n + 1;
}
const typeOf = v => TYPES.find(x => x[0] === v) || TYPES[0];
function takeLabel(t) { const ty = typeOf(t.type); return NO_NUMBER.includes(t.type) ? ty[1] : String(takeNo(t)) + (ty[1] ? ' ' + ty[1] : ''); }
const fmtFilters = f => (f || []).filter(x => x.fam).map(x => x.fam + (x.dens ? ' ' + x.dens : '')).join(', ');
const fmtStop = v => v ? 'T' + v : '';
function show(k, v) {
  if (k === 'filters') return fmtFilters(v);
  if (v === '' || v == null) return '';
  if (k === 'stop') return fmtStop(v);
  return F[k] && F[k].suffix && /^[\d.]+$/.test(v) ? v + F[k].suffix : v;
}
const has = (t, k) => k === 'filters' ? (t.filters || []).length > 0 : (t[k] ?? '') !== '';
const detailKey = t => DETAIL.map(k => k === 'filters' ? fmtFilters(t.filters) : t[k] || '').join('|');
const visible = k => !S.hidden.includes(k);
function detailText(t, full) {
  const parts = [];
  const add = (k, txt) => { if (visible(k) && txt) parts.push(txt); };
  add('lens', t.lens); add('stop', fmtStop(t.stop)); add('filters', fmtFilters(t.filters)); add('focus', t.focus && 'F ' + t.focus);
  add('height', t.height && 'H ' + t.height); add('tilt', t.tilt && 'tilt ' + t.tilt + (/°$/.test(t.tilt) ? '' : '°'));
  add('fps', t.fps && t.fps + 'fps'); add('shutter', t.shutter && t.shutter + '°'); add('wb', t.wb && t.wb + 'K'); add('iso', t.iso && 'ISO ' + t.iso);
  add('lut', t.lut && 'LUT ' + t.lut);
  if (full) { add('desc', t.desc); }
  return parts.join(' · ');
}

function stamp() {
  const d = new Date(), o = -d.getTimezoneOffset(), p = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return new Date(d.getTime() + o * 60000).toISOString().slice(0, 23) + (o >= 0 ? '+' : '-') + p(o / 60) + ':' + p(o % 60);
}

/* ---------- creating takes ---------- */
function blank(l) {
  const t = { id: uid(), cam: l, roll: curRoll(l), date: today(), created: stamp(), type: 'Take', circled: false, filters: [], sug: {} };
  for (const k of ORDER) if (!(k in t)) t[k] = '';
  return t;
}
const lastOf = l => S.takes.filter(t => t.cam === l).pop();
function insertAfterCam(t) { S.takes.push(t); save(); return t; }

function addTake(from) {          // the next take is a copy of this one; only notes start empty
  const t = blank(from.cam);
  for (const k of ORDER) if (k !== 'notes' && k !== 'tc') t[k] = k === 'filters' ? JSON.parse(JSON.stringify(from.filters)) : from[k];
  t.sug = { ...from.sug };
  return insertAfterCam(t);
}
function addShot(from) {          // keeps camera settings and scene; lens, stop, filter… are offered, not copied
  const t = blank(from.cam);
  for (const k of ['fps', 'shutter', 'wb', 'iso', 'lut', 'scene']) t[k] = from[k];
  t.shot = /^\d+$/.test(from.shot) ? String(Number(from.shot) + 1) : '';
  for (const k of SHOT_SUGGEST) { const v = has(from, k) ? from[k] : from.sug[k]; if (v && (k !== 'filters' || v.length)) t.sug[k] = v; }
  return insertAfterCam(t);
}
function addScene(from) { const t = addShot(from); t.scene = ''; t.shot = ''; save(); return t; }

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
    <button class="btn" data-close>Close</button></div></div>`;
  $('#sheet .modal').addEventListener('click', ev => { if (ev.target.hasAttribute('data-close')) closeSheet(); });
  onMount && onMount($('#sheet .sheet'));
}

/* ---------- DAY page: one sheet per roll ---------- */
function days() { return [...new Set(S.takes.map(t => t.date))].sort(); }

function viewDay() {
  closePanel();
  const ds = days(); if (!ds.includes(S.viewDate)) S.viewDate = ds.length ? ds[ds.length - 1] : today();
  const di = ds.indexOf(S.viewDate);
  const shown = S.takes.filter(t => t.date === S.viewDate && (!S.show.length || S.show.includes(t.cam)));
  const rolls = [];
  for (const t of shown) { const k = t.cam + '|' + t.roll; let r = rolls.find(x => x.k === k); if (!r) rolls.push(r = { k, cam: t.cam, roll: t.roll, takes: [] }); r.takes.push(t); }

  const sheets = rolls.map(r => {
    const groups = [];
    for (const t of r.takes) { const g = groups[groups.length - 1]; if (g && sameShot(g[0], t)) g.push(t); else groups.push([t]); }
    const rows = groups.map(g => {
      const runs = []; for (const t of g) { const ru = runs[runs.length - 1]; if (ru && detailKey(ru[0]) === detailKey(t)) ru.push(t); else runs.push([t]); }
      const runStart = new Map(runs.map(ru => [ru[0], ru]));
      return g.map((t, i) => {
        const ru = runStart.get(t);
        const det = ru ? `<td class="det" rowspan="${ru.length}"><button data-det="${ru.map(x => x.id).join(',')}" style="-webkit-line-clamp:${ru.length * 2}">${h(detailText(t)) || '<span style="color:var(--subtle)">—</span>'}</button></td>` : '';
        const ty = typeOf(t.type);
        return `<tr class="${i === g.length - 1 ? 'grp-end' : ''}">
          ${i === 0 ? `<td class="sc" rowspan="${g.length}">${h(t.scene || '—')}</td><td class="sc" rowspan="${g.length}">${h(t.shot || '—')}</td>` : ''}
          <td class="tc-cell"><button data-t="${t.id}"><span class="tk ${t.circled ? 'circ' : ''} ${NO_NUMBER.includes(t.type) ? 'sp' : ''}">${h(takeLabel(t))}</span>
            <span class="clipno">${String(clipNo(t)).padStart(3, '0')}</span></button></td>${det}</tr>`;
      }).join('');
    }).join('');
    const c = cam(r.cam);
    return `<section class="roll"><div class="roll-band" style="background:${c.color}"><b>Cam ${h(r.cam)} · Roll ${h(r.roll)}</b>
      <button data-share="${h(r.k)}">Share</button></div>
      <table class="rt"><colgroup><col style="width:17%"><col style="width:17%"><col style="width:28%"><col></colgroup>
      <tr><th>Scene</th><th>Shot</th><th>Take · Clip</th><th>Details</th></tr>${rows}</table>
      <div class="roll-end">${r.takes.length} clips · ${r.takes.filter(t => t.circled).length} circled</div></section>`;
  }).join('');

  const fmt = S.cameras.filter(c => c.format).map(c => c.l + ': ' + c.format).join(' · ');
  $('#app').innerHTML = `<header class="top"><button class="nav l" onclick="go('help')">Help</button><h1>Camera Report</h1>
    <button class="nav r" onclick="go('setup')">Setup</button></header>
    <div class="dayhead"><div><div class="lbl">Project</div><div class="v">${h(S.project)}</div>
      ${fmt ? `<div class="lbl" style="margin-top:4px">Camera / format</div><div style="font-size:14px">${h(fmt)}</div>` : ''}</div>
      <div><div class="lbl">Date</div><div class="datebar"><button id="dprev" ${di > 0 ? '' : 'disabled style="opacity:.3"'}>‹</button>
        <span class="v">${h(S.viewDate.split('-').reverse().join('/'))}</span><button id="dnext" ${di >= 0 && di < ds.length - 1 ? '' : 'disabled style="opacity:.3"'}>›</button></div>
        <button class="pbtn" id="shareday" style="padding:0">Share day</button></div></div>
    <div class="filters"><span class="lbl">Show</span><div class="cams">
      <button data-show="" class="${S.show.length ? '' : 'on'}" style="${S.show.length ? '' : 'background:var(--chip-on-bg);color:var(--chip-on-fg);font-size:15px'}">All</button>
      ${S.cameras.map(c => `<button data-show="${h(c.l)}" class="${S.show.includes(c.l) ? 'on' : ''}" style="${S.show.includes(c.l) ? 'background:' + c.color : ''}">${h(c.l)}</button>`).join('')}</div></div>
    <main>${sheets || `<div class="empty">Nothing rolled ${S.viewDate === today() ? 'today' : 'on this day'} yet.<br><br>Pick the camera below and tap <b>+ Take</b>.</div>`}</main>`;

  const cur = lastOf(S.camera);
  $('#toolbar').innerHTML = `<div class="cams">${S.cameras.map(c => `<button data-cam="${h(c.l)}" class="${c.l === S.camera ? 'on' : ''}" style="${c.l === S.camera ? 'background:' + c.color : ''}">${h(c.l)}</button>`).join('')}</div>
    <span class="grow"></span>${cur ? `<button class="tbtn" id="open">Last take</button>` : ''}<button class="tbtn primary" id="addt">+ Take</button>`;
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => go('t/' + b.dataset.t));
  document.querySelectorAll('[data-det]').forEach(b => b.onclick = () => detailSheet(b.dataset.det.split(',').map(take)));
  document.querySelectorAll('[data-share]').forEach(b => b.onclick = () => { const [l, ro] = b.dataset.share.split('|'); shareSheet(`Roll ${ro}`, S.takes.filter(t => t.cam === l && t.roll === ro)); });
  document.querySelectorAll('[data-show]').forEach(b => b.onclick = () => {
    const v = b.dataset.show; if (!v) S.show = []; else S.show = S.show.includes(v) ? S.show.filter(x => x !== v) : [...S.show, v];
    if (S.show.length === S.cameras.length) S.show = []; save(); viewDay();
  });
  document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { S.camera = b.dataset.cam; save(); viewDay(); });
  $('#shareday').onclick = () => shareSheet('Day ' + S.viewDate, S.takes.filter(t => t.date === S.viewDate));
  if ($('#dprev')) $('#dprev').onclick = () => { if (di > 0) { S.viewDate = ds[di - 1]; viewDay(); } };
  if ($('#dnext')) $('#dnext').onclick = () => { if (di < ds.length - 1) { S.viewDate = ds[di + 1]; viewDay(); } };
  if ($('#open')) $('#open').onclick = () => go('t/' + cur.id);
  $('#addt').onclick = () => {
    const last = lastOf(S.camera);
    if (!last) { const t = insertAfterCam(blank(S.camera)); go('t/' + t.id + '/scene'); return; }
    const t = addTake(last); toast(`Take ${takeLabel(t)} · clip ${String(clipNo(t)).padStart(3, '0')} added`); viewDay();
  };
}

function detailSheet(list) {
  const t0 = list[0];
  const rows = list.map(t => `<div style="margin:0 4px 6px"><b>${h(takeLabel(t))}</b> · clip ${String(clipNo(t)).padStart(3, '0')}${t.circled ? ' · circled' : ''}
    ${t.tc ? ' · TC ' + h(t.tc) : ''}${t.notes ? `<br><span style="color:var(--muted)">${h(t.notes)}</span>` : ''}</div>`).join('');
  sheet(`${t0.scene || '—'} / ${t0.shot || '—'} · ${list.length} take${list.length > 1 ? 's' : ''}`,
    `<div class="detail">${h(detailText(t0, true)).replace(/ · /g, '<br>') || '—'}</div>${rows}
     <button class="btn primary" id="opent">Open take ${h(takeLabel(t0))}</button>`, el => {
      el.querySelector('#opent').onclick = () => { closeSheet(); go('t/' + t0.id); };
    });
}

/* ---------- TAKE page ---------- */
let active = null;

function fieldHTML(t, k, big, extra = '') {
  if (!visible(k)) return '';
  const f = F[k], v = show(k, t[k]), s = !v && t.sug[k] != null ? show(k, t.sug[k]) : '';
  const cls = f.kind === 'area' ? 'txt' : '';
  return `<button class="tf ${big ? 'big' : ''} ${active === k ? 'active' : ''}" data-f="${k}"><span class="lbl">${f.label}</span>
    <span class="v ${cls} ${s ? 'sug' : ''}">${h(v || s)}</span>${extra}</button>`;
}
function row(cls, cells) { const c = cells.filter(Boolean); return c.length ? `<div class="tr c${c.length}">${c.join('')}</div>` : ''; }

function renderTake(t) {
  const list = S.takes.filter(x => x.cam === t.cam && x.roll === t.roll), i = list.indexOf(t);
  const c = cam(t.cam), ty = typeOf(t.type);
  const takeBox = `<div class="tf big takebox ${active === 'take' ? 'active' : ''}" data-f="take"><span class="lbl">Take / Clip</span>
    ${t.type !== 'Take' ? `<span class="typechip">${h(ty[0] === 'Disparo' ? 'False start' : ty[0] === 'Claquete' ? 'Claquete (slate only)' : ty[2])}</span>` : ''}
    <div class="tline"><span class="tno">${h(takeLabel(t))}${t.circled ? ' <span class="circ-mark">●</span>' : ''}</span><span class="cno">/ ${String(clipNo(t)).padStart(3, '0')}</span></div>
    <div class="takenav"><button data-nav="-1" ${i > 0 ? '' : 'disabled'} aria-label="Previous take">‹</button>
      <button data-nav="1" ${i < list.length - 1 ? '' : 'disabled'} aria-label="Next take">›</button>
      <button class="add" data-add="take" aria-label="Add take">+</button></div></div>`;
  $('#tp').innerHTML =
    row('', [`<div class="tf static"><span class="lbl">Project</span><span class="v">${h(S.project)}</span></div>`,
      `<div class="tf static"><span class="lbl">Date</span><span class="v">${h(t.date.split('-').reverse().join('/'))}</span></div>`]) +
    row('', [`<button class="tf" data-f="camera"><span class="lbl">Camera / Format</span><span class="v" style="color:${c.color}">${h(t.cam)}${c.format ? ' · ' + h(c.format) : ''}</span></button>`,
      `<div class="tf roll-f ${active === 'roll' ? 'active' : ''}" style="--roll-color:${c.color}" data-f="roll"><span class="lbl">Roll</span><span class="v">${h(t.roll)}</span>
        <button class="plus" data-add="roll" aria-label="New roll" style="top:3px;height:28px">+</button></div>`]) +
    row('', ['fps', 'shutter', 'wb', 'iso'].map(k => fieldHTML(t, k))) +
    row('', [fieldHTML(t, 'scene', true, '<span class="plus" data-add="scene" role="button" aria-label="New scene">+</span>'),
      fieldHTML(t, 'shot', true, '<span class="plus" data-add="shot" role="button" aria-label="New shot">+</span>'), takeBox]) +
    row('', ['lens', 'stop', 'filters'].map(k => fieldHTML(t, k, true))) +
    row('', ['focus', 'height', 'tilt'].map(k => fieldHTML(t, k, true))) +
    row('', ['lut', 'tc'].map(k => fieldHTML(t, k))) +
    row('', [fieldHTML(t, 'desc')]) + row('', [fieldHTML(t, 'notes')]);

  document.querySelectorAll('#tp [data-f]').forEach(b => b.onclick = ev => {
    if (ev.target.closest('[data-add],[data-nav]')) return;
    const k = b.dataset.f;
    if (k === 'camera') return toast('Camera and format: change them in Setup');
    if (k === 'roll') return openPanel(t, 'roll');
    openPanel(t, k);
  });
  document.querySelectorAll('#tp [data-nav]').forEach(b => b.onclick = () => { const n = list[i + Number(b.dataset.nav)]; if (n) go('t/' + n.id + (active && active !== 'take' ? '/' + active : '')); });
  document.querySelectorAll('#tp [data-add]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const what = b.dataset.add;
    if (what === 'take') { const n = addTake(t); toast(`Take ${takeLabel(n)} · clip ${String(clipNo(n)).padStart(3, '0')}`); go('t/' + n.id); }
    if (what === 'shot') { const n = addShot(t); go('t/' + n.id + '/shot'); }
    if (what === 'scene') { const n = addScene(t); go('t/' + n.id + '/scene'); }
    if (what === 'roll') rollSheet(t);
  });
}

function viewTake(id, field) {
  const t = take(id); if (!t) return go('');
  active = null;
  $('#app').innerHTML = `<header class="top"><button class="nav l" id="back">‹ Day</button><h1>Cam ${h(t.cam)} · ${h(t.roll)}</h1>
    <button class="nav r" id="more">More</button></header><main><div class="tp" id="tp"></div></main>`;
  $('#toolbar').innerHTML = '';
  renderTake(t);
  $('#back').onclick = () => { S.viewDate = t.date; save(); go(''); };
  $('#more').onclick = () => sheet('This take', `<button class="btn" id="circ">${t.circled ? 'Uncircle' : 'Circle'} this take</button>
    <button class="btn" id="dup">Add take after this one</button><button class="btn" style="color:var(--danger)" id="del">Delete this take</button>`, el => {
    el.querySelector('#circ').onclick = () => { t.circled = !t.circled; save(); closeSheet(); renderTake(t); };
    el.querySelector('#dup').onclick = () => { closeSheet(); const n = addTake(t); go('t/' + n.id); };
    el.querySelector('#del').onclick = () => { if (!confirm('Delete this take? Clip numbers after it move up.')) return;
      const list = S.takes.filter(x => x.cam === t.cam && x.roll === t.roll), i = list.indexOf(t);
      S.takes = S.takes.filter(x => x !== t); save(); closeSheet(); const n = list[i - 1] || list[i + 1]; n ? go('t/' + n.id) : go(''); };
  });
  if (field) openPanel(t, field);
}

function rollSheet(t) {
  const r = curRoll(t.cam), m = r.match(/^(.*?)(\d+)$/);
  const next = m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') : r + '-2';
  sheet('Card change · camera ' + t.cam, `<p>New takes on camera ${h(t.cam)} go to the next roll. The clip count starts again at 001.
    Nothing else changes: your next <b>+</b> on take, shot or scene decides what comes next.</p>
    <label class="field" style="padding:0 4px 12px"><span>Next roll</span><input id="nr" value="${h(next)}" autocapitalize="characters"></label>
    <button class="btn primary" id="go">Start roll</button>`, el => {
    el.querySelector('#go').onclick = () => {
      const v = el.querySelector('#nr').value.trim().toUpperCase(); if (!v) return;
      S.roll[t.cam] = v; save(); closeSheet();
      toast('Next takes go to roll ' + v);
    };
  });
}

/* ---------- bottom input panel ---------- */
function closePanel() { active = null; const p = $('#panel'); if (p) p.innerHTML = ''; document.documentElement.style.setProperty('--panel-h', '0px'); }
const nextField = k => { const i = ORDER.indexOf(k); return ORDER.slice(i + 1).find(visible) || null; };

function openPanel(t, k) {
  active = k; renderTake(t);
  if (k === 'take') panelTake(t);
  else if (k === 'roll') panelRoll(t);
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
  if (k === 'notes') { const p = prevTake(t); if (p && p.notes && p.notes !== t.notes) top = `<button class="chip last" data-prevnote>Same as take before: ${h(p.notes.slice(0, 40))}${p.notes.length > 40 ? '…' : ''}</button>`; }
  const chips = f.list ? ordered(f.list).filter(v => v !== s).map(v => `<button class="chip ${v === t[k] ? 'on' : ''}" data-v="${h(v)}">${h(show(k, v))}</button>`).join('') : '';
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
    `${input}${top || chips ? `<div class="chips" style="margin-top:${input ? 8 : 0}px">${top}${chips}</div>` : ''}${keys}`, !has(t, k));
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
    if (x === '⌫') v = v.slice(0, -1);
    else if (x === 'C') v = '';
    else if (x === '−') v = v.startsWith('-') ? v.slice(1) : '-' + v;
    else if (/^[\d.]$/.test(x) || x === '/' || x === ':') v += x;
    else v = v.replace(/(mm|cm|m|ft|'|"|°)$/, '') + x;
    setVal(t, k, v);
  });
}

function panelStop(t) {
  const s = t.sug.stop, cur = t.stop || '';
  const [base, fr] = cur.split(' ');
  const cine = S.stopStyle !== 'decimal';
  const rec = ordered('stops', Object.keys(S.used).filter(x => x.startsWith('stops|')).map(x => x.slice(6))).slice(0, 4);
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

function panelFilters(t) {
  const s = t.sug.filters;
  let fam = null;
  const draw = () => {
    const rows = t.filters.map((x, i) => `<div class="filt-row"><span>${h(x.fam)} ${h(x.dens)}</span><button class="x" data-del="${i}" aria-label="Remove">×</button></div>`).join('');
    const famList = ordered('fam', Object.keys(S.families));
    const body = (s && !t.filters.length ? `<div class="chips"><button class="chip last" data-same>Last: ${h(fmtFilters(s))}</button></div>` : '') + rows +
      (fam ? `<div class="p-sub">${h(fam)} · strength</div><div class="chips">${ordered('dens:' + fam, S.families[fam]).map(d => `<button class="chip" data-dens="${h(d)}">${h(d)}</button>`).join('')}</div>`
        : `<div class="p-sub">${t.filters.length ? 'Add another filter' : 'Filter'}</div><div class="chips">${famList.map(v => `<button class="chip" data-fam="${h(v)}">${h(v)}</button>`).join('')}</div>`);
    panelShell(t, 'filters', 'Filter', fmtFilters(t.filters) || (s ? fmtFilters(s) : '—'), body, !t.filters.length);
    const p = $('#panel');
    const push = (f, d) => { t.filters.push({ fam: f, dens: d }); fam = null; delete t.sug.filters; save(); renderTake(t); draw(); };
    p.querySelectorAll('[data-fam]').forEach(b => b.onclick = () => { const f = b.dataset.fam; markUsed('fam', f); if (!S.families[f].length) push(f, ''); else { fam = f; draw(); } });
    p.querySelectorAll('[data-dens]').forEach(b => b.onclick = () => { markUsed('dens:' + fam, b.dataset.dens); push(fam, b.dataset.dens); });
    p.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { t.filters.splice(+b.dataset.del, 1); save(); renderTake(t); draw(); });
    const sm = p.querySelector('[data-same]'); if (sm) sm.onclick = () => { t.filters = JSON.parse(JSON.stringify(s)); delete t.sug.filters; save(); renderTake(t); draw(); };
    fitPanel('filters');
  };
  draw();
}

function panelTake(t) {
  const body = `<div class="p-sub">What was this clip</div><div class="chips">${TYPES.map(([v, , en]) => `<button class="chip ${t.type === v ? 'on' : ''}" data-type="${v}">${h(v === 'Disparo' ? 'False start' : v === 'Claquete' ? 'Claquete' : en)}</button>`).join('')}</div>
    <div class="p-sub">Circle</div><div class="chips"><button class="chip ${t.circled ? 'on' : ''}" id="circ">${t.circled ? '● Circled' : 'Circle this take'}</button></div>
    <p style="margin:8px 4px 0;font-size:13px;color:var(--muted)">Claquete and false start don't use a take number: changing one renumbers the takes after it. Clip numbers follow the roll.</p>`;
  panelShell(t, 'take', 'Take / Clip', `${takeLabel(t)} / ${String(clipNo(t)).padStart(3, '0')}`, body, false, true);
  const p = $('#panel');
  p.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { t.type = b.dataset.type; save(); renderTake(t); panelTake(t); fitPanel('take'); });
  $('#circ').onclick = () => { t.circled = !t.circled; save(); renderTake(t); panelTake(t); fitPanel('take'); };
}
function panelRoll(t) { closePanel(); rollSheet(t); }

/* ---------- setup & help ---------- */
function viewSetup() {
  closePanel();
  const famText = Object.entries(S.families).map(([f, d]) => f + (d.length ? ': ' + d.join(', ') : '')).join('\n');
  const lists = [['lenses', 'Lenses'], ['scenes', 'Scenes'], ['fps', 'Frame rates'], ['shutter', 'Shutter angles'], ['iso', 'ISO / EI'], ['wb', 'White balance (K)'], ['luts', 'LUTs']]
    .map(([k, label]) => `<label class="field"><span>${label} · one per line</span><textarea data-listedit="${k}">${h(S.lists[k].join('\n'))}</textarea></label>`).join('');
  $('#app').innerHTML = `<header class="top"><button class="nav l" onclick="go('')">‹ Day</button><h1>Setup</h1><span></span></header><main>
    <label class="field"><span>Project</span><input id="pname" value="${h(S.project)}"></label>
    <div class="field"><span>Look</span><div class="seg" id="theme"><button data-v="light" class="${S.theme === 'light' ? 'on' : ''}">Light (paper)</button><button data-v="dark" class="${S.theme === 'dark' ? 'on' : ''}">Dark</button></div></div>
    <div class="field"><span>Cameras · letter, color, format</span>
      ${S.cameras.map((c, i) => `<div class="camrow"><input type="text" data-cl="${i}" value="${h(c.l)}" style="width:56px;flex:none;text-transform:uppercase">
        <input type="color" data-cc="${i}" value="${h(c.color)}"><input type="text" data-cf="${i}" value="${h(c.format)}" placeholder="e.g. Venice 2 · 6K 17:9">
        <button class="x" data-cdel="${i}" aria-label="Remove camera">×</button></div>`).join('')}
      <button class="pbtn" id="addcam" style="padding:0">+ Camera</button></div>
    <div class="field"><span>Fields on the take page</span><div class="checks">${HIDEABLE.map(k => `<button class="chip ${visible(k) ? 'on' : ''}" data-hide="${k}">${F[k].label}</button>`).join('')}</div></div>
    <label class="field"><span>Filter families · "Family: strengths" one per line</span><textarea id="fams" style="min-height:180px">${h(famText)}</textarea></label>
    ${lists}
    <div class="field"><button class="btn" id="reset" style="width:100%;min-height:44px;border:1px solid var(--line-strong);border-radius:8px;background:none;color:var(--danger);font-weight:700">Erase everything on this device</button></div></main>`;
  $('#toolbar').innerHTML = '';
  $('#pname').oninput = ev => { S.project = ev.target.value || 'Untitled project'; save(); };
  $('#theme').querySelectorAll('button').forEach(b => b.onclick = () => { S.theme = b.dataset.v; save(); applyTheme(); viewSetup(); });
  document.querySelectorAll('[data-cl]').forEach(i => i.onchange = () => { const v = i.value.trim().toUpperCase(); if (v) { const c = S.cameras[+i.dataset.cl], old = c.l; c.l = v; S.takes.forEach(t => { if (t.cam === old) t.cam = v; }); save(); } });
  document.querySelectorAll('[data-cc]').forEach(i => i.oninput = () => { S.cameras[+i.dataset.cc].color = i.value; save(); });
  document.querySelectorAll('[data-cf]').forEach(i => i.oninput = () => { S.cameras[+i.dataset.cf].format = i.value; save(); });
  document.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => { if (S.cameras.length > 1 && confirm('Remove this camera from the list? Its takes stay.')) { S.cameras.splice(+b.dataset.cdel, 1); S.camera = S.cameras[0].l; save(); viewSetup(); } });
  $('#addcam').onclick = () => { const used = S.cameras.map(c => c.l); const l = 'ABCDEFGHIJ'.split('').find(x => !used.includes(x)) || 'X'; S.cameras.push({ l, color: PALETTE[S.cameras.length % PALETTE.length], format: '' }); save(); viewSetup(); };
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
    <p><b>Day page</b>: one sheet per roll, like the paper report. Scene, shot, takes with their clip numbers, and the details
    (lens, stop, filter, height…). When something changes in the middle of a shot, the details split at that take.
    Tap a take to open it; tap the details to read everything, notes included.</p>
    <p><b>+ Take</b> (bottom) adds the next take to the last shot of the camera you picked, as a copy of the take before. Nothing opens.</p>
    <p><b>Take page</b>: tap any box to fill it. <b>Next ›</b> goes to the next box, <b>Done</b> closes the keypad, <b>‹ Day</b> goes back.
    In Take / Clip, <b>‹ ›</b> walk through every take of the roll and <b>+</b> adds a take. Tap the box itself to mark claquete, false start, MOS… or circle it.</p>
    <p><b>+</b> on <b>Shot</b> starts the next shot (take 1, same scene and camera settings). Lens, stop, filter, height and tilt start empty,
    with the last value offered first: one tap keeps it. <b>+</b> on <b>Scene</b> does the same one level up.</p>
    <p><b>+</b> on <b>Roll</b> is the card change: the next takes go to the new roll.</p>
    <p><b>Stop</b>: pick the stop and the fraction (2.8 + ⅓). The CSV gets the real number (3.2) so Silverstack reads it.</p>
    <p><b>Share</b> (day or roll): PDF, CSV for Silverstack's ZoeLog import, or CSV for its ScriptE import (shot in its own column).
    Data stays on this phone.</p></main>`;
  $('#toolbar').innerHTML = '';
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
    <div class="meta">Camera <b>${h(r.cam)}</b>${c.format ? ' · ' + h(c.format) : ''} · Roll <b>${h(r.roll)}</b> · ${h(r.takes[0].date.split('-').reverse().join('/'))} ·
      ${r.takes.length} clips · circled ${r.takes.filter(t => t.circled).length}</div>
    <table><thead><tr><th>Scene</th><th>Shot</th><th>Take</th><th>Clip</th><th>Details</th><th>Notes</th></tr></thead><tbody>
    ${r.takes.map((t, i) => { const p = r.takes[i - 1], same = p && sameShot(p, t), sameDet = same && detailKey(p) === detailKey(t);
      return `<tr><td>${same ? '' : h(t.scene)}</td><td>${same ? '' : h(t.shot)}</td><td class="n">${h(takeLabel(t))}${t.circled ? ' ●' : ''}</td><td class="n">${String(clipNo(t)).padStart(3, '0')}</td>
      <td>${sameDet ? '〃' : h(detailText(t, true))}</td><td>${h([t.tc && 'TC ' + t.tc, t.notes].filter(Boolean).join(' — '))}</td></tr>`; }).join('')}
    </tbody></table></section>`; }).join('');
  setTimeout(() => window.print(), 50);
}

/* ---------- router ---------- */
function route() {
  closeSheet();
  const [v, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (v === 't') viewTake(a, b);
  else if (v === 'setup') viewSetup();
  else if (v === 'help') viewHelp();
  else viewDay();
  if (v !== 't' || !b) scrollTo(0, 0);
}
applyTheme();
addEventListener('hashchange', route);
route();

// Offline cache only when published (https), so edits show up while testing on localhost.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
