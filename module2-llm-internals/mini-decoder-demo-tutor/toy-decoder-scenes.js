// toy-decoder-scenes.js
// -----------------------------------------------------------------------------
// Declarative scene list. Each scene returns an array of "panels" that app.js
// renders generically. Scenes walk the concrete numbers through:
//   image1 (full decoder) -> image2 (block) -> image3 (attention head) -> back.
// -----------------------------------------------------------------------------

import { CONFIG, VOCAB, PROMPT_IDS, E, W_Q, W_K, W_V, W1, B1, W2, U } from './toy-decoder-data.js';

const DIM = ['dim0·det', 'dim1·noun', 'dim2·verb', 'dim3·bias']; // residual-stream columns
const HEAD = ['h0', 'h1', 'h2', 'h3'];                            // head-space columns
const posLabels = () => PROMPT_IDS.map((id, i) => `${VOCAB[id]} · pos ${i}`);
const kLabels = () => PROMPT_IDS.map((id) => `k:${VOCAB[id]}`);
const qLabels = () => PROMPT_IDS.map((id) => `q:${VOCAB[id]}`);

// ---- tiny panel constructors ------------------------------------------------
const prose = (html) => ({ kind: 'prose', html });
const note = (html) => ({ kind: 'note', html });
const formula = (html) => ({ kind: 'formula', html });
const callout = (tone, html) => ({ kind: 'callout', tone, html });
const row = (...children) => ({ kind: 'row', children: children.flat() });
const diagram = (level, active) => ({ kind: 'diagram', level, active });
const mat = (label, data, opts = {}) => ({ kind: 'matrix', label, data, ...opts });
const vec = (label, data, opts = {}) => ({ kind: 'vector', label, data, ...opts });

const LAST = CONFIG.m - 1; // last position index (2)


const study = ({ objective, mental, inspect, confusion, next }) => callout('info',
  `<b>What to learn:</b> ${objective}<br>
   <b>Mental model:</b> ${mental}<br>
   <b>Numbers to inspect:</b> ${inspect}<br>
   <b>Common confusion:</b> ${confusion}<br>
   <b>Connects next:</b> ${next}`
);

