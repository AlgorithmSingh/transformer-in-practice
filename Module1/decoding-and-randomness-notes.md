# Module 1 — Notes: Decoding, Randomness, and Probability vs. Frequency

> Synthesized from two Q&A deep-dive conversations clarifying Module 1 concepts
> (greedy decoding vs. sampling, temperature, where randomness actually lives,
> probability vs. observed frequency, and seeds). These notes turn the back-and-forth
> into a clean reference.

---

## TL;DR

- A model's **forward pass is deterministic**: the same tokenized input through the same frozen weights produces the **same probability distribution every time**.
- **Randomness lives only in the decoding step** — specifically when you *sample* a token from that distribution. It is one controllable RNG call, not something woven through the model.
- **Temperature / top-k / top-p** reshape or restrict the distribution *before* sampling. They do not change the model's weights.
- **Temperature 0 ≈ greedy decoding**: no dice roll, just take the top token. Effectively deterministic.
- **Probability is a fixed property** of (model + input). **Frequency** is what you actually count across runs, and it only *converges* to the probability as you draw more samples.
- **Setting a seed** + sampling on → identical output every run, because the RNG becomes reproducible (pseudo-random). This is the lever that makes sampled outputs predictable.

---

## 1. The two-step mental model (resolves most confusion)

Separate these cleanly — almost every "but isn't it random?" question dissolves once you do:

1. **Compute step (deterministic):** The frozen model does a forward pass and produces logits → a probability distribution over the whole vocabulary.
2. **Decode step (maybe random):** A decoding algorithm chooses one token from that distribution.

> The probability distribution is deterministic, but the token *choice* may be random.

So for the exact same prompt, system instruction, model, tokenized context, and computation, the next-token probabilities are the **same each run**. If `<|im_end|>` is 74% once, it stays 74% on every identical rerun — it does not randomly drift to 60%.

The course's "same prompt can give different responses" comes from **sampling**, not from the distribution itself changing.

---

## 2. Worked example: why outputs diverge

Suppose after generating `Positive`, the distribution is:

```
<|im_end|> = 74%
.          = 26%
```

**Greedy decoding** (what the DeepLearning.AI visualization uses): always pick the highest-probability token → always `<|im_end|>` → output stops at `Positive`. Deterministic for that state.

**Sampling** (temperature > 0): roll a weighted die over the 74/26 split.

| Run | Distribution (same!) | Sampled token | Output |
|-----|----------------------|---------------|--------|
| 1   | `<|im_end|>` 74%, `.` 26% | `<|im_end|>` | `Positive` |
| 2   | `<|im_end|>` 74%, `.` 26% | `.`          | `Positive.` |

The distribution was identical; the *sampled* token differed. And once `.` is appended, the context changes, so the **next** distribution differs — that's how two responses branch apart after the first divergent token. (The selected token is fed back into the input; the loop runs again — autoregressive generation.)

### "But I thought it was always greedy?"

No — that's the key correction. The visualization is greedy, but ChatGPT, Claude, and most chat products typically **sample**. Sampling adds intentional randomness to avoid rigid, repetitive, or bland outputs — not because the model is "having fun," but by design.

So: a "return exactly one word" instruction *influences* the distribution (makes `<|im_end|>` likely to dominate) but does **not guarantee** it dominates in every possible setup. A different model, wording, chat template, or preceding token could yield a distribution where `.` is higher.

---

## 3. Temperature

- Temperature operates **after** logits/probabilities are computed — it manipulates the distribution, then you sample.
- **Higher temperature** → flatter/spread-out distribution → lower-probability tokens become more likely → more variety.
- **Lower temperature** → sharper distribution → the top token dominates even more.
- **Temperature = 0** → behaves like greedy decoding: pick the top token. Conceptually deterministic.

> Mental model:
> - Model: "Here are the probabilities."
> - Greedy / temp 0 decoder: "Take the top one."
> - Sampling / temp > 0 decoder: "Usually take high-probability tokens, but sometimes pick another plausible one."

**Caveat:** in many hosted APIs, `temperature=0` means "as deterministic as possible" but isn't always a *perfect* mathematical guarantee — backend details (routing, quantization, batching, hardware kernels) can introduce tiny numerical differences.

---

## 4. Where does the randomness actually come from?

Common misconception: "the parameters are randomly initialized, so the whole thing is random forever." Not so.

- During **pretraining**, weights start random, then optimization tunes them, then the model is **frozen**. The frozen model is what you download / call via API.
- During **inference**, the model does **not** reinitialize anything. Q/K/V projection matrices, MLP weights, embeddings, layer norms — all **fixed learned parameters**.
- The forward pass is just deterministic matrix operations over fixed weights → a fixed distribution.

The randomness is **mainly** the act of **sampling the next token** from that distribution.

It is **not** mainly from:
- training initialization happening during inference,
- Q/K/V weights changing during inference,
- the model "deciding to be fun,"
- the encoder randomly changing the input.

**Inference flow:**
```
prompt tokens → frozen model forward pass → logits → probabilities → DECODE (choose token)
                       (deterministic)                                  (random iff sampling)
```

**Compact summary:**
- *Training:* random init → learning → freeze weights.
- *Inference forward pass:* deterministic distribution from fixed weights.
- *Decoding:* deterministic greedy choice **or** random sample.
- *Temperature / top-p / top-k:* reshape or restrict the distribution before the token is chosen.

