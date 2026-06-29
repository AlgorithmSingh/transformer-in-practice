# Module 1 — Notes: Top-K, Top-P, and What the APIs Actually Allow

> Synthesized from a Q&A deep-dive clarifying the sampling slide in Module 1
> ("change temperature OR top P, but not both", and whether top-K and top-P
> are mutually exclusive). Companion to [[decoding-and-randomness-notes]],
> which covers greedy vs. sampling, temperature, probability vs. frequency, and seeds.

---

## TL;DR

- **Top-K and top-P are NOT mutually exclusive.** They are two filters that *stack* — a token must survive **both** cuts, so the candidate pool is the **intersection** (the overlap).
- They cut in different **units**: top-K counts **tokens** ("keep the K tallest"); top-P counts **probability mass** ("keep however many tokens it takes to cover P%").
- Result of stacking is always the **shorter prefix** of the ranked list → `min(K, nucleus-size)`. No tug-of-war; you just obey whichever cut is **stricter**.
- Which filter is stricter **flips token by token**, depending on the distribution's shape at that step. They "take turns."
- **Temperature ↔ top-P** is the *real* "tune one, not both" pairing — and it's **advice** (both control spread, so you can't tell which knob did what). **Top-P ↔ top-K** is **not** an either/or; they compose freely.
- **Temperature = 0 ⇒ greedy ⇒ all of this is moot:** one candidate survives, nothing left for top-K/top-P to filter. These knobs only come alive once temperature > 0.
- **API reality (2026):** the frontier is *removing* these dials. Current Claude (Opus 4.7+, incl. 4.8) rejects temperature/top_p/top_k entirely (400 error); OpenAI never exposed top_k; Gemini exposes all three. Control is shifting to **prompting + structured/constrained outputs**.

---

## 1. The slide has TWO separate "OR" claims — don't conflate them

The Module 1 sampling slide contains two different either/or statements that mean different things:

1. **"Change temperature OR top-P, but not both."** — a pairing of **temperature vs. top-P**. Soft *advice*, not a mechanical lock.
2. The (mistaken) reading that **top-P vs. top-K** is an either/or. — This is **wrong**: they stack.

| Pair | Relationship | Why |
|------|--------------|-----|
| **Temperature ↔ top-P** | "tune one, not both" — *soft recommendation* | Both govern the **spread** of the distribution. Temperature reshapes the whole thing (swells/flattens bands); top-P then trims the tail of whatever shape resulted. Move both and you can't tell which knob caused a change. |
| **Top-P ↔ top-K** | **Independent filters that stack freely** — *not* an either/or | They measure different things (mass vs. count), so they compose. |

Top-K is a different *kind* of control (a hard count cap), which is why it sits outside the temperature-vs-top-P either/or.

---

## 2. Why top-K and top-P compose (the intersection)

- **Top-K counts tokens:** "keep the K tallest." (a hard count cap)
- **Top-P (nucleus) counts mass:** "keep tokens until the running total covers P%."

Because one measures **count** and the other measures **mass**, the two cuts can land in different places. Set both → a token must clear **both** → the candidate pool is the **overlap**.

Both filters keep a **top-prefix** of the ranked token list. So the intersection is always just the **shorter prefix**:

```
candidate pool = min(K, nucleus-size)   ← whichever cut is stricter
```

There is never a tug-of-war and never a "conflict to resolve" — both filters only ever *remove the tail*; neither one *demands* or *tops up* to a target mass.

Collapse to greedy: set either filter to its tightest — **top-K = 1** or **top-P = 0** — and only the single top token survives.

---

## 3. Worked example: top-P = 80%, top-K = 2 (the "won't reach 80%" worry)

Distribution after some token:

```
the  45%
a    22%   (cumulative 67%)
this 12%   (cumulative 79%)
my    9%   (cumulative 88%)
our   7%
...
```

- **Top-K = 2** → keep `{the, a}` = a 2-token prefix (67% of mass).
- **Top-P = 80%** → keep until cumulative ≥ 80%: the(45) → a(67) → this(79) → my(88 ✓) → a 4-token prefix.
- **Intersection** = shorter prefix = `{the, a}`. **Top-K wins.** (`my` survives top-P but top-K already chopped it.)

**The key subtlety:** top-K = 2 only gives 67%, *not* the 80% top-P "wanted." What happens? **Nothing.**

> **Top-P is a ceiling, not a quota.** It only ever *chops off the tail beyond P%*; it never *adds* tokens to reach a target. With only 2 tokens at 67% in front of it, top-P sees they're under its 80% ceiling and has nothing to trim. The 80% simply goes unmet — and that's fine.

