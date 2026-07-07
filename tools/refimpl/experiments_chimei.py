# Measured facts for the chimei (municipality-name) trunk: counting bigram,
# neural bigram, and MLP language model. Every number an observation callout
# quotes for these decks must come from this script's output.
#
# Usage: python experiments_chimei.py

import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[2]
BOUNDARY = "・"   # start/end-of-name marker, index 0


def load_names():
    lines = (ROOT / "data" / "chimei.csv").read_text(encoding="utf-8").splitlines()[1:]
    names = [l.split(",")[0] for l in lines]
    chars = [BOUNDARY] + sorted(set("".join(names)))
    stoi = {c: i for i, c in enumerate(chars)}
    return names, chars, stoi


def split(names, seed=42):
    g = torch.Generator().manual_seed(seed)
    perm = torch.randperm(len(names), generator=g).tolist()
    n = int(len(names) * 0.9)
    return [names[i] for i in perm[:n]], [names[i] for i in perm[n:]]


def bigram_pairs(names, stoi):
    xs, ys = [], []
    for name in names:
        seq = [0] + [stoi[c] for c in name] + [0]
        for a, b in zip(seq, seq[1:]):
            xs.append(a)
            ys.append(b)
    return torch.tensor(xs), torch.tensor(ys)


def counting_bigram(train, stoi, V, smooth=1):
    N = torch.zeros(V, V)
    xs, ys = bigram_pairs(train, stoi)
    for a, b in zip(xs.tolist(), ys.tolist()):
        N[a, b] += 1
    P = (N + smooth) / (N + smooth).sum(dim=1, keepdim=True)
    return N, P


def nll(P, names, stoi):
    xs, ys = bigram_pairs(names, stoi)
    return -torch.log(P[xs, ys]).mean().item()


def sample_bigram(P, chars, n, seed):
    g = torch.Generator().manual_seed(seed)
    out = []
    while len(out) < n:
        i, s = 0, ""
        while True:
            i = torch.multinomial(P[i], 1, generator=g).item()
            if i == 0:
                break
            s += chars[i]
        if s:
            out.append(s)
    return out


def context_dataset(names, stoi, ctx):
    xs, ys = [], []
    for name in names:
        seq = [0] * ctx + [stoi[c] for c in name] + [0]
        for i in range(len(seq) - ctx):
            xs.append(seq[i:i + ctx])
            ys.append(seq[i + ctx])
    return torch.tensor(xs), torch.tensor(ys)


class MLPLM(nn.Module):
    def __init__(self, V, ctx, n_embd=8, hidden=64):
        super().__init__()
        self.emb = nn.Embedding(V, n_embd)
        self.net = nn.Sequential(
            nn.Linear(ctx * n_embd, hidden), nn.ReLU(), nn.Linear(hidden, V))

    def forward(self, x):                      # x: (B, ctx)
        e = self.emb(x)                        # (B, ctx, n_embd)
        return self.net(e.flatten(1))          # (B, V) logits


def train_model(model, xs, ys, steps, lr, seed=0, batch=None, log_at=()):
    torch.manual_seed(seed)
    opt = torch.optim.AdamW(model.parameters(), lr=lr)
    g = torch.Generator().manual_seed(seed)
    for it in range(1, steps + 1):
        if batch is None:
            xb, yb = xs, ys
        else:
            ix = torch.randint(len(xs), (batch,), generator=g)
            xb, yb = xs[ix], ys[ix]
        opt.zero_grad()
        loss = F.cross_entropy(model(xb), yb)
        loss.backward()
        opt.step()
        if it in log_at:
            print(f"    step {it:5d} | batch loss {loss.item():.4f}")
    return model


@torch.no_grad()
def model_nll(model, xs, ys):
    return F.cross_entropy(model(xs), ys).item()


