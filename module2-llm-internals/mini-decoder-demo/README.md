# Mini decoder-only transformer — "the dog bit ___"

An animated, **by-hand** walkthrough of how concrete numbers flow through a
decoder-only transformer and turn into a next-token prediction. It follows the
three diagrams in this module, in order:

- **image 1** — full decoder-only overview (`desktop1.png`)
- **image 2** — one transformer block with residual connections (`image2.png`)
- **image 3** — one attention head, step by step (`image3.png`)

The model is a **toy 1-layer, 1-head** decoder with tiny vectors
(`d_model = 4`, `d_head = 4`, vocab = 8, sequence = 3). The weights are
hand-picked so the numbers are readable and tell a clear story — **they are not
real GPT weights**.

The result: for the prompt **"the dog bit ___"** the model predicts **"the"**
(→ *"the dog bit the"*) with probability **≈ 0.354**.

---

## Run it

ES modules must be served over HTTP — opening `index.html` as a `file://` URL
will **not** work (the browser blocks module loading from `file://`).

```bash
cd /Users/ankitsingh/Documents/transformer-in-practice/transformer-in-practice
python3 -m http.server --bind 127.0.0.1 8000
```

Then open:

```
http://127.0.0.1:8000/module2-llm-internals/mini-decoder-demo/
```

No build step, no dependencies, no network/CDN calls — just static files.

**Controls:** `Prev` / `Next` / `Play` / `Pause` / `Reset`, clickable
breadcrumbs (Full decoder → Transformer block → Attention head), and the dot
rail. Keyboard: `←` / `→` step, `space` play/pause, `Home` / `End` jump.

**Debugging:** the full numeric trace is on `window.TOY_DECODER_TRACE` in the
browser console.

---

## Verify the math (independent recomputation)

`verify_trace.py` re-implements the same forward pass **from scratch in Python**
(it does **not** read the browser's output) and asserts the invariants a correct
decoder must satisfy.

```bash
cd module2-llm-internals/mini-decoder-demo
python3 verify_trace.py
```

On success it prints exactly:

```
PASS: toy decoder trace matches expected values
```

It checks: tensor **shapes**; the causal mask (upper-triangle scores are exactly
`-inf`); attention rows **sum to 1** with masked cells `= 0`; that **ReLU** clips
a negative pre-activation; that `<pad>` is masked to `-inf` **before** softmax and
gets probability 0; that prediction probabilities are finite and **sum to 1**; and
that the **top token is "the"**.

---

## What each scene shows

| # | Scene | Diagram level | Key numbers |
|---|-------|---------------|-------------|
| 1 | Prompt → tokens → ids | full | vocab, ids `[1,2,3]` |
| 2 | Embedding layer → `X` | full | `E`, `X` (3×4), the residual stream |
| 3 | Inside one block | block | `R1 = X + C`, `R2 = R1 + M` |
| 4 | Step 1 — make `Q, K, V` | attn | `W_Q/W_K/W_V`, `Q/K/V` |
| 5 | Step 2 — RoPE on `Q, K` | attn | rotated `Q'`, `K'` |
| 6 | Step 3a — `Q'·K'ᵀ/√d` | attn | raw score matrix |
| 7 | Step 3b — causal mask | attn | `-inf` upper triangle |
| 8 | Step 4 — softmax → `A` | attn | rows sum to 1 |
| 9 | Step 5 — context `C = A·V` | attn | attention output |
| 10 | Residual add #1 — `R1 = X + C` | block | element-wise add |
| 11 | Feed-forward → `M` | block | ReLU clip visible |
| 12 | Residual add #2 — `R2 = R1 + M` | block | block output |
| 13 | Only the **last** position predicts | full | `h_final = R2[2]` (the "p4" rule) |
| 14 | Unembedding → logits | full | `logits = h_final · Uᵀ` |
| 15 | Mask `<pad>`, softmax → prediction | full | `P(next) `, top = "the" |
| 16 | Recap | full | the full residual-stream story |

### The residual-stream story (why "the" wins)

1. **Attention** lets the last token *bit* look back at *the* and *dog*, writing
   determiner + subject context into its residual (`C`).
2. **The FFN** amplifies that determiner signal and damps the raw verb signal
   (`M`) — and its **ReLU** genuinely clips a negative pre-activation at the last
   position (the "animal-subject" feature, because *bit* is not an animal).
3. **Two residual adds** keep everything in one same-shape stream, which the
   **unembedding** reads out — scoring the determiner *the* highest.

---

## Simplifications (kept honest on purpose)

This is a teaching toy. Compared with a real decoder-only transformer it omits:

- **Only one layer and one head** (real models stack many of both).
- **Tiny vectors:** `d_model = 4`, `d_head = 4`, `d_ff = 4` (no FFN width
  expansion — real FFNs expand ~4×), vocab = 8.
- **No LayerNorm / RMSNorm** — the grey dashed boxes in image 2 mark where it
  would go. We skip it so the residual-add arithmetic stays clean.
- **No multi-head concatenation, no output projection `W_O`.**
- **No KV-cache, no dropout, no training** — the weights are hand-designed, not
  learned.
- **Untied unembedding:** we use a separate matrix `U` so the last layer is easy
  to read. Real GPT-2 **ties** weights (reuses the embedding matrix `E`).
- **1 word = 1 token.** Real tokenizers split on sub-words.

The **shapes and the flow** — embeddings → masked attention → residual → FFN →
residual → unembed the last position → softmax — are faithful to the real thing.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | No-build ES-module page shell |
| `styles.css` | Palette matched to the module diagrams |
| `toy-decoder-data.js` | Locked constants (vocab, weights) |
| `toy-decoder-math.js` | Pure math + `buildTrace()` |
| `toy-decoder-scenes.js` | The ~16 scene definitions |
| `app.js` | Renderer + controls; sets `window.TOY_DECODER_TRACE` |
| `verify_trace.py` | Independent Python recomputation + assertions |
