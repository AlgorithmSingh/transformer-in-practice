import { buildTrace } from '../mini-decoder-demo/toy-decoder-math.js';
import { CONFIG, VOCAB, PROMPT_IDS, PROMPT_TOKENS, E, W_Q, W_K, W_V, W1, B1, W2, B2, U } from '../mini-decoder-demo/toy-decoder-data.js';

const t = buildTrace();
window.TOY_DECODER_TRACE = t;

const DIM = ['det', 'noun', 'verb', 'bias'];
const HEAD = ['h0', 'h1', 'h2', 'h3'];
const TOK = PROMPT_IDS.map((id, i) => `${PROMPT_TOKENS[i]} · pos${i}`);
const LAST = CONFIG.m - 1;
const fmt = (x, d = 3) => x === -Infinity ? '−∞' : Number(x).toFixed(d);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function matrix(label, data, opts = {}) {
  const rows = data.map((row, i) => Array.isArray(row) ? row : [row]);
  const rowLabels = opts.rowLabels || rows.map((_, i) => String(i));
  const colLabels = opts.colLabels || rows[0].map((_, i) => String(i));
  const highlights = new Set(opts.highlightRows || []);
  const htmlRows = rows.map((row, i) => {
    const cells = row.map(v => {
      const isInf = v === -Infinity;
      const isZero = typeof v === 'number' && Math.abs(v) < 1e-12;
      const val = typeof v === 'number' ? fmt(v, opts.decimals ?? 3) : esc(v);
      return `<td class="${isInf ? 'inf' : isZero ? 'zero' : ''}">${val}</td>`;
    }).join('');
    return `<tr class="${highlights.has(i) ? 'highlight' : ''}"><td>${esc(rowLabels[i])}</td>${cells}</tr>`;
  }).join('');
  return `<div class="card"><h3>${label}</h3><div class="table-wrap"><table><thead><tr><th></th>${colLabels.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${htmlRows}</tbody></table></div></div>`;
}

