// toy-decoder-data.js
// -----------------------------------------------------------------------------
// LOCKED CONSTANTS for a pedagogical 1-layer, 1-head decoder-only transformer.
//
// These are TOY, hand-designed weights. They are NOT real GPT weights. They were
// chosen so that the concrete numbers are small, readable, and tell a clear story
// for the prompt "the dog bit ___":
//
//   * each embedding dimension carries a loose "meaning":
//        dim0 = determiner-ness   (words like "the")
//        dim1 = noun / animal-ness (words like "dog", "cat")
//        dim2 = verb / action-ness (words like "bit", "ran")
//        dim3 = a small shared bias channel
//   * attention lets the LAST token ("bit") look back at "the" and "dog",
//     writing determiner + subject context into the residual stream.
//   * the feed-forward network amplifies that determiner signal and damps the
//     raw verb signal, so the final position predicts a determiner.
//   * unembedding then scores "the" highest  ->  "the dog bit the".
//
// The exact same constants are re-implemented independently in verify_trace.py.
// -----------------------------------------------------------------------------

// ---- toy vocabulary (n_vocab = 8) -------------------------------------------
// Index 0 is the <pad> token. It is a real vocab entry but we NEVER want to
// predict it, so its logit is masked to -Infinity before the final softmax.
export const VOCAB = ['<pad>', 'the', 'dog', 'bit', 'cat', 'mailman', 'ran', '.'];

export const TOKEN_ID = Object.fromEntries(VOCAB.map((t, i) => [t, i]));

// ---- model configuration ----------------------------------------------------
export const CONFIG = {
  n_layer: 1,      // one transformer block
  n_head: 1,       // one attention head
  m: 3,            // sequence length (prompt tokens: "the", "dog", "bit")
  d_model: 4,      // width of the residual stream
  d_head: 4,       // head dimension (== d_model here, single head)
  d_ff: 4,         // feed-forward hidden width (no width expansion, for readability)
  n_vocab: 8,
  ropePairs: [[0, 1], [2, 3]], // RoPE rotates these coordinate pairs
  ropeFreq: [0.6, 0.2],        // toy angular frequency (radians / position) per pair
  padTokenId: 0,               // never predicted
  displayDecimals: 3,          // rounding used ONLY for display; math uses full precision
};

// ---- the prompt -------------------------------------------------------------
// "the dog bit" -> token ids [1, 2, 3]. m = 3 positions (positions 0, 1, 2).
export const PROMPT_TOKENS = ['the', 'dog', 'bit'];
export const PROMPT_IDS = PROMPT_TOKENS.map((t) => TOKEN_ID[t]); // [1, 2, 3]

// ---- embedding matrix  E : (n_vocab x d_model) ------------------------------
// One row per vocab token. X = the rows for our prompt ids.
export const E = [
  [0.0, 0.0, 0.0, 0.0], // 0 <pad>    (all zero)
  [1.0, 0.0, 0.0, 0.3], // 1 the      (pure determiner)
  [0.0, 1.0, 0.0, 0.2], // 2 dog      (animal)
  [0.0, 0.0, 1.0, 0.2], // 3 bit      (verb)
  [0.1, 0.9, 0.0, 0.2], // 4 cat      (animal, a little determiner-ish)
  [0.2, 0.7, 0.0, 0.2], // 5 mailman  (animate noun)
  [0.0, 0.1, 0.9, 0.2], // 6 ran      (verb)
  [0.0, 0.0, 0.0, 1.0], // 7 .        (punctuation, pure bias channel)
];

// ---- attention projections (each d_model x d_head) --------------------------
// THREE DISTINCT learned matrices. Q asks "what am I looking for", K offers
// "what do I match on", V is "the message I pass along".
export const W_Q = [
  [0.0, 0.0, 0.0, 0.0],
  [0.0, 1.0, 0.0, 0.0],
  [1.0, 0.0, 0.0, 0.0], // a verb (dim2) forms a query aimed at determiner keys (slot 0)
  [0.0, 0.0, 0.0, 1.0],
];
export const W_K = [
  [1.0, 0.0, 0.0, 0.0], // a determiner (dim0) exposes a key in slot 0
  [0.0, 1.0, 0.0, 0.0],
  [0.0, 0.0, 1.0, 0.0],
  [0.0, 0.0, 0.0, 1.0],
];
export const W_V = [
  [1.0, 0.0, 0.0, 0.0], // V is identity here: each token passes along its own meaning
  [0.0, 1.0, 0.0, 0.0],
  [0.0, 0.0, 1.0, 0.0],
  [0.0, 0.0, 0.0, 1.0],
];

// ---- feed-forward network ---------------------------------------------------
// FFN(x) = ReLU(x . W1 + b1) . W2 + b2
// W1 is identity, so each hidden neuron j reads residual dimension j:
//   neuron0 = ReLU(dim0)          "determiner-context" feature
//   neuron1 = ReLU(dim1 - 0.5)    "animal-subject" feature (thresholded -> ReLU clips)
//   neuron2 = ReLU(dim2)          "verb" feature
//   neuron3 = ReLU(dim3)          "bias" feature
// W2 then writes: strong determiner boost (+3.0 into dim0) and a verb damp
// (-1.0 into dim2) whenever the determiner-context feature is active.
export const W1 = [
  [1.0, 0.0, 0.0, 0.0],
  [0.0, 1.0, 0.0, 0.0],
  [0.0, 0.0, 1.0, 0.0],
  [0.0, 0.0, 0.0, 1.0],
];
export const B1 = [0.0, -0.5, 0.0, 0.0]; // threshold on the animal-subject neuron
export const W2 = [
  [3.0, 0.0, -1.0, 0.0], // determiner-context feature -> boost dim0, damp dim2
  [0.3, 0.0, 0.0, 0.0],  // animal-subject feature -> small determiner support
  [0.0, 0.0, 0.0, 0.0],
  [0.0, 0.0, 0.0, 0.0],
];
export const B2 = [0.0, 0.0, 0.0, 0.0];

// ---- unembedding matrix  U : (n_vocab x d_model) ----------------------------
// logits = h_final . U^T. Each row is a per-token "detector". (Kept separate
// from E here — i.e. untied output weights — so the last layer is easy to read.
// Real models such as GPT-2 often TIE these, reusing E as the unembedding.)
export const U = [
  [0.0,  0.0, 0.0, 0.0], // 0 <pad>    (masked out before softmax anyway)
  [1.55, 0.0, 0.0, 1.0], // 1 the      (determiner detector)
  [0.0,  1.6, 0.0, 0.6], // 2 dog
  [0.0,  0.0, 1.6, 0.6], // 3 bit
  [0.3,  1.4, 0.0, 0.6], // 4 cat
  [0.5,  1.1, 0.0, 0.6], // 5 mailman
  [0.0,  0.3, 1.5, 0.6], // 6 ran
  [0.0,  0.0, 0.0, 1.7], // 7 .
];
