// app.js
// -----------------------------------------------------------------------------
// Controller + generic renderer. Builds the trace, exposes it for debugging,
// renders one scene at a time, and wires Prev / Next / Play / Pause / Reset.
// No build step, no network: plain ES modules served over local HTTP.
// -----------------------------------------------------------------------------

import { buildTrace, round } from './toy-decoder-math.js';
import { SCENES, LEVELS } from './toy-decoder-scenes.js';
import { CONFIG } from './toy-decoder-data.js';

const trace = buildTrace();
// Debug hook, exactly as requested: inspect the full trace from the console.
window.TOY_DECODER_TRACE = trace;
// eslint-disable-next-line no-console
console.log('%cwindow.TOY_DECODER_TRACE', 'color:#2b7a9b;font-weight:bold', trace);

const D = CONFIG.displayDecimals;
const NEG_INF = -Infinity;

// ---- number / html helpers --------------------------------------------------
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function fmt(x, isInt = false) {
  if (x === NEG_INF) return '−∞';           // −∞
  if (x === Infinity) return '∞';
  if (typeof x !== 'number') return esc(x);
  if (isInt) return String(x);
  let v = round(x, D);
  if (Object.is(v, -0)) v = 0;
  return v.toFixed(D);
}

// ---- matrix / vector rendering ---------------------------------------------
function renderMatrix(p) {
  const { label, data, rowLabels, colLabels, color = 'plain', small,
    highlightRows = [], maskInf, zeroFade, markNeg, intCols = [], padRow } = p;
  const nCols = data[0].length;
  const shape = `${data.length}×${nCols}`;
  let html = `<div class="card mat ${color}${small ? ' small' : ''}">`;
  html += `<div class="card-head"><span class="card-label">${label}</span>`
        + `<span class="shape">${shape}</span></div>`;
  html += '<table><thead><tr>';
  if (rowLabels) html += '<th class="corner"></th>';
  for (let j = 0; j < nCols; j++) html += `<th>${colLabels ? esc(colLabels[j]) : j}</th>`;
  html += '</tr></thead><tbody>';
  for (let i = 0; i < data.length; i++) {
    const cls = [];
    if (highlightRows.includes(i)) cls.push('hl-row');
    if (padRow === i) cls.push('pad-row');
    html += `<tr class="${cls.join(' ')}">`;
    if (rowLabels) html += `<th class="rowlab">${esc(rowLabels[i])}</th>`;
    for (let j = 0; j < nCols; j++) {
      const cell = data[i][j];
      const cc = [];
      const isInt = intCols.includes(j);
      if (cell === NEG_INF && maskInf) cc.push('cell-mask');
      if (typeof cell === 'number') {
        const r = round(cell, D);
        if (zeroFade && r === 0) cc.push('cell-zero');
        if (markNeg && cell < 0) cc.push('cell-neg');
        html += `<td class="${cc.join(' ')}">${fmt(cell, isInt)}</td>`;
      } else {
        html += `<td class="cell-text">${esc(cell)}</td>`;
      }
    }
    if (p.rowSum) html += `<td class="rowsum">Σ=${fmt(p.rowSum[i])}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

function renderVector(p) {
  const { label, data, labels, color = 'plain', highlightIdx = [] } = p;
  let html = `<div class="card vec ${color}"><div class="card-head">`
           + `<span class="card-label">${label}</span>`
           + `<span class="shape">1×${data.length}</span></div><div class="vrow">`;
  for (let j = 0; j < data.length; j++) {
    html += `<div class="vcell${highlightIdx.includes(j) ? ' hl' : ''}">`
          + `${labels ? `<span class="vlab">${esc(labels[j])}</span>` : ''}`
          + `<span class="vval">${fmt(data[j])}</span></div>`;
  }
  html += '</div></div>';
  return html;
}

function renderBars(p) {
  const max = Math.max(...p.items.map((it) => it.value), 0.0001);
  let html = `<div class="card bars"><div class="card-head">`
           + `<span class="card-label">${esc(p.label)}</span></div><div class="barlist">`;
  for (const it of p.items) {
    const pct = (it.value / max) * 100;
    const isTop = it.name === p.top && !it.masked;
    const cls = ['bar-row', it.masked ? 'masked' : '', isTop ? 'top' : ''].join(' ');
    html += `<div class="${cls}">`
          + `<span class="bar-name">${esc(it.name)}</span>`
          + `<span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>`
          + `<span class="bar-val">${it.masked ? 'masked' : fmt(it.value)}</span></div>`;
  }
  html += '</div></div>';
  return html;
}

// ---- SVG schematics that echo image 1 / 2 / 3 -------------------------------
function box(x, y, w, h, label, cls, active, opts = {}) {
  const on = active ? ' on' : '';
  const rx = opts.rx ?? 8;
  const dash = opts.dash ? ' stroke-dasharray="5 4"' : '';
  const t = opts.sub
    ? `<text x="${x + w / 2}" y="${y + h / 2 - 4}" class="dlabel">${label}</text>`
      + `<text x="${x + w / 2}" y="${y + h / 2 + 12}" class="dsub">${opts.sub}</text>`
    : `<text x="${x + w / 2}" y="${y + h / 2 + 4}" class="dlabel">${label}</text>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="node ${cls}${on}"${dash}/>${t}`;
}
const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edge" marker-end="url(#ah)"/>`;
const DEFS = '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="ahead"/></marker></defs>';

function diagramFull(active) {
  const a = (id) => active === id || active === 'all';
  const cx = 180;
  let s = `<svg viewBox="0 0 360 452" class="schematic">${DEFS}`;
  // logits row (p1 p2 p3), last highlighted
  const px = [96, 168, 240];
  for (let i = 0; i < 3; i++) {
    const isLast = i === 2;
    const on = (a('logits') || a('p-last')) && (isLast || a('logits'));
    s += box(px[i], 20, 56, 40, `p${i + 1}`, isLast ? 'out pred' : 'out', on && (isLast || a('logits')));
  }
  s += `<text x="${cx}" y="12" class="dcap">output logits · p${CONFIG.m} predicts next</text>`;
  s += arrow(cx, 96, cx, 64);
  s += box(70, 96, 220, 36, 'Unembedding layer', 'embed', a('unembed'));
  s += arrow(cx, 176, cx, 134);
  s += box(70, 176, 220, 56, 'Transformer block', 'block', a('block'), { dash: true, sub: '(masked attn + FFN + residuals)' });
  s += arrow(cx, 276, cx, 234);
  s += box(70, 276, 220, 36, 'Embedding layer', 'embed', a('embed'));
  s += arrow(cx, 356, cx, 314);
  const tx = [96, 168, 240];
  for (let i = 0; i < 3; i++) s += box(tx[i], 356, 56, 40, `x${i + 1}`, 'tok', a('tokens'));
  s += `<text x="${cx}" y="440" class="dcap">input tokens (m = ${CONFIG.m}): the · dog · bit</text>`;
  s += '</svg>';
  return s;
}

function diagramBlock(active) {
  const a = (id) => active === id;
  const cx = 210, bw = 240, bx = 90;
  let s = `<svg viewBox="0 0 420 520" class="schematic">${DEFS}`;
  s += `<text x="${cx}" y="16" class="dcap">output</text>`;
  s += arrow(cx, 54, cx, 24);
  s += box(bx, 54, bw, 34, 'Add', 'add', a('add2'));
  s += arrow(cx, 120, cx, 88);
  s += box(bx, 120, bw, 40, 'Feed-forward', 'ffn', a('ffn'));
  s += arrow(cx, 196, cx, 160);
  s += box(bx, 196, bw, 32, 'Layer norm  (omitted)', 'ln', a('ln2'), { dash: true });
  s += arrow(cx, 262, cx, 228);
  s += box(bx, 262, bw, 34, 'Add', 'add', a('add1'));
  s += arrow(cx, 328, cx, 296);
  s += box(bx, 328, bw, 40, 'Masked self-attention', 'attn', a('attn'));
  s += arrow(cx, 404, cx, 368);
  s += box(bx, 404, bw, 32, 'Layer norm  (omitted)', 'ln', a('ln1'), { dash: true });
  s += arrow(cx, 470, cx, 436);
  s += `<text x="${cx}" y="492" class="dcap">input  (residual stream)</text>`;
  // residual side-lines (dashed) from input up to the two Add nodes
  s += `<path d="M60 462 L40 462 L40 279 L${bx} 279" class="resid${a('add1') ? ' on' : ''}"/>`;
  s += `<path d="M40 279 L20 279 L20 71 L${bx} 71" class="resid${a('add2') ? ' on' : ''}"/>`;
  s += `<text x="14" y="180" class="dside" transform="rotate(-90 14 180)">residual</text>`;
  s += '</svg>';
  return s;
}

function diagramAttn(active) {
  const steps = [
    ['qkv', 'X→Q,K,V', 'qkv'],
    ['rope', "RoPE Q',K'", 'rope'],
    ['scores', "Q'·K'ᵀ/√d", 'score'],
    ['mask', 'causal mask', 'score'],
    ['softmax', 'softmax → A', 'attn'],
    ['av', 'A·V → O', 'out'],
  ];
  let s = `<svg viewBox="0 0 760 120" class="schematic wide">${DEFS}`;
  s += box(8, 44, 60, 40, 'X', 'tok', active === 'x');
  let x = 84;
  const w = 104, gap = 108;
  for (let i = 0; i < steps.length; i++) {
    const [id, label, cls] = steps[i];
    s += arrow(x - 16, 64, x, 64);
    s += box(x, 44, w, 40, label, cls, active === id);
    x += gap;
  }
  s += arrow(x - 16, 64, x, 64);
  s += box(x, 44, 60, 40, 'O', 'out', active === 'av');
  s += '</svg>';
  return s;
}

function renderDiagram(p) {
  const svg = p.level === 'full' ? diagramFull(p.active)
    : p.level === 'block' ? diagramBlock(p.active)
      : diagramAttn(p.active);
  return `<div class="diagram-wrap ${p.level}">${svg}</div>`;
}

// ---- panel dispatch ---------------------------------------------------------
function renderPanel(p) {
  switch (p.kind) {
    case 'prose': return `<p class="prose">${p.html}</p>`;
    case 'note': return `<div class="note">${p.html}</div>`;
    case 'formula': return `<div class="formula">${p.html}</div>`;
    case 'callout': return `<div class="callout ${p.tone}">${p.html}</div>`;
    case 'row': return `<div class="prow">${p.children.map(renderPanel).join('')}</div>`;
    case 'matrix': return renderMatrix(p);
    case 'vector': return renderVector(p);
    case 'bars': return renderBars(p);
    case 'diagram': return renderDiagram(p);
    default: return '';
  }
}

// ---- controller -------------------------------------------------------------
const state = { i: 0, playing: false, timer: null };
const PLAY_MS = 2800;

const els = {
  crumbs: document.getElementById('crumbs'),
  dots: document.getElementById('dots'),
  title: document.getElementById('scene-title'),
  subtitle: document.getElementById('scene-subtitle'),
  counter: document.getElementById('counter'),
  stage: document.getElementById('stage'),
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  play: document.getElementById('play'),
  reset: document.getElementById('reset'),
};

function renderCrumbs() {
  const cur = SCENES[state.i].level;
  els.crumbs.innerHTML = LEVELS.map((lv, idx) => {
    const on = lv.key === cur ? ' on' : '';
    const sep = idx > 0 ? '<span class="crumb-sep">→</span>' : '';
    return `${sep}<button class="crumb${on}" data-level="${lv.key}">`
         + `${lv.label}<span class="crumb-hint">${lv.hint}</span></button>`;
  }).join('');
  els.crumbs.querySelectorAll('.crumb').forEach((b) => {
    b.onclick = () => {
      const idx = SCENES.findIndex((sc) => sc.level === b.dataset.level);
      if (idx >= 0) go(idx);
    };
  });
}

function renderDots() {
  els.dots.innerHTML = SCENES.map((sc, idx) =>
    `<button class="dot ${sc.level}${idx === state.i ? ' on' : ''}" data-i="${idx}" title="${idx + 1}. ${esc(sc.title)}"></button>`).join('');
  els.dots.querySelectorAll('.dot').forEach((d) => { d.onclick = () => go(+d.dataset.i); });
}

function renderScene() {
  const sc = SCENES[state.i];
  els.title.textContent = `${state.i + 1}. ${sc.title}`;
  els.subtitle.textContent = sc.subtitle || '';
  els.counter.textContent = `scene ${state.i + 1} / ${SCENES.length}`;
  const panels = sc.panels(trace);
  els.stage.innerHTML = panels.map(renderPanel).join('');
  els.stage.scrollTop = 0;
  renderCrumbs();
  renderDots();
  els.prev.disabled = state.i === 0;
  els.next.disabled = state.i === SCENES.length - 1;
}

function go(i) {
  state.i = Math.max(0, Math.min(SCENES.length - 1, i));
  renderScene();
}

function setPlaying(on) {
  state.playing = on;
  els.play.textContent = on ? '❚❚ Pause' : '▶ Play';
  els.play.classList.toggle('active', on);
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  if (on) {
    state.timer = setInterval(() => {
      if (state.i >= SCENES.length - 1) { setPlaying(false); return; }
      go(state.i + 1);
    }, PLAY_MS);
  }
}

els.prev.onclick = () => { setPlaying(false); go(state.i - 1); };
els.next.onclick = () => { setPlaying(false); go(state.i + 1); };
els.reset.onclick = () => { setPlaying(false); go(0); };
els.play.onclick = () => setPlaying(!state.playing);

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { setPlaying(false); go(state.i + 1); }
  else if (e.key === 'ArrowLeft') { setPlaying(false); go(state.i - 1); }
  else if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
  else if (e.key === 'Home') { setPlaying(false); go(0); }
  else if (e.key === 'End') { setPlaying(false); go(SCENES.length - 1); }
});

// initial paint + a small headline number for orientation
document.getElementById('headline').innerHTML =
  `prompt <b>"the dog bit ___"</b> &nbsp;→&nbsp; prediction <b>"${trace.top.token}"</b> `
  + `(p ≈ ${fmt(trace.top.prob)}) &nbsp;·&nbsp; "the dog bit <b>${trace.top.token}</b>"`;
renderScene();
