#!/usr/bin/env python3
"""
verify_trace.py — INDEPENDENT recomputation of the toy decoder trace.

This does NOT read any browser output. It re-implements the same math from the
same locked constants (mirrored from toy-decoder-data.js) and asserts the
structural invariants a correct decoder-only forward pass must satisfy:

  * shapes of every tensor
  * causal mask: upper-triangle score cells are exactly -inf
  * attention weights: every row sums to 1 and masked cells are 0
  * <pad> is excluded from prediction (its masked logit is -inf)
  * prediction probabilities are finite and sum to 1 over the allowed tokens
  * the top predicted token is "the"  ->  "the dog bit the"

Run:  python3 verify_trace.py
On success it prints exactly:  PASS: toy decoder trace matches expected values
"""
import math

# ---------------------------------------------------------------- constants
# (mirrored verbatim from toy-decoder-data.js)
VOCAB = ["<pad>", "the", "dog", "bit", "cat", "mailman", "ran", "."]
D_MODEL = 4
D_HEAD = 4
D_FF = 4
N_VOCAB = 8
PAD_ID = 0
ROPE_PAIRS = [(0, 1), (2, 3)]
ROPE_FREQ = [0.6, 0.2]
DISPLAY_DECIMALS = 3

PROMPT_IDS = [1, 2, 3]  # the dog bit
M = len(PROMPT_IDS)

E = [
    [0.0, 0.0, 0.0, 0.0],
    [1.0, 0.0, 0.0, 0.3],
    [0.0, 1.0, 0.0, 0.2],
    [0.0, 0.0, 1.0, 0.2],
    [0.1, 0.9, 0.0, 0.2],
    [0.2, 0.7, 0.0, 0.2],
    [0.0, 0.1, 0.9, 0.2],
    [0.0, 0.0, 0.0, 1.0],
]
W_Q = [[0.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [1.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]]
W_K = [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]]
W_V = [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]]
W1 = [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]]
B1 = [0.0, -0.5, 0.0, 0.0]
W2 = [[3.0, 0.0, -1.0, 0.0], [0.3, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]]
B2 = [0.0, 0.0, 0.0, 0.0]
U = [
    [0.0, 0.0, 0.0, 0.0],
    [1.55, 0.0, 0.0, 1.0],
    [0.0, 1.6, 0.0, 0.6],
    [0.0, 0.0, 1.6, 0.6],
    [0.3, 1.4, 0.0, 0.6],
    [0.5, 1.1, 0.0, 0.6],
    [0.0, 0.3, 1.5, 0.6],
    [0.0, 0.0, 0.0, 1.7],
]

NEG_INF = float("-inf")


# ---------------------------------------------------------------- math
def matmul(A, B):
    n, k, m = len(A), len(A[0]), len(B[0])
    out = [[0.0] * m for _ in range(n)]
    for i in range(n):
        for t in range(k):
            a = A[i][t]
            for j in range(m):
                out[i][j] += a * B[t][j]
    return out


def transpose(A):
    return [[A[i][j] for i in range(len(A))] for j in range(len(A[0]))]


def add(A, B):
    return [[A[i][j] + B[i][j] for j in range(len(A[0]))] for i in range(len(A))]


def relu(x):
    return x if x > 0 else 0.0


def softmax(row):
    finite = [x for x in row if x != NEG_INF]
    mx = max(finite)
    exps = [0.0 if x == NEG_INF else math.exp(x - mx) for x in row]
    s = sum(exps)
    return [e / s for e in exps]


def rope(row, pos):
    r = list(row)
    for p, (a, b) in enumerate(ROPE_PAIRS):
        ang = pos * ROPE_FREQ[p]
        c, s = math.cos(ang), math.sin(ang)
        xa, xb = r[a], r[b]
        r[a] = xa * c - xb * s
        r[b] = xa * s + xb * c
    return r