function kvTable(label, rows, opts = {}) {
  return `<div class="card"><h3>${label}</h3><div class="table-wrap"><table><thead><tr>${opts.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${opts.highlightRows?.includes(i) ? 'highlight' : ''}">${r.map((v, j) => `<td>${typeof v === 'number' ? fmt(v, opts.decimals ?? 3) : v}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

function vec(label, arr, labels = DIM) {
  return matrix(label, [arr], { rowLabels: [''], colLabels: labels });
}

function bars(items) {
  const max = Math.max(...items.map(x => x.value));
  return `<div class="card"><h3>Next-token probabilities</h3><div class="bars">${items.map(x => {
    const w = max > 0 ? (x.value / max) * 100 : 0;
    return `<div class="bar-row ${x.top ? 'top' : ''} ${x.masked ? 'masked' : ''}"><div class="bar-label">${esc(x.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div><div>${x.masked ? 'masked' : pct(x.value)}</div></div>`;
  }).join('')}</div></div>`;
}

function flow(items) {
  return `<div class="flow">${items.map(it => it === '→' ? '<span class="arrow">→</span>' : `<span class="${it.class || ''}">${it.text}</span>`).join('')}</div>`;
}

function slide(kicker, title, badge, body, notes) {
  return { kicker, title, badge, body, notes };
}

const lastAttentionSentence = t.A[LAST].map((w, j) => `${fmt(w)} × V(${PROMPT_TOKENS[j]})`).join(' + ');
const lastContextSentence = t.C[LAST].map(x => fmt(x)).join(', ');
const logitRows = VOCAB.map((tok, id) => [tok, t.logits[id], id === CONFIG.padTokenId ? 'yes → −∞ before softmax' : 'no']);
const probRows = t.ranking.map(r => ({ name: r.token, value: r.prob, top: r.token === t.top.token, masked: r.masked }));

const slides = [
  slide('1 · What this deck is', 'A tiny decoder-only transformer, with actual numbers', 'goal', `
    <div class="content">
      ${flow([{text:'token ids', class:'hot'}, '→', {text:'embeddings X', class:'resid'}, '→', {text:'attention C', class:'attn'}, '→', {text:'residual R1', class:'resid'}, '→', {text:'FFN M', class:'ffn'}, '→', {text:'R2 → logits → “the”', class:'hot'}])}
      <div class="note">We are using a deliberately tiny model: m = ${CONFIG.m} tokens, d_model = ${CONFIG.d_model}, one layer, one head, vocab size = ${CONFIG.n_vocab}. These are toy weights, but the math order matches a decoder-only transformer.</div>
      <div class="two">
        ${kvTable('Prompt tokens', PROMPT_IDS.map((id, i) => [i, PROMPT_TOKENS[i], id]), {headers:['position','token','id']})}
        ${kvTable('Vocabulary', VOCAB.map((tok, id) => [id, tok]), {headers:['id','token'], highlightRows:PROMPT_IDS})}
      </div>
    </div>`,
    'Say this first: We are not trying to mimic GPT weights. We are making the smallest possible numeric example that still has the real sequence: ids, embeddings, attention, residuals, feed-forward, unembedding, probabilities.'),

  slide('2 · Image 1', 'm is the number of input tokens, so here m = 3', 'full decoder', `
    <div class="content">
      <div class="big">“the dog bit” → x₁, x₂, x₃ → m = 3</div>
      <div class="formula">x₁ = the, &nbsp; x₂ = dog, &nbsp; x₃ = bit</div>
      <div class="note">The model produces a prediction at every position, but generation uses the last position. Image 1 showed p₄ because its example had m = 4. Our example has m = 3, so we use p₃.</div>
      ${flow([{text:'p₁ predicts after “the”'}, '→', {text:'p₂ predicts after “the dog”'}, '→', {text:'p₃ predicts after “the dog bit”', class:'hot'}])}
    </div>`,
    'This is the p4 confusion resolved. p4 was not the fourth answer token. It was the prediction made from the fourth input position. In this deck, the equivalent is p3.'),

  slide('3 · Embedding lookup', 'Token IDs become vectors: X = E[ids]', 'numbers begin', `
    <div class="content">
      <div class="formula">ids = [1, 2, 3] &nbsp; ⇒ &nbsp; X = E[1], E[2], E[3]</div>
      <div class="two">
        ${matrix('Embedding matrix E', E, {rowLabels: VOCAB, colLabels: DIM, highlightRows: PROMPT_IDS})}
        ${matrix('X = prompt embeddings', t.X, {rowLabels: TOK, colLabels: DIM, highlightRows:[LAST]})}
      </div>
      <div class="note">X is the start of the residual stream. In this toy, dim0 roughly means determiner, dim1 noun/animal, dim2 verb/action, dim3 bias.</div>
    </div>`,
    'Point at the row for bit. It starts as [0, 0, 1, 0.2], mostly a verb signal. It does not yet know enough context.'),

  slide('4 · Image 2', 'The transformer block is two updates added into the same stream', 'residuals', `
    <div class="content">
      <div class="formula">R1 = X + C<br/>R2 = R1 + M</div>
      <div class="three">
        <div class="card"><h3>X</h3><div class="big">original stream</div></div>
        <div class="card"><h3>C</h3><div class="big color-a">attention update</div></div>
        <div class="card"><h3>M</h3><div class="big color-f">feed-forward update</div></div>
      </div>
      <div class="note">Residual means the block does not replace X. It keeps X and adds learned improvements to it. Same shape all the way through: ${CONFIG.m}×${CONFIG.d_model}.</div>
    </div>`,
    'Use the river analogy here. X is the river. Attention pours C into it. Feed-forward pours M into it. The river keeps moving.'),

  slide('5 · Image 3, Step 1', 'Make Q, K, V by multiplying X with learned matrices', 'QKV', `
    <div class="content">
      <div class="formula"><span class="color-q">Q</span> = X·W_Q &nbsp;&nbsp; <span class="color-k">K</span> = X·W_K &nbsp;&nbsp; <span class="color-v">V</span> = X·W_V</div>
      <div class="three">
        ${matrix('Q', t.Q, {rowLabels: TOK, colLabels: HEAD, highlightRows:[LAST]})}
        ${matrix('K', t.K, {rowLabels: TOK, colLabels: HEAD})}
        ${matrix('V', t.V, {rowLabels: TOK, colLabels: HEAD})}
      </div>
      <div class="note">W_Q, W_K, and W_V are learned during training. At inference time they are fixed. Step 1 is just matrix multiplication.</div>
    </div>`,
    'Say: Q and K are not yet attention. They are ingredients. Q asks what am I looking for, K says what can I match on, V is the content I will pass forward.'),

  slide('6 · One row by hand', 'For “bit”, Q is computed from its X row', 'hand calc', `
    <div class="content">
      <div class="formula">X_bit = [${t.X[LAST].map(x => fmt(x)).join(', ')}]</div>
      <div class="two">
        ${matrix('W_Q', W_Q, {rowLabels: DIM, colLabels: HEAD})}
        ${vec('Q_bit = X_bit · W_Q', t.Q[LAST], HEAD)}
      </div>
      <div class="note">This is the simple numeric point from the meeting: after training, the weights are already there, and the current input vector is multiplied by those weights to create Q, K, and V.</div>
    </div>`,
    'This slide is useful if someone asks, where did Q come from? It is not magic. It is X row times W_Q.'),

  slide('7 · Image 3, Step 2', 'RoPE rotates Q and K, not V', 'position', `
    <div class="content">
      <div class="formula">a′ = a cosθ − b sinθ<br/>b′ = a sinθ + b cosθ</div>
      <div class="note">RoPE uses position to rotate coordinate pairs. Here pairs are ${JSON.stringify(CONFIG.ropePairs)} and frequencies are ${JSON.stringify(CONFIG.ropeFreq)}. Position 0 does not rotate; later positions rotate more.</div>
      <div class="two">
        ${matrix("Q' after RoPE", t.Qr, {rowLabels: TOK, colLabels: HEAD, highlightRows:[LAST]})}
        ${matrix("K' after RoPE", t.Kr, {rowLabels: TOK, colLabels: HEAD})}
      </div>
    </div>`,
    'Emphasize that RoPE is not a dot product. It is preparation before the dot product. It makes Q and K position-aware.'),

  slide('8 · RoPE by hand', 'The “bit” query rotates because bit is at position 2', 'rotation', `
    <div class="content">
      <div class="formula">pos(bit) = 2, &nbsp; θ₀ = 2×0.6 = 1.2, &nbsp; θ₁ = 2×0.2 = 0.4</div>
      <div class="two">
        ${vec('Q_bit before RoPE', t.Q[LAST], HEAD)}
        ${vec("Q'_bit after RoPE", t.Qr[LAST], HEAD)}
      </div>
      <div class="note">The values change because the vector is rotated in pairs. V is not rotated because V is the message/content. Q and K are rotated because Q·K is where attention decides relevance.</div>
    </div>`,
    'This is the best slide for the question, what does applying RoPE even mean? It literally changes the coordinates by rotation.'),

  slide('9 · Image 3, Step 3a', 'Compare queries to keys with dot products', 'scores', `
    <div class="content">
      <div class="formula">S = Q′ · K′ᵀ / √d_head &nbsp; = &nbsp; Q′ · K′ᵀ / ${Math.sqrt(CONFIG.d_head)}</div>
      ${matrix('Raw score matrix S', t.scores, {rowLabels: TOK.map(x => `q:${x}`), colLabels: TOK.map(x => `k:${x}`), highlightRows:[LAST]})}
      <div class="note">Each row asks: for this token, how strongly do I match each key? Bigger score means stronger match.</div>
    </div>`,
    'Now you can say: this is the Q/K comparison. It is the dot product step.'),

  slide('10 · Image 3, Step 3b', 'Causal masking turns future scores into −∞', 'mask', `
    <div class="content">
      <div class="formula">if j &gt; i, set S[i,j] = −∞</div>
      ${matrix('Masked scores', t.maskedScores, {rowLabels: TOK.map(x => `q:${x}`), colLabels: TOK.map(x => `k:${x}`), highlightRows:[LAST]})}
      <div class="note">The first row can only see itself. The second row can see positions 0 and 1. The last row can see all three tokens, so it is the row that contains the whole prompt context.</div>
    </div>`,
    'This connects directly to decoder-only generation. No token gets to peek at the future.'),

  slide('11 · Image 3, Step 4', 'Softmax turns scores into attention weights', 'A matrix', `
    <div class="content">
      <div class="formula">A[i,j] = exp(S[i,j]) / Σ exp(S[i,k])</div>
      ${matrix('Attention weights A', t.A, {rowLabels: TOK.map(x => `q:${x}`), colLabels: TOK.map(x => `k:${x}`), highlightRows:[LAST]})}
      <div class="note">Rows sum to 1. For the last row, bit attends ${t.A[LAST].map((w, j) => `${pct(w)} to ${PROMPT_TOKENS[j]}`).join(', ')}.</div>
    </div>`,
    'This is the actual attention pattern. It tells us how much each position looks at earlier positions.'),

  slide('12 · Image 3, Step 5', 'Multiply attention weights by V to collect information', 'A·V', `
    <div class="content">
      <div class="formula">C = A · V</div>
      <div class="two">
        ${matrix('V values', t.V, {rowLabels:TOK, colLabels:HEAD})}
        ${matrix('C = A·V', t.C, {rowLabels:TOK, colLabels:DIM, highlightRows:[LAST]})}
      </div>
      <div class="formula">C_bit = ${lastAttentionSentence}<br/>C_bit = [${lastContextSentence}]</div>
      <div class="note">A says how much to look. V contains the information being copied/blended. C is the attention output that goes back to image 2.</div>
    </div>`,
    'This answers why weights get multiplied by V. The weights are not content. V is content.'),

  slide('13 · Back to Image 2', 'Residual add #1: attention updates the stream', 'X + C', `
    <div class="content">
      <div class="formula">R1 = X + C</div>
      <div class="three">
        ${matrix('X', t.X, {rowLabels:TOK, colLabels:DIM, highlightRows:[LAST]})}
        ${matrix('C', t.C, {rowLabels:TOK, colLabels:DIM, highlightRows:[LAST]})}
        ${matrix('R1', t.R1, {rowLabels:TOK, colLabels:DIM, highlightRows:[LAST]})}
      </div>
      <div class="note">For bit: [${t.X[LAST].map(x => fmt(x)).join(', ')}] + [${t.C[LAST].map(x => fmt(x)).join(', ')}] = [${t.R1[LAST].map(x => fmt(x)).join(', ')}]. The old bit meaning remains, and context from “the dog” is added.</div>
    </div>`,
    'This is where the residual concept becomes numeric. Keep what you had, add the learned context update.'),

  slide('14 · Feed-forward', 'The FFN transforms each token privately', 'MLP', `
    <div class="content">
      <div class="formula">H = ReLU(R1·W1 + b1), &nbsp; M = H·W2 + b2</div>
      <div class="two">
        ${matrix('H_raw before ReLU', t.Hraw, {rowLabels:TOK, colLabels:HEAD, highlightRows:[LAST]})}
        ${matrix('H after ReLU', t.H, {rowLabels:TOK, colLabels:HEAD, highlightRows:[LAST]})}
      </div>
      ${matrix('M = FFN update', t.M, {rowLabels:TOK, colLabels:DIM, highlightRows:[LAST]})}
      <div class="note">The FFN does not mix tokens. Attention mixed tokens. The FFN now processes each token’s already-contextual vector and writes another update M.</div>
    </div>`,
    'Point out the negative value clipped to zero. That is the nonlinearity. Then point out M for bit: it boosts determiner-ness and damps verb-ness.'),

  slide('15 · Residual add #2', 'R2 is the block output', 'R1 + M', `
    <div class="content">
      <div class="formula">R2 = R1 + M</div>
      <div class="three">
        ${matrix('R1', t.R1, {rowLabels:TOK, colLabels:DIM, highlightRows:[LAST]})}
        ${matrix('M', t.M, {rowLabels:TOK, colLabels:DIM, highlightRows:[LAST]})}
        ${matrix('R2', t.R2, {rowLabels:TOK, colLabels:DIM, highlightRows:[LAST]})}
      </div>
      <div class="note">The final row is h_final = R2[bit] = [${t.hFinal.map(x => fmt(x)).join(', ')}]. This one vector now represents the prefix “the dog bit”.</div>
    </div>`,
    'We are done with the transformer block. In a real model, this would repeat through many blocks. Here we use one block so the math fits on slides.'),

  slide('16 · Image 1 again', 'Unembedding turns h_final into logits', 'logits', `
    <div class="content">
      <div class="formula">logits = h_final · Uᵀ</div>
      <div class="two">
        ${vec('h_final = last row of R2', t.hFinal, DIM)}
        ${kvTable('Logits', logitRows, {headers:['token','logit','pad masked?'], highlightRows:[t.top.id]})}
      </div>
      <div class="note">A logit is not a probability yet. It is just a raw score for each vocabulary token.</div>
    </div>`,
    'This is the unembedding layer from image 1. It maps the final hidden vector back into vocabulary space.'),

  slide('17 · Final prediction', 'Softmax says the next token is “the”', 'done', `
    <div class="content">
      <div class="formula">p = softmax(logits), with &lt;pad&gt; set to −∞ first</div>
      ${bars(probRows)}
      <div class="big">“the dog bit ___” → “the dog bit <span class="color-r">${t.top.token}</span>”</div>
      <div class="note">p(the) = ${fmt(t.probs[1])}. The exact value is ${t.probs[1]}. Display numbers are rounded, but the computation uses full precision.</div>
    </div>`,
    'End with the story: attention made bit context-aware, residuals preserved and added information, FFN sharpened the signal, unembedding scored the vocabulary, softmax picked the next token.'),

  slide('18 · One-sentence recap', 'Attention decides what to read; V carries what gets read', 'recap', `
    <div class="content">
      <div class="big">Q/K create the attention pattern. V supplies the information. Residuals add that information back into the stream.</div>
      ${flow([{text:'Q·K → scores', class:'attn'}, '→', {text:'mask'}, '→', {text:'softmax → A', class:'attn'}, '→', {text:'A·V → C', class:'attn'}, '→', {text:'X + C → R1', class:'resid'}, '→', {text:'R1 + M → R2', class:'ffn'}, '→', {text:'p(next token)', class:'hot'}])}
      <div class="note">If someone understands this slide, they understand the nested relationship between image 1, image 2, and image 3.</div>
    </div>`,
    'This is the slide to leave on screen during discussion.'),
];

let index = 0;
const deck = document.getElementById('deck');
const progressText = document.getElementById('progressText');
const rail = document.getElementById('rail');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const notesBtn = document.getElementById('notesBtn');
const printBtn = document.getElementById('printBtn');

deck.innerHTML = slides.map((s, i) => `
  <section class="slide" data-i="${i}" aria-label="Slide ${i + 1}: ${esc(s.title)}">
    <div class="slide-header">
      <div><div class="slide-kicker">${esc(s.kicker)}</div><h2>${s.title}</h2></div>
      <div class="badge">${esc(s.badge)}</div>
    </div>
    <div class="content">${s.body}</div>
    <div class="speaker"><b>Speaker note:</b> ${s.notes}</div>
  </section>`).join('');
rail.innerHTML = slides.map((_, i) => `<div class="dot" data-i="${i}"></div>`).join('');

function render() {
  document.querySelectorAll('.slide').forEach((el, i) => el.classList.toggle('active', i === index));
  document.querySelectorAll('.dot').forEach((el, i) => el.classList.toggle('active', i === index));
  progressText.textContent = `Slide ${index + 1} / ${slides.length}`;
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === slides.length - 1;
  location.hash = `slide-${index + 1}`;
}
function go(delta) { index = Math.max(0, Math.min(slides.length - 1, index + delta)); render(); }
prevBtn.addEventListener('click', () => go(-1));
nextBtn.addEventListener('click', () => go(1));
notesBtn.addEventListener('click', () => {
  document.body.classList.toggle('hide-notes');
  const on = !document.body.classList.contains('hide-notes');
  notesBtn.textContent = on ? 'Notes on' : 'Notes off';
  notesBtn.setAttribute('aria-pressed', String(on));
});
printBtn.addEventListener('click', () => window.print());
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') go(1);
  if (e.key === 'ArrowLeft') go(-1);
  if (e.key.toLowerCase() === 'n') notesBtn.click();
});
rail.addEventListener('click', (e) => {
  const dot = e.target.closest('.dot');
  if (!dot) return;
  index = Number(dot.dataset.i);
  render();
});
const m = location.hash.match(/slide-(\d+)/);
if (m) index = Math.max(0, Math.min(slides.length - 1, Number(m[1]) - 1));
render();