export const SCENES = [
  // ---------------------------------------------------------------- 1. prompt
  {
    id: 'prompt', level: 'full', stage: 'tokens',
    title: 'The prompt → tokens → ids',
    subtitle: 'We want the next token after "the dog bit ___".',
    panels: (t) => [
      diagram('full', 'tokens'),
      prose(`We feed the model three tokens and ask it to predict the <b>4th</b>.
        Each token maps to an integer <b>id</b> inside the vocabulary.`),
      row(
        mat('vocabulary (n_vocab = 8)',
          VOCAB.map((tok, i) => [i, tok]),
          { colLabels: ['id', 'token'], color: 'plain', intCols: [0],
            highlightRows: PROMPT_IDS }),
        mat('input sequence  (m = 3)',
          PROMPT_IDS.map((id, i) => [i, VOCAB[id], id]),
          { colLabels: ['pos', 'token', 'id'], color: 'embed', intCols: [0, 2] }),
      ),
      note(`<b>Tokenizer caveat (kept brief):</b> real tokenizers split on sub-words,
        so "mailman" might be several tokens. Here we pretend 1 word = 1 token.`),
      callout('info', `<b>Where we are headed:</b> ids → embeddings → one transformer
        block → unembed the <b>last</b> position → a probability for every vocab token.
        Only the last position (here <b>pos ${LAST}</b>) makes the prediction.`),
    ],
  },

  // ------------------------------------------------------------- 2. embeddings
  {
    id: 'embed', level: 'full', stage: 'embed',
    title: 'Embedding layer → the residual stream X',
    subtitle: 'Look up one vector per token id. X is the start of the residual stream.',
    panels: (t) => [
      diagram('full', 'embed'),
      formula(`X = E[ids] &nbsp;&nbsp;→&nbsp;&nbsp; shape ${t.shapes.X.join('×')} &nbsp;(m × d_model)`),
      prose(`Each row of the embedding matrix <b>E</b> is a token's learned vector.
        We copy out the rows for ids ${JSON.stringify(t.ids)}. In this toy the 4
        dimensions loosely mean: <b>det</b>erminer, <b>noun</b>, <b>verb</b>, <b>bias</b>.`),
      row(
        mat('E  (n_vocab × d_model)', E, {
          rowLabels: VOCAB, colLabels: DIM, color: 'embed',
          highlightRows: t.ids,
        }),
        mat('X  (m × d_model)', t.X, {
          rowLabels: posLabels(), colLabels: DIM, color: 'embed',
        }),
      ),
      callout('resid', `Think of <b>X</b> as the <b>main river of information</b> — the
        <b>residual stream</b>. Everything the block does is <b>write updates into this
        river</b>. Its shape (${t.shapes.X.join('×')}) never changes.`),
    ],
  },

  // --------------------------------------------------------- 3. block overview
  {
    id: 'block', level: 'block', stage: 'in',
    title: 'Inside one transformer block',
    subtitle: 'Two sublayers, each added back into the residual stream (image 2).',
    panels: (t) => [
      diagram('block', 'in'),
      prose(`A block has two sublayers: <b>masked self-attention</b> and a
        <b>feed-forward network (FFN)</b>. Each reads the stream, computes an update,
        and <b>adds</b> it back — same shape in, same shape out.`),
      row(
        formula(`R1 = X + <span class="c-attn">C</span> &nbsp;&nbsp;(after attention)`),
        formula(`R2 = R1 + <span class="c-ffn">M</span> &nbsp;&nbsp;(after FFN)`),
      ),
      callout('resid', `The dashed line down the side of image 2 labelled
        <b>"residual"</b> is exactly these <b>+</b> signs. Attention and the FFN never
        replace the stream; they only <b>add</b> to it.`),
      note(`<b>Omitted for clarity:</b> real blocks put a <b>LayerNorm / RMSNorm</b>
        before each sublayer (the grey boxes in image 2). We skip normalization so the
        arithmetic stays simple — the residual-add structure is the point here.`),
    ],
  },

  // ------------------------------------------------------------ 4. Q, K, V
  {
    id: 'qkv', level: 'attn', stage: 'qkv',
    title: 'Attention head · Step 1 — make Q, K, V',
    subtitle: 'Three distinct learned projections of X (image 3, Step 1).',
    panels: (t) => [
      diagram('attn', 'qkv'),
      prose(`We multiply X by <b>three different</b> matrices. <span class="c-q">Q</span>
        is the "question" each token asks; <span class="c-k">K</span> is the "key" each
        token offers to be matched on; <span class="c-v">V</span> is the "message" it
        will pass along if attended to.`),
      formula(`<span class="c-q">Q</span>=X·W<sub>Q</sub> &nbsp; <span class="c-k">K</span>=X·W<sub>K</sub> &nbsp; <span class="c-v">V</span>=X·W<sub>V</sub> &nbsp;&nbsp; each ${t.shapes.Q.join('×')}`),
      row(
        mat('W_Q', W_Q, { rowLabels: DIM, colLabels: HEAD, color: 'q', small: true }),
        mat('W_K', W_K, { rowLabels: DIM, colLabels: HEAD, color: 'k', small: true }),
        mat('W_V', W_V, { rowLabels: DIM, colLabels: HEAD, color: 'v', small: true }),
      ),
      row(
        mat('Q', t.Q, { rowLabels: posLabels(), colLabels: HEAD, color: 'q' }),
        mat('K', t.K, { rowLabels: posLabels(), colLabels: HEAD, color: 'k' }),
        mat('V', t.V, { rowLabels: posLabels(), colLabels: HEAD, color: 'v' }),
      ),
      note(`Real heads also project the head output back with a matrix <b>W_O</b> and
        concatenate <b>many</b> heads. With a single head we fold that away.`),
    ],
  },

  // ------------------------------------------------------------- 5. RoPE
  {
    id: 'rope', level: 'attn', stage: 'rope',
    title: 'Step 2 — RoPE rotates Q and K (only)',
    subtitle: 'Position is injected by rotating coordinate pairs (image 3, Step 2).',
    panels: (t) => [
      diagram('attn', 'rope'),
      prose(`RoPE (rotary position embedding) makes attention <b>position-aware</b>.
        For each token at position <i>pos</i>, it <b>rotates</b> coordinate pairs of Q
        and K. It is a <b>rotation</b>, not a dot product. <span class="c-v">V is left
        unchanged.</span>`),
      formula(`pairs = ${JSON.stringify(CONFIG.ropePairs)} &nbsp; θ<sub>pair</sub> = pos · freq &nbsp; freq = ${JSON.stringify(CONFIG.ropeFreq)}`),
      formula(`a' = a·cos θ − b·sin θ &nbsp;&nbsp; b' = a·sin θ + b·cos θ`),
      row(
        mat("Q' (rotated)", t.Qr, { rowLabels: posLabels(), colLabels: HEAD, color: 'q' }),
        mat("K' (rotated)", t.Kr, { rowLabels: posLabels(), colLabels: HEAD, color: 'k' }),
      ),
      callout('info', `pos 0 rotates by angle 0 (unchanged); later positions rotate more.
        Pair (0,1) turns faster (freq ${CONFIG.ropeFreq[0]}) than pair (2,3)
        (freq ${CONFIG.ropeFreq[1]}). That relative turning is how the dot product in the
        next step "feels" how far apart two tokens are.`),
      note(`Real RoPE uses many pairs with geometric frequencies base<sup>−2i/d</sup>
        (base ≈ 10000). We use two toy frequencies so the rotation is visible.`),
    ],
  },

  // ------------------------------------------------------------ 6. QK^T scores
  {
    id: 'scores', level: 'attn', stage: 'scores',
    title: "Step 3a — scores = Q'·K'ᵀ / √d_head",
    subtitle: 'How well does each query match each key? (image 3, Step 3.)',
    panels: (t) => [
      diagram('attn', 'scores'),
      prose(`Each cell S[i][j] is the <b>dot product</b> of query <i>i</i> with key
        <i>j</i> — a similarity score — divided by √d_head to keep it from blowing up.`),
      formula(`S = <span class="c-q">Q'</span> · <span class="c-k">K'</span>ᵀ / √d_head &nbsp;&nbsp; √${CONFIG.d_head} = ${Math.sqrt(CONFIG.d_head)} &nbsp;&nbsp; shape ${t.shapes.scores.join('×')}`),
      mat('S  (raw scores, before masking)', t.scores, {
        rowLabels: qLabels(), colLabels: kLabels(), color: 'score',
      }),
      callout('info', `Row <i>i</i> = "how much position <i>i</i> wants to look at each
        other position". Right now every query can see every key — including
        <b>future</b> ones. The next step forbids that.`),
    ],
  },

  // ------------------------------------------------------------- 7. causal mask
  {
    id: 'mask', level: 'attn', stage: 'mask',
    title: 'Step 3b — causal mask (no peeking ahead)',
    subtitle: 'Set every future cell j > i to −∞ (image 3, Step 3).',
    panels: (t) => [
      diagram('attn', 'mask'),
      prose(`A decoder predicts left-to-right, so position <i>i</i> may only attend to
        positions <b>≤ i</b>. We set the upper triangle (<b>j &gt; i</b>) to
        <b>−∞</b>. After softmax, e<sup>−∞</sup> = 0, so those cells contribute nothing.`),
      mat('S masked', t.maskedScores, {
        rowLabels: qLabels(), colLabels: kLabels(), color: 'score', maskInf: true,
      }),
      callout('attn', `Look at the last row (<b>${VOCAB[t.ids[LAST]]}</b>): it keeps all
        three cells because every earlier token is in its past. The first row keeps only
        one — <b>the</b> can only look at itself.`),
    ],
  },

  // --------------------------------------------------------- 8. softmax -> A
  {
    id: 'softmax', level: 'attn', stage: 'softmax',
    title: 'Step 4 — softmax each row → attention weights A',
    subtitle: 'Turn scores into weights that sum to 1 (image 3, Step 4).',
    panels: (t) => [
      diagram('attn', 'softmax'),
      prose(`Softmax over each row converts scores into <b>attention weights</b>: all
        positive, and each row <b>sums to 1</b>. Masked (−∞) cells become exactly 0.`),
      formula(`A[i][j] = e<sup>S[i][j]</sup> / Σ<sub>k</sub> e<sup>S[i][k]</sup>`),
      mat('A  (each row sums to 1)', t.A, {
        rowLabels: qLabels(), colLabels: kLabels(), color: 'attn',
        rowSum: t.rowSums, zeroFade: true,
      }),
      callout('attn', `The last row is the important one for our prediction:
        <b>${VOCAB[t.ids[LAST]]}</b> splits its attention roughly
        ${t.A[LAST].map((w, j) => `${(w * 100).toFixed(0)}% → ${VOCAB[t.ids[j]]}`).join(', ')}.
        So the last position is about to pull in context from <b>the</b> and <b>dog</b>,
        not just from itself.`),
    ],
  },

  // ------------------------------------------------------------- 9. A·V -> C
  {
    id: 'context', level: 'attn', stage: 'av',
    title: 'Step 5 — context C = A · V',
    subtitle: 'Each position becomes a weighted blend of the value vectors (image 3, Step 5).',
    panels: (t) => [
      diagram('attn', 'av'),
      prose(`Multiply the attention weights by the value vectors. Row <i>i</i> of
        <b>C</b> is a weighted average of the V rows — the <b>context</b> that position
        <i>i</i> gathered. <b>This matrix C is the attention head's output.</b>`),
      formula(`<span class="c-attn">C</span> = A · <span class="c-v">V</span> &nbsp;&nbsp; shape ${t.shapes.C.join('×')}`),
      row(
        mat('A', t.A, { rowLabels: qLabels(), colLabels: kLabels(), color: 'attn', small: true }),
        mat('V', t.V, { rowLabels: posLabels(), colLabels: HEAD, color: 'v', small: true }),
        mat('C = A·V', t.C, { rowLabels: posLabels(), colLabels: DIM, color: 'attn', highlightRows: [LAST] }),
      ),
      callout('attn', `Last row <b>C[${LAST}]</b> = [${t.C[LAST].map((x) => x.toFixed(2)).join(', ')}].
        Before attention, position ${LAST} only knew "verb" (it was just the token
        <b>bit</b>). Now it also carries <b>det</b> and <b>noun</b> signal — it has
        <i>looked back</i> at "the dog". <b>This is attention flowing toward the
        prediction.</b>`),
    ],
  },

  // -------------------------------------------------------- 10. residual add 1
  {
    id: 'resid1', level: 'block', stage: 'add1',
    title: 'Residual add #1 —  R1 = X + C',
    subtitle: 'The attention output is added back into the river (image 2, first Add).',
    panels: (t) => [
      diagram('block', 'add1'),
      prose(`We do <b>not</b> throw X away. We <b>add</b> the attention update C onto it.
        Same shape, element-wise. This is the first "Add" node in image 2.`),
      formula(`R1 = X + <span class="c-attn">C</span> &nbsp;&nbsp; ${t.shapes.X.join('×')} + ${t.shapes.C.join('×')} = ${t.shapes.R1.join('×')}`),
      row(
        mat('X', t.X, { rowLabels: posLabels(), colLabels: DIM, color: 'embed', small: true }),
        mat('C', t.C, { rowLabels: posLabels(), colLabels: DIM, color: 'attn', small: true }),
        mat('R1 = X + C', t.R1, { rowLabels: posLabels(), colLabels: DIM, color: 'resid', highlightRows: [LAST] }),
      ),
      callout('resid', `Row ${LAST}: X[${LAST}]=[${t.X[LAST].map((x) => x.toFixed(2)).join(', ')}]
        <b>+</b> C[${LAST}]=[${t.C[LAST].map((x) => x.toFixed(2)).join(', ')}]
        <b>=</b> R1[${LAST}]=[${t.R1[LAST].map((x) => x.toFixed(2)).join(', ')}]. The verb
        signal from "bit" is preserved <i>and</i> the new context is layered on top.`),
    ],
  },

  // --------------------------------------------------------------- 11. FFN
  {
    id: 'ffn', level: 'block', stage: 'ffn',
    title: 'Feed-forward network → update M',
    subtitle: 'A per-position 2-layer MLP with a ReLU in the middle (image 2, purple box).',
    panels: (t) => [
      diagram('block', 'ffn'),
      prose(`The FFN processes <b>each position independently</b>:
        <b>M = ReLU(R1·W1 + b1)·W2 + b2</b>. With W1 = identity, hidden neuron <i>j</i>
        just reads residual dimension <i>j</i>; the ReLU then <b>clips negatives to 0</b>.`),
      formula(`H<sub>raw</sub> = R1·W1 + b1 &nbsp;→&nbsp; H = ReLU(H<sub>raw</sub>) &nbsp;→&nbsp; M = H·W2 + b2`),
      row(
        mat('H_raw (pre-ReLU)', t.Hraw, { rowLabels: posLabels(), colLabels: HEAD, color: 'ffn', markNeg: true }),
        mat('H = ReLU(H_raw)', t.H, { rowLabels: posLabels(), colLabels: HEAD, color: 'ffn', zeroFade: true }),
      ),
      callout('ffn', `See the ReLU bite: at the last position H_raw[${LAST}] has a
        <b>negative</b> entry (${t.Hraw[LAST][1].toFixed(3)} in the "animal-subject"
        neuron, because "bit" is not an animal) → ReLU sets it to <b>0</b>. That is the
        FFN's non-linearity doing real work.`),
      row(
        mat('W2', W2, { rowLabels: HEAD, colLabels: DIM, color: 'ffn', small: true }),
        mat('M = FFN update', t.M, { rowLabels: posLabels(), colLabels: DIM, color: 'ffn', highlightRows: [LAST] }),
      ),
      callout('ffn', `Read M[${LAST}] = [${t.M[LAST].map((x) => x.toFixed(2)).join(', ')}]:
        it <b>+${t.M[LAST][0].toFixed(2)} into dim0 (det)</b> and
        <b>${t.M[LAST][2].toFixed(2)} into dim2 (verb)</b>. The FFN is amplifying the
        "a determiner comes next" signal and damping the raw verb signal.`),
      note(`<b>Simplified:</b> d_ff = ${CONFIG.d_ff} (no width expansion). Real FFNs
        expand ~4× (e.g. d_ff = 4·d_model) with many more neurons. The ReLU + two
        linear layers structure is the same.`),
    ],
  },

  // -------------------------------------------------------- 12. residual add 2
  {
    id: 'resid2', level: 'block', stage: 'add2',
    title: 'Residual add #2 —  R2 = R1 + M',
    subtitle: 'The FFN update is added back; R2 is the block output (image 2, second Add).',
    panels: (t) => [
      diagram('block', 'add2'),
      formula(`R2 = R1 + <span class="c-ffn">M</span> &nbsp;&nbsp; → shape ${t.shapes.R2.join('×')} (unchanged)`),
      row(
        mat('R1', t.R1, { rowLabels: posLabels(), colLabels: DIM, color: 'resid', small: true }),
        mat('M', t.M, { rowLabels: posLabels(), colLabels: DIM, color: 'ffn', small: true }),
        mat('R2 = R1 + M', t.R2, { rowLabels: posLabels(), colLabels: DIM, color: 'resid', highlightRows: [LAST] }),
      ),
      callout('resid', `That is the whole block:
        <b>X → (+C) → R1 → (+M) → R2</b>. Two writes into the same river. In a real
        model you would now stack many such blocks; we use one. <b>R2 is the block's
        output.</b>`),
    ],
  },

  // ---------------------------------------------------------- 13. take last pos
  {
    id: 'lastpos', level: 'full', stage: 'block',
    title: 'Only the LAST position predicts the next token',
    subtitle: 'This is the "p4" idea from image 1 — generalized.',
    panels: (t) => [
      diagram('full', 'p-last'),
      prose(`Image 1 shows outputs p₁…p₄ and highlights <b>p₄</b> — the <b>last</b>
        position — as "predicts next token". That is a general rule, not the number 4.`),
      callout('info', `<b>The rule:</b> the output at position <i>i</i> is the model's
        guess for the token that comes <i>after</i> position <i>i</i>. To continue the
        text we only need the <b>last</b> position. Image 1 had m = 4 → use p₄. We have
        m = ${CONFIG.m} → use <b>p${CONFIG.m}</b>, i.e. row ${LAST} of R2.`),
      vec(`h_final = R2[${LAST}]  (the last row of the block output)`, t.hFinal, {
        labels: DIM, color: 'resid',
      }),
      prose(`Everything else (rows for "the" and "dog") would matter during training, but
        for <b>generating the next word</b> we unembed only this one vector.`),
    ],
  },

  // ------------------------------------------------------------- 14. unembed
  {
    id: 'unembed', level: 'full', stage: 'unembed',
    title: 'Unembedding → logits',
    subtitle: 'Score h_final against every vocab token (image 1, Unembedding layer).',
    panels: (t) => [
      diagram('full', 'unembed'),
      prose(`The unembedding matrix <b>U</b> has one row per vocab token. Each
        <b>logit</b> is the dot product of h_final with that token's row — "how much does
        the final vector point toward this token?"`),
      formula(`logits = h_final · Uᵀ &nbsp;&nbsp; (1×${CONFIG.d_model}) · (${CONFIG.d_model}×${CONFIG.n_vocab}) = 1×${CONFIG.n_vocab}`),
      row(
        vec('h_final', t.hFinal, { labels: DIM, color: 'resid' }),
        mat('U  (n_vocab × d_model)', U, { rowLabels: VOCAB, colLabels: DIM, color: 'out', small: true }),
      ),
      mat('logits (one per vocab token)', t.logits.map((l, v) => [VOCAB[v], l]), {
        colLabels: ['token', 'logit'], color: 'out', textCol: [0], numCol: [1],
        highlightRows: [t.top.id], padRow: CONFIG.padTokenId,
      }),
      note(`Real GPT-2 <b>ties</b> weights: it reuses the embedding matrix E as U. We use
        a separate U so the last layer is easy to read.`),
    ],
  },

  // ---------------------------------------------------------- 15. mask + softmax
  {
    id: 'predict', level: 'full', stage: 'logits',
    title: 'Mask <pad>, softmax → the prediction',
    subtitle: 'A probability for each real token (image 1, output logits → p).',
    panels: (t) => [
      diagram('full', 'logits'),
      prose(`<b>&lt;pad&gt;</b> is a real vocab entry but must never be predicted, so we
        set its logit to <b>−∞ before softmax</b> (not after). Softmax over the remaining
        ${CONFIG.n_vocab - 1} tokens gives a proper probability distribution that sums to 1.`),
      formula(`p = softmax(logits with logit[&lt;pad&gt;] = −∞)`),
      { kind: 'bars', label: 'P(next token)  — bars are exact; labels rounded for display',
        items: t.ranking.map((r) => ({ name: r.token, value: r.prob, masked: r.masked })),
        top: t.top.token },
      callout('info', `<b>Prediction: "${t.top.token}"</b> with p ≈
        <b>${(t.top.prob).toFixed(3)}</b>. Continuation: <b>"the dog bit
        ${t.top.token}"</b>. The runners-up are the verbs "ran"/"bit" — plausible, but the
        determiner context we built through attention + FFN pushed <b>"the"</b> to the top.`),
      note(`Bars use the exact probabilities; printed numbers are rounded to
        ${CONFIG.displayDecimals} decimals. &lt;pad&gt; is shown greyed with p = 0 because
        it was masked <i>before</i> the softmax, not hidden afterward.`),
    ],
  },

  // --------------------------------------------------------------- 16. recap
  {
    id: 'recap', level: 'full', stage: 'all',
    title: 'Recap — the number that became "the"',
    subtitle: 'One river, two writes, one readout.',
    panels: (t) => [
      diagram('full', 'all'),
      callout('resid', `<b>The residual stream is the whole story:</b>`),
      formula(`X <span class="c-attn">──+C──▶</span> R1 <span class="c-ffn">──+M──▶</span> R2 &nbsp;⇒&nbsp; take row ${LAST} &nbsp;⇒&nbsp; logits &nbsp;⇒&nbsp; softmax &nbsp;⇒&nbsp; <b>"${t.top.token}"</b>`),
      prose(`<b>What each stage contributed to the last position:</b>`),
      { kind: 'bars', label: 'final P(next token)',
        items: t.ranking.map((r) => ({ name: r.token, value: r.prob, masked: r.masked })),
        top: t.top.token },
      row(
        callout('attn', `<b>Attention</b> let "bit" look back at "the dog" and wrote
          determiner + noun context into its residual (C).`),
        callout('ffn', `<b>FFN</b> amplified that determiner signal and damped the verb
          signal (M).`),
        callout('resid', `<b>Residual adds</b> kept everything in one same-shape stream,
          which the unembedding then read out.`),
      ),
      note(`<b>Toy simplifications recap:</b> 1 layer, 1 head, d_model = ${CONFIG.d_model},
        vocab = ${CONFIG.n_vocab}; no LayerNorm/RMSNorm; no multi-head concat / W_O output
        projection; no KV-cache, no dropout; hand-picked weights, not trained. The
        <i>shapes and the flow</i> are faithful to a real decoder-only transformer.`),
    ],
  },
];