def sample_mlp(model, chars, ctx, n, seed):
    torch.manual_seed(seed)
    out = []
    while len(out) < n:
        window, s = [0] * ctx, ""
        while True:
            logits = model(torch.tensor([window]))
            i = torch.multinomial(F.softmax(logits, dim=-1), 1).item()
            if i == 0:
                break
            s += chars[i]
            window = window[1:] + [i]
        if s:
            out.append(s)
    return out


def main():
    torch.set_num_threads(4)
    names, chars, stoi = load_names()
    V = len(chars)
    train, val = split(names)
    total_chars = sum(len(n) for n in names)
    print(f"names {len(names)} (train {len(train)} / val {len(val)}), "
          f"total {total_chars} chars, vocab {V} (incl boundary)")
    print(f"name length min {min(map(len, names))} max {max(map(len, names))} "
          f"mean {total_chars / len(names):.2f}")

    print("\n== counting bigram ==")
    N, P = counting_bigram(train, stoi, V)
    print(f"train nll {nll(P, train, stoi):.4f} | val nll {nll(P, val, stoi):.4f} "
          f"| uniform {torch.log(torch.tensor(float(V))).item():.4f}")
    first = N[0]
    top_first = [(chars[i], int(first[i])) for i in first.argsort(descending=True)[:8]]
    print("top first chars:", top_first)
    enders = N[:, 0]
    top_end = [(chars[i], int(enders[i])) for i in enders.argsort(descending=True)[:8]]
    print("top last chars:", top_end)
    # what follows っ / ょ
    for c in ["っ", "ょ", "ん"]:
        row = N[stoi[c]]
        tops = [(chars[i], int(row[i])) for i in row.argsort(descending=True)[:5]]
        print(f"after {c}:", tops)
    print("samples:", sample_bigram(P, chars, 15, seed=1))

    print("\n== neural bigram (logit table = Embedding(V, V)) ==")
    xs, ys = bigram_pairs(train, stoi)
    xv, yv = bigram_pairs(val, stoi)
    t0 = time.time()
    nb = train_model(nn.Sequential(nn.Embedding(V, V), nn.Flatten(0, 0)), xs, ys,
                     steps=400, lr=0.5, log_at=(1, 50, 100, 200, 400))
    print(f"  trained in {time.time() - t0:.1f}s (full batch, {len(xs)} pairs)")
    print(f"train nll {model_nll(nb, xs, ys):.4f} | val nll {model_nll(nb, xv, yv):.4f}")
    with torch.no_grad():
        Pn = F.softmax(nb[0].weight, dim=1)
    counting_P_nosmooth = None
    Nn, _ = counting_bigram(train, stoi, V, smooth=0)
    Pc = Nn / Nn.sum(1, keepdim=True).clamp(min=1)
    print(f"max |P_neural - P_counting| = {(Pn - Pc).abs().max().item():.4f}")
    print(f"mean |P_neural - P_counting| (rows with data) = "
          f"{(Pn - Pc).abs().mean().item():.6f}")

    print("\n== MLP LM, context sweep ==")
    results = {}
    for ctx in [1, 2, 3, 5]:
        xs, ys = context_dataset(train, stoi, ctx)
        xv, yv = context_dataset(val, stoi, ctx)
        torch.manual_seed(0)
        m = MLPLM(V, ctx)
        t0 = time.time()
        train_model(m, xs, ys, steps=3000, lr=3e-3, batch=256)
        tr, va = model_nll(m, xs, ys), model_nll(m, xv, yv)
        results[ctx] = (m, tr, va)
        print(f"ctx {ctx}: train {tr:.4f} | val {va:.4f} | {time.time() - t0:.1f}s")

    m3 = results[3][0]
    samples = sample_mlp(m3, chars, 3, 15, seed=1)
    print("MLP ctx=3 samples:", samples)
    train_set = set(train)
    novel = [s for s in samples if s not in train_set and s not in set(val)]
    print(f"novel: {len(novel)}/{len(samples)}")
    real = [s for s in samples if s in train_set or s in set(val)]
    print("verbatim copies:", real)


if __name__ == "__main__":
    main()
