// toy-decoder-math.js
// -----------------------------------------------------------------------------
// Pure math for the toy decoder. Every function is deterministic and does the
// operations in a fixed order so the JS result matches verify_trace.py exactly.
// buildTrace() returns every intermediate tensor (with shapes) for the scenes.
// -----------------------------------------------------------------------------

import {
  CONFIG, E, PROMPT_IDS, W_Q, W_K, W_V, W1, B1, W2, B2, U, VOCAB,
} from './toy-decoder-data.js';

const NEG_INF = -Infinity;

// ---- small linear-algebra helpers ------------------------------------------
export function matmul(A, B) {
  const n = A.length, k = A[0].length, m = B[0].length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(m).fill(0);
    for (let t = 0; t < k; t++) {
      const a = A[i][t];
      for (let j = 0; j < m; j++) row[j] += a * B[t][j];
    }
    out.push(row);
  }
  return out;
}

export function transpose(A) {
  const n = A.length, m = A[0].length;
  const out = [];
  for (let j = 0; j < m; j++) {
    const row = [];
    for (let i = 0; i < n; i++) row.push(A[i][j]);
    out.push(row);
  }
  return out;
}

export function addMat(A, B) {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

export function relu(x) { return x > 0 ? x : 0; }

// Softmax over a row. Cells equal to -Infinity (masked) map to exactly 0.
export function softmaxRow(row) {
  let max = -Infinity;
  for (const x of row) if (x !== NEG_INF && x > max) max = x;
  const exps = row.map((x) => (x === NEG_INF ? 0 : Math.exp(x - max)));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// Rotary position embedding on a single vector `row` at integer position `pos`.
// Pairwise rotation of coordinate pairs — NOT a dot product.
export function applyRoPE(row, pos, pairs, freq) {
  const r = row.slice();
  for (let p = 0; p < pairs.length; p++) {
    const [a, b] = pairs[p];
    const ang = pos * freq[p];
    const c = Math.cos(ang), s = Math.sin(ang);
    const xa = r[a], xb = r[b];
    r[a] = xa * c - xb * s;
    r[b] = xa * s + xb * c;
  }
  return r;
}

export function round(x, d) {
  if (x === NEG_INF) return NEG_INF;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

const shape = (M) => (Array.isArray(M[0]) ? [M.length, M[0].length] : [M.length]);

// ---- full forward pass ------------------------------------------------------
export function buildTrace() {
  const { d_head, ropePairs, ropeFreq, padTokenId } = CONFIG;

  // 0. token ids -> embeddings (the start of the residual stream)
  const ids = PROMPT_IDS;
  const X = ids.map((id) => E[id].slice());

  // 1. Q, K, V = X . W_Q / W_K / W_V   (three distinct projections)
  const Q = matmul(X, W_Q);
  const K = matmul(X, W_K);
  const V = matmul(X, W_V);

  // 2. RoPE on Q and K only (V is left unchanged)
  const Qr = Q.map((row, i) => applyRoPE(row, i, ropePairs, ropeFreq));
  const Kr = K.map((row, i) => applyRoPE(row, i, ropePairs, ropeFreq));

  // 3. scores = Qr . Kr^T / sqrt(d_head), then causal mask (j > i -> -Infinity)
  const scale = Math.sqrt(d_head);
  const rawScores = matmul(Qr, transpose(Kr));
  const scores = rawScores.map((r) => r.map((v) => v / scale));
  const maskedScores = scores.map((r, i) =>
    r.map((v, j) => (j > i ? NEG_INF : v)));

  // 4. softmax per row -> attention weights A (rows sum to 1, masked cells 0)
  const A = maskedScores.map((r) => softmaxRow(r));
  const rowSums = A.map((r) => r.reduce((a, b) => a + b, 0));

  // 5. context C = A . V  (this IS the attention head's output)
  const C = matmul(A, V);

  // ---- residual add #1:  R1 = X + C ----
  const R1 = addMat(X, C);

  // ---- feed-forward:  M = ReLU(R1 . W1 + b1) . W2 + b2 ----
  const preW1 = matmul(R1, W1);
  const Hraw = preW1.map((r) => r.map((v, j) => v + B1[j])); // pre-activation
  const H = Hraw.map((r) => r.map(relu));                    // ReLU clips negatives
  const preW2 = matmul(H, W2);
  const M = preW2.map((r) => r.map((v, j) => v + B2[j]));

  // ---- residual add #2:  R2 = R1 + M  (the block's output) ----
  const R2 = addMat(R1, M);

  // ---- final-position prediction (ONLY the last position is unembedded) ----
  const lastPos = ids.length - 1;
  const hFinal = R2[lastPos].slice();
  const logits = U.map((u) => u.reduce((acc, w, j) => acc + w * hFinal[j], 0));

  // mask <pad> so it can never be predicted, THEN softmax over the real tokens
  const maskedLogits = logits.map((l, v) => (v === padTokenId ? NEG_INF : l));
  const probs = softmaxRow(maskedLogits);

  const ranking = probs
    .map((p, v) => ({ id: v, token: VOCAB[v], prob: p, logit: logits[v], masked: v === padTokenId }))
    .sort((a, b) => b.prob - a.prob);
  const top = ranking[0];

  return {
    meta: {
      prompt: 'the dog bit ___',
      note: 'Toy 1-layer / 1-head decoder. Pedagogical weights, not real GPT.',
    },
    config: CONFIG,
    vocab: VOCAB,
    ids,
    lastPos,
    // tensors
    X, Q, K, V, Qr, Kr,
    scores, maskedScores, A, rowSums, C,
    R1, Hraw, H, M, R2,
    hFinal, logits, maskedLogits, probs,
    ranking, top,
    // shapes (handy for display / assertions)
    shapes: {
      X: shape(X), Q: shape(Q), K: shape(K), V: shape(V),
      Qr: shape(Qr), Kr: shape(Kr), scores: shape(scores),
      A: shape(A), C: shape(C), R1: shape(R1), M: shape(M), R2: shape(R2),
      hFinal: shape(hFinal), logits: shape(logits), probs: shape(probs),
    },
  };
}