---

## 5. Probability vs. frequency (the "100 runs" question)

**Setup:** if `.` sits at 31% and you generate the same prompt 100 times, how many full stops do you get?

- **Expected count = exactly 31 out of 100.** Each generation is an independent draw with a flat 31% shot at the full-stop band, so the average is exactly 31 — *not less*.
- But you won't get exactly 31 every batch: one batch gives 27, the next 35, the next 31. The deviations scatter **symmetrically around 31**, never systematically below it.

### Two distinct random variables (don't slide between them)

1. **The per-draw distribution** (the "69/31 ruler"): each single draw lands in a band; 31% chance of `.`. This is **fixed**.
2. **The count over N runs** (a bell-shaped distribution): how many full stops across 100 runs. This is the **"different type of distribution"** you sense when you aggregate — it's real, but it's *centered exactly on 31*, with the per-draw probability still pinned at 31%.

So "less than 31%" is the one slip: the average is exactly 31; you just rarely hit it dead-on in a small batch.

### The coin analogy (identical machine)

- A coin is always 50% — fixed fact about the coin.
- Toss it 10 times → maybe 7 tails, 3 heads. That's **not the coin changing**, it's a small sample wandering.
- Toss it 10,000 times → lands right near 50/50.

Map across: the token's true probability is **fixed at 31%** (same input → same 69/31 every run). In a small batch the **observed frequency wanders**; in a giant batch it **converges** to 31%. The true probability never budged — only the measurement wobbles.

### Fixing "sometimes the actual distribution is 20%"

Same trap one level up. The **true distribution does not become 20%** — same input → same 69/31 forward pass, always. What you'd *see* as "20%" is the **observed frequency** in a finite sample landing below the true 31%.

> **Burn this in:** probability is a fixed property of (model + input); frequency is what you actually count; frequency only converges to probability as you draw more. The coin is 50% even on the toss where you got 7 tails.

### Two theorems holding hands

- **Law of Large Numbers** — observed frequency converges to the true rate as N grows.
- **Central Limit Theorem (CLT)** — the bell-shaped scatter of the count around that true rate.

The coin intuition already bakes in both.

---

## 6. Sample size: how many you pick, not how many you could pick

- **Generating one token is a sample of size one (n = 1).**
- The **vocabulary** (tens of thousands of tokens, ~50,000) is the **size of the outcome space**, *not* the sample size.

**Die analogy:** a die has 6 faces, but rolling it once is sample size **one**, not six. Roll it 100 times → sample size 100. The faces are the *options*; the rolls are the *sample*.

So one token generation = a single draw (n=1) from a distribution with ~50,000 possible outcomes — **small sample, big menu, two unrelated numbers**. Sample size is *how many times you pick*, never *how many things you could have picked*.

This is why a single token at temperature 1 is so coin-flip-like: it's a sample of one, so you just get whatever you get. The 69/31 only becomes *visible* as a frequency if you run the prompt hundreds of times and count. And it's the final reason **temp 0 ducks the whole conversation**: no dart, no draw, no sampling distribution — just the top band taken directly, every time.

---

## 7. Seeds: making sampled output reproducible

The clincher that proves the whole picture:

- Most inference APIs let you **set a random seed**.
- **Fix the seed, leave sampling on → identical output every single time.**
- If randomness were woven throughout the model, a single seed couldn't possibly pin the output down. The fact that one seed fully determines the result **proves the randomness is exactly one controllable RNG call at the sampling step — nothing more.**
- **Temperature = 0 removes even that** (collapses to greedy).

**Why it works:** the RNG is **pseudo-random** — given the same seed it produces the same sequence of "random" numbers. So when the decoder samples from the distribution, it makes the same weighted-die roll every time → same token every time.

### Practical relevance (open question from the chat)

This is the lever that makes LLMs more **predictable** for systems use:
- APIs like Gemini/OpenAI offer **structured outputs** (JSON, not just text), which teams hesitate to rely on because "these things are random."
- Combining **structured outputs + a fixed seed** (and/or temp 0 / constrained decoding) is how you get more deterministic, system-grade behavior — expanding where LLMs can be trusted in pipelines.

> Note: seed support and exact reproducibility vary by provider; hosted backends may still introduce minor nondeterminism (see the temperature caveat in §3).

---

## Quick-reference glossary

| Term | One-liner |
|------|-----------|
| **Greedy decoding** | Always pick the highest-probability token. Deterministic. |
| **Sampling** | Roll a weighted die over the distribution; can pick lower-probability tokens. |
| **Temperature** | Scales the distribution before sampling: high = flatter/varied, 0 ≈ greedy. |
| **Probability** | Fixed property of (model + input); the true per-draw rate. |
| **Frequency** | Observed count across runs; converges to probability as N grows. |
| **Sample size (n)** | How many times you draw — one token = n=1. |
| **Outcome space** | The set of possible tokens (the ~50k vocabulary). |
| **Seed** | Fixes the pseudo-RNG so sampled output is reproducible. |
| **Law of Large Numbers** | Frequency → true probability as N grows. |
| **Central Limit Theorem** | Counts scatter in a bell shape around the true rate. |
