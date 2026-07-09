# Mini Decoder Tutor Demo

This is a new tutor-focused copy of `../mini-decoder-demo/`. The original demo is untouched.

It uses the same verified toy transformer math, but every scene now includes a study card with:

- what to learn
- the mental model
- the exact numbers to inspect
- the common confusion to avoid
- how the step connects to the next one

## Run

From the inner course repo:

```bash
cd /Users/ankitsingh/Documents/transformer-in-practice/transformer-in-practice
python3 -m http.server --bind 127.0.0.1 8000
```

Open:

```text
http://127.0.0.1:8000/module2-llm-internals/mini-decoder-demo-tutor/
```

Do not use `file://`; the page uses native ES modules.

## Verify the math

This copy keeps the same verifier:

```bash
cd /Users/ankitsingh/Documents/transformer-in-practice/transformer-in-practice/module2-llm-internals/mini-decoder-demo-tutor
python3 verify_trace.py
```

Expected final line:

```text
PASS: toy decoder trace matches expected values
```

## How to study it

On each scene, first read the study card, then inspect the highlighted table or vector. The goal is not to memorize every number. The goal is to understand what role each operation plays in the chain:

```text
ids → embeddings X → Q/K/V → RoPE → scores → mask → softmax A → A·V = C → X+C = R1 → FFN M → R1+M = R2 → logits → probabilities
```