const LEARNING_BY_ID = {
  prompt: {
    objective: 'Understand that the model receives token ids, not raw English words.',
    mental: 'Tokenization is like a vocabulary lookup: each text piece becomes an integer id.',
    inspect: 'vocab ids 1=the, 2=dog, 3=bit; input ids [1,2,3]; last position index = 2.',
    confusion: 'The p4 idea from the reference image means “prediction after the last input position”; in this toy m=3, so the equivalent is p3.',
    next: 'Those ids must become vectors before attention can do any math.',
  },
  embed: {
    objective: 'See how discrete token ids become continuous vectors in X.',
    mental: 'Each token starts as a row in the residual stream, carrying initial feature signals.',
    inspect: 'X is 3×4: the=[1,0,0,0.3], dog=[0,1,0,0.2], bit=[0,0,1,0.2].',
    confusion: 'The toy dimension labels are teaching labels; real embedding dimensions are learned features, not literal English categories.',
    next: 'The transformer block will write updates into this same stream.',
  },
  block: {
    objective: 'Understand the transformer block as two additive updates.',
    mental: 'The residual stream is a river; attention and FFN pour updates into it.',
    inspect: 'R1 = X + C and R2 = R1 + M; every matrix stays shape 3×4.',
    confusion: 'Attention and FFN do not replace the stream; residual add is element-wise addition, not concatenation.',
    next: 'Zoom into the attention update C and see how it is made.',
  },
  qkv: {
    objective: 'Learn the three ingredients of attention: Q, K, and V.',
    mental: 'Q asks what to look for, K offers what can be matched, and V carries the content to copy/blend.',
    inspect: 'For bit: Q[2]=[1,0,0,0.2], K[2]=[0,0,1,0.2], V[2]=[0,0,1,0.2].',
    confusion: 'Q/K/V are not the attention weights yet; they are projections used to compute attention.',
    next: 'Before comparing Q and K, add position information with RoPE.',
  },
  rope: {
    objective: 'Understand how position enters attention through RoPE.',
    mental: 'RoPE rotates Q and K coordinates based on token position before matching.',
    inspect: 'Position 0 is unchanged; bit gets Q′≈[0.362,0.932,-0.078,0.184].',
    confusion: 'RoPE is not a dot product and it does not rotate V.',
    next: 'Now compare rotated Q with rotated K using dot products.',
  },
  scores: {
    objective: 'Read the raw score matrix as query-key similarity.',
    mental: 'Each row asks, “from this position, which keys look relevant?”',
    inspect: 'Last score row before masking is approximately [0.209, 0.302, 0.020].',
    confusion: 'Scores are not probabilities; they can be any real numbers.',
    next: 'Causal masking will remove future positions before softmax.',
  },
  mask: {
    objective: 'See how decoder-only models prevent future-token access.',
    mental: 'Future cells are crossed out by setting them to −∞ before softmax.',
    inspect: 'Upper-triangle cells are −∞; first row keeps only itself; last row keeps all three tokens.',
    confusion: 'Masking is per query row; it is not deleting tokens globally.',
    next: 'Softmax converts the remaining allowed scores into weights.',
  },
  softmax: {
    objective: 'Convert masked scores into attention weights.',
    mental: 'Each row gets a budget of 1.0 and decides how to spend it across allowed tokens.',
    inspect: 'Last row A[2]≈[0.342,0.375,0.283]; every row sum is 1.',
    confusion: 'Attention weights say how much to look; they are not the information itself.',
    next: 'Use these weights to blend the V value messages.',
  },
  context: {
    objective: 'Understand A·V as the actual attention output C.',
    mental: 'A chooses how much to read; V supplies what gets read.',
    inspect: 'C[2]≈[0.342,0.375,0.283,0.234], so bit has picked up determiner and noun context.',
    confusion: 'C is not the final prediction; it is an update that will be added back to the stream.',
    next: 'Return to the transformer block and add C to X.',
  },
  resid1: {
    objective: 'See the first residual add numerically.',
    mental: 'Keep the original token vector and layer the attention context on top.',
    inspect: 'For bit: [0,0,1,0.2] + [0.342,0.375,0.283,0.234] = [0.342,0.375,1.283,0.434].',
    confusion: 'Residual add is same-shape element-wise addition, not a skip that ignores attention.',
    next: 'The FFN now edits each contextualized row independently.',
  },
  ffn: {
    objective: 'Learn what the feed-forward network contributes after attention.',
    mental: 'The FFN is a per-position feature detector/editor; attention mixed tokens, FFN reshapes each row.',
    inspect: 'For bit, H_raw[2][1] = -0.125 becomes 0 after ReLU; M[2]=[1.025,0,-0.342,0].',
    confusion: 'The FFN does not look at other tokens; that mixing already happened in attention.',
    next: 'Add the FFN update back to finish the block output.',
  },
  resid2: {
    objective: 'Finish the block and identify R2 as the block output.',
    mental: 'This is the second write into the same residual stream.',
    inspect: 'Last row R2[2]=[1.367,0.375,0.941,0.434].',
    confusion: 'R2 is still hidden vectors per position; it is not vocabulary probabilities yet.',
    next: 'Take only the last row for next-token generation.',
  },
  lastpos: {
    objective: 'Understand why generation reads only the final position.',
    mental: 'Row i predicts token i+1; the last row has seen the whole prompt.',
    inspect: 'h_final = R2[2] = [1.367,0.375,0.941,0.434].',
    confusion: 'Earlier rows are useful during training, but to continue the current prompt we use the final row.',
    next: 'Unembed h_final into raw scores for every vocabulary token.',
  },
  unembed: {
    objective: 'Turn the final hidden vector into vocabulary logits.',
    mental: 'Each vocab row in U is a detector; h_final dot U[token] gives that token’s score.',
    inspect: 'Top logits include the≈2.553, ran≈1.785, bit≈1.766; <pad> exists before masking.',
    confusion: 'Logits are raw scores, not percentages or probabilities.',
    next: 'Mask invalid tokens and softmax the logits.',
  },
  predict: {
    objective: 'Convert logits into a next-token probability distribution.',
    mental: 'Remove impossible tokens, then normalize scores into probabilities.',
    inspect: '<pad> has probability 0 because it was masked before softmax; top token is “the” with p≈0.354.',
    confusion: 'Do not hide <pad> after softmax; mask it before softmax so probabilities sum correctly.',
    next: 'Recap the complete causal chain from ids to next token.',
  },
  recap: {
    objective: 'Connect image 1, image 2, and image 3 into one story.',
    mental: 'One residual stream, two writes, one final readout.',
    inspect: 'X → R1 → R2 → h_final → logits → p(next); top token is “the”.',
    confusion: 'Do not memorize matrix names without their role: Q/K choose where to look, V carries content, residuals accumulate updates.',
    next: 'Use the same mental model when looking at larger real decoder-only transformers.',
  },
};

for (const scene of SCENES) {
  const originalPanels = scene.panels;
  scene.panels = (trace) => {
    const panels = originalPanels(trace);
    const learning = LEARNING_BY_ID[scene.id];
    if (!learning) return panels;
    return [panels[0], study(learning), ...panels.slice(1)];
  };
}

// breadcrumb levels in order
export const LEVELS = [
  { key: 'full', label: 'Full decoder', hint: 'image 1' },
  { key: 'block', label: 'Transformer block', hint: 'image 2' },
  { key: 'attn', label: 'Attention head', hint: 'image 3' },
];
