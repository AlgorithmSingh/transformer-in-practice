# Mini Decoder Tutor Number Slides

This is a new tutor-focused copy of `../mini-decoder-number-slides/`. The original slideshow is untouched.

It uses the same verified toy transformer math, but every slide now has structured teaching notes:

- what to learn
- speaker explanation
- key number to point at
- common confusion to avoid
- how the slide connects to the next one

This version is meant for live teaching or self-study, not just quick visual playback.

## Run

From the inner course repo:

```bash
cd /Users/ankitsingh/Documents/transformer-in-practice/transformer-in-practice
python3 -m http.server --bind 127.0.0.1 8000
```

Open:

```text
http://127.0.0.1:8000/module2-llm-internals/mini-decoder-number-slides-tutor/
```

Do not open with `file://`; this page imports ES modules and should be served over local HTTP.

## Controls

Use arrow keys or Prev/Next. Press `N` to toggle notes. Use Print / PDF if you want a handout with the teaching notes.

## Verify the math

The math is shared with the first demo. To verify independently:

```bash
cd /Users/ankitsingh/Documents/transformer-in-practice/transformer-in-practice/module2-llm-internals/mini-decoder-demo
python3 verify_trace.py
```

Expected final line:

```text
PASS: toy decoder trace matches expected values
```

## Teaching goals

By the end, learners should be able to explain why generation uses the last input position, trace token IDs into embeddings and attention, distinguish Q/K matching from V content, explain causal masking, describe residual additions as “keep the stream and add updates,” and connect logits to probabilities.
