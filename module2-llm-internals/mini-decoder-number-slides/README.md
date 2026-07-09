# Mini Decoder Number Slides

This is a presentation-style version of the toy decoder demo for explaining the math of:

```text
the dog bit ___  →  the dog bit the
```

It reuses the verified constants and forward pass from `../mini-decoder-demo/`, but lays the computation out like a slideshow with larger tables, formulas, and speaker notes.

## Run

From the inner course repo:

```bash
cd /Users/ankitsingh/Documents/transformer-in-practice/transformer-in-practice
python3 -m http.server --bind 127.0.0.1 8000
```

Open:

```text
http://127.0.0.1:8000/module2-llm-internals/mini-decoder-number-slides/
```

Do not open with `file://`; this page imports ES modules and should be served over local HTTP.

## Controls

Use the arrow keys, or the Prev/Next buttons. Press `N` to toggle speaker notes. Use “Print / PDF” to export the whole deck with notes.

## What this version emphasizes

This deck is optimized for live explanation. It shows the actual numbers for token IDs, embeddings, Q/K/V, RoPE, score matrix, causal mask, softmax attention weights, `A·V`, residual adds, feed-forward update, final logits, and next-token probabilities.

## Verify the math

The math is shared with the first demo. To verify it independently:

```bash
cd /Users/ankitsingh/Documents/transformer-in-practice/transformer-in-practice/module2-llm-internals/mini-decoder-demo
python3 verify_trace.py
```

Expected final line:

```text
PASS: toy decoder trace matches expected values
```

## Simplifications

This is a toy model: one layer, one attention head, tiny vectors, one word equals one token, hand-designed weights, no LayerNorm/RMSNorm, no multi-head concatenation, no output projection, no KV cache, and no dropout. The goal is to make the real transformer flow explainable with small numbers.