# ---------------------------------------------------------------- forward
def forward():
    X = [list(E[i]) for i in PROMPT_IDS]
    Q, K, V = matmul(X, W_Q), matmul(X, W_K), matmul(X, W_V)
    Qr = [rope(Q[i], i) for i in range(M)]
    Kr = [rope(K[i], i) for i in range(M)]

    scale = math.sqrt(D_HEAD)
    raw = matmul(Qr, transpose(Kr))
    scores = [[raw[i][j] / scale for j in range(M)] for i in range(M)]
    masked = [[scores[i][j] if j <= i else NEG_INF for j in range(M)] for i in range(M)]
    A = [softmax(masked[i]) for i in range(M)]
    C = matmul(A, V)

    R1 = add(X, C)
    pre = matmul(R1, W1)
    Hraw = [[pre[i][j] + B1[j] for j in range(D_FF)] for i in range(M)]
    H = [[relu(v) for v in Hraw[i]] for i in range(M)]
    Mupd = add([[matmul(H, W2)[i][j] for j in range(D_MODEL)] for i in range(M)],
               [list(B2) for _ in range(M)])
    R2 = add(R1, Mupd)

    last = M - 1
    h_final = list(R2[last])
    logits = [sum(h_final[j] * U[v][j] for j in range(D_MODEL)) for v in range(N_VOCAB)]
    mlogits = [NEG_INF if v == PAD_ID else logits[v] for v in range(N_VOCAB)]
    probs = softmax(mlogits)
    return dict(X=X, Q=Q, K=K, V=V, Qr=Qr, Kr=Kr, scores=scores, masked=masked,
                A=A, C=C, R1=R1, Hraw=Hraw, H=H, M=Mupd, R2=R2, h_final=h_final,
                logits=logits, mlogits=mlogits, probs=probs)


# ---------------------------------------------------------------- assertions
def shape(x):
    return (len(x), len(x[0])) if isinstance(x[0], list) else (len(x),)


def main():
    t = forward()
    tol = 1e-9

    # 1. shapes
    assert shape(t["X"]) == (M, D_MODEL), shape(t["X"])
    for name in ("Q", "K", "V", "Qr", "Kr", "C", "R1", "M", "R2"):
        assert shape(t[name]) == (M, D_MODEL), (name, shape(t[name]))
    for name in ("scores", "masked", "A"):
        assert shape(t[name]) == (M, M), (name, shape(t[name]))
    assert shape(t["h_final"]) == (D_MODEL,)
    assert shape(t["logits"]) == (N_VOCAB,)
    assert shape(t["probs"]) == (N_VOCAB,)

    # 2. causal mask: strictly-upper cells are exactly -inf, lower/diag are finite
    for i in range(M):
        for j in range(M):
            if j > i:
                assert t["masked"][i][j] == NEG_INF, (i, j)
            else:
                assert math.isfinite(t["masked"][i][j]), (i, j)

    # 3. attention rows sum to 1; masked cells are exactly 0
    for i in range(M):
        assert abs(sum(t["A"][i]) - 1.0) < tol, ("rowsum", i, sum(t["A"][i]))
        for j in range(M):
            if j > i:
                assert t["A"][i][j] == 0.0, ("nonzero masked weight", i, j)

    # 4. ReLU actually clipped a negative pre-activation at the last position
    last = M - 1
    assert min(t["Hraw"][last]) < 0.0, "expected a negative pre-activation to clip"
    assert min(t["H"][last]) >= 0.0, "ReLU output must be non-negative"

    # 5. residual stream keeps its shape through both adds
    assert shape(t["R1"]) == shape(t["X"]) == shape(t["R2"])

    # 6. <pad> is masked out of the prediction (its masked logit is -inf, prob 0)
    assert t["mlogits"][PAD_ID] == NEG_INF
    assert t["probs"][PAD_ID] == 0.0

    # 7. probabilities are finite and sum to 1 over the allowed tokens
    assert all(math.isfinite(p) for p in t["probs"])
    assert abs(sum(t["probs"]) - 1.0) < tol, sum(t["probs"])

    # 8. top prediction is "the"  ->  "the dog bit the"
    top = max(range(N_VOCAB), key=lambda v: t["probs"][v])
    assert VOCAB[top] == "the", (VOCAB[top], t["probs"][top])

    # 9. the tuned probability lands near the 0.355 design target
    p_the = t["probs"][VOCAB.index("the")]
    assert 0.34 <= p_the <= 0.37, p_the

    # ---- human-readable report ----
    r = DISPLAY_DECIMALS
    print("prompt: the dog bit ___")
    print(f"h_final (R2[last]) = {[round(x, r) for x in t['h_final']]}")
    print("attention row sums = ", [round(sum(row), 6) for row in t["A"]])
    order = sorted(range(N_VOCAB), key=lambda v: -t["probs"][v])
    print("prediction distribution (pad excluded before softmax):")
    for v in order:
        tag = "  <- next token" if v == top else ("  (masked)" if v == PAD_ID else "")
        print(f"   {VOCAB[v]:<9} p = {t['probs'][v]:.{r}f}{tag}")
    print(f"continuation: \"the dog bit {VOCAB[top]}\"  (p(the) = {p_the:.{r}f})")
    print("PASS: toy decoder trace matches expected values")


if __name__ == "__main__":
    main()