You then sample from `{the, a}`, **renormalized** to sum to 1 (≈ 67/33 → ≈ 67% / 33%).

### The winner flips with the distribution's shape

Same two settings (top-P = 80%, top-K = 2), opposite winner:

- **Spread-out head** (example above): 2 tokens fall short of 80% → **top-K is stricter, top-K wins.**
- **Peaked head** (e.g. top token alone = 85%): top-P crosses 80% immediately and keeps **1** token, while top-K = 2 would allow two → **top-P is stricter, top-P wins** (single token).

Decided entirely by how peaked the distribution is *at that step*. This is the "they take turns" point made concrete.

---

## 4. Why stack both? Each catches the case the other misses

At any single step only the **tighter** cut actually does work; the looser one is *slack* (changes nothing that step). But which is tighter flips per token — so they're not one-effective-one-dead-weight; they trade off, and that trade-off is the whole reason to set both:

| Model state | Distribution | Binding filter | What it does |
|-------------|--------------|----------------|--------------|
| **Confident** | peaked (few tokens hold most mass) | **top-P bites first** | keeps just those few; a top-K of 40 is never reached (top-K slack) |
| **Uncertain** | flat (mass smeared over hundreds) | **top-K bites first** | caps count at K and slams the door before the long junk tail; top-P alone would keep a huge pile to reach 90% (top-P slack) |

- **Top-P adapts to shape** — more candidates when the model is unsure, fewer when sure.
- **Top-K is a hard ceiling** — saves you on flat distributions where top-P alone would let garbage through.

They're guardrails on **two different walls**, not two attempts at the same wall. You don't need to track which is firing — between the two, the candidate set stays sane whatever the shape.

---

## 5. "So what does the API actually say?" (2026 reality)

The real APIs have moved out from under the course slide — and in a direction that partly **dissolves** the question. Whether you *can* set both is purely an **API/SDK question**: the intersection math is universal, but you can only reach it if the parameter is on the menu.

### Anthropic — the surprising one
- **Claude Opus 4.7 and later (including Opus 4.8): `temperature`, `top_p`, and `top_k` are NOT supported.** Setting any to a non-default value returns a **400 error**. You're told to **omit them and steer via prompting**.
- **Sonnet 4.5 / Haiku 4.5:** the knobs exist but are constrained — you may set **either `temperature` OR `top_p`, not both**. Enforced, not advised: setting both returns a 400 (*"temperature and top_p cannot both be specified for this model"*). So on Claude's side the slide's "OR" is a **hard error**, not a gentle nudge.

### OpenAI
- **Never exposed `top_k`.** You only get `temperature` (0–2) and `top_p` (0–1), with the usual "tune one, not both" advice. You literally **cannot** stack top_p + top_k there — top_k isn't on the menu.

### Gemini
- **Exposes all three.** Generation config accepts `temperature`, `top_p`, and `top_k` (default 40) **together** in one call. This is the provider where the stacking/intersection picture is **literally a real, supported setup**.

### Precise answer to "can I set both top_p and top_k?"
Only where top_k is exposed at all → today that means **Gemini** (and local stacks like **vLLM / llama.cpp**) — **not** OpenAI, and **not** the current Claude.

> ⚠️ Verify against live docs before relying on exact model-by-model behavior — these constraints change with model releases.

---

## 6. The bigger arc: dials → prompting

This loops back to where the broader Module 1 discussion began. The frontier is **actively removing** sampling dials (Anthropic outright on the newest models; OpenAI never offering top_k) and steering you toward **prompting and structured/constrained outputs** instead.

On the current Claude, the official answer to "how do I control the output?" is no longer "tune temperature/top_p/top_k" — it's **omit them and write a tighter prompt**. So **constrained decoding and prompt/context engineering** (covered elsewhere in Module 1) aren't a side topic — they're becoming the **whole control surface**.

---

## Quick-reference glossary

| Term | One-liner |
|------|-----------|
| **Top-K** | Keep the K highest-probability tokens (counts **tokens** — a hard count cap). |
| **Top-P (nucleus)** | Keep the smallest set of top tokens whose cumulative probability ≥ P% (counts **mass**). A **ceiling, not a quota** — only trims the tail, never tops up. |
| **Intersection / stacking** | With both on, a token must survive both → pool = shorter prefix = `min(K, nucleus-size)`. |
| **Binding vs. slack** | The *stricter* filter does the cutting (binding); the looser one is slack. Which is which flips per token with the distribution's shape. |
| **Temperature ↔ top-P** | Both control spread → "tune one, not both" (soft advice; hard 400 on Claude Sonnet/Haiku 4.5). |
| **Greedy short-circuit** | temp = 0 ⇒ one candidate ⇒ top-K/top-P have nothing to filter. |
