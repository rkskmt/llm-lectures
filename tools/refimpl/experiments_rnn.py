# Measured facts for rnn-history-appendix.qmd. Every number the appendix
# quotes comes from this script's output.
#
# 1. Elman RNN character LM on the chimei corpus — same split/eval protocol as
#    experiments_chimei.py (per-name 90/10 split seed 42, mean NLL per
#    transition incl. boundary), so val is directly comparable with the logged
#    counting-bigram (2.6246) and MLP (ctx3 val 2.614) numbers.
# 2. Gradient bucket-brigade probe: loss at the LAST position only, then
#    ||d loss / d input-embedding|| per position — RNN vs trained GPT (ckpt_best).
#    T=64. The RNN is UNtrained (default init): the point is that the decay is
#    there before learning even starts, which is exactly why learning long-range
#    dependencies was hard. (Measured 2026-07-11: a TRAINED chimei RNN probed at
#    T=16 shows NO decay — names average 5.5 chars, so 16 steps is comfortably
#    inside its working range. Short horizons don't exhibit the disease.)
# 3. Wall-clock for one forward pass (sequential loop vs attention matmul),
#    1 thread, CPU — same guard as every timing quoted in this course.
#
# Artifacts -> data/runs/rnn/ (rnn.csv, rnn_grad.csv, rnn_samples.txt)
#
# Usage: python experiments_rnn.py

import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

from experiments_chimei import load_names, split
from gpt import GPT

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "data" / "runs" / "rnn"

WINDOW = 16
STEPS = 3000
BATCH = 256
LR = 3e-3


class ElmanRNN(nn.Module):
    """The simplest recurrent LM: one memory vector, carried left to right."""

    def __init__(self, V, n_embd=8, hidden=64):
        super().__init__()
        self.emb = nn.Embedding(V, n_embd)
        self.wx = nn.Linear(n_embd, hidden)
        self.wh = nn.Linear(hidden, hidden)
        self.out = nn.Linear(hidden, V)
        self.hidden = hidden

    def forward(self, x, return_emb=False):          # x: (B, T)
        e = self.emb(x)                              # (B, T, n_embd)
        if return_emb:
            e = e.detach().requires_grad_(True)
        h = torch.zeros(x.shape[0], self.hidden)
        logits = []
        for t in range(x.shape[1]):                  # one step per character
            h = torch.tanh(self.wx(e[:, t]) + self.wh(h))
            logits.append(self.out(h))
        logits = torch.stack(logits, dim=1)          # (B, T, V)
        return (logits, e) if return_emb else logits


def name_stream(names, stoi):
    ids = []
    for name in names:
        ids += [0] + [stoi[c] for c in name]
    ids.append(0)
    return torch.tensor(ids)


@torch.no_grad()
def rnn_name_nll(model, names, stoi):
    """Mean NLL per transition, fresh h per name — same counting as nll()."""
    total, count = 0.0, 0
    for name in names:
        seq = torch.tensor([[0] + [stoi[c] for c in name] + [0]])
        logits = model(seq[:, :-1])
        nll = F.cross_entropy(logits.view(-1, logits.shape[-1]),
                              seq[0, 1:], reduction="sum")
        total += nll.item()
        count += seq.shape[1] - 1
    return total / count


def sample_rnn(model, chars, stoi, n, seed):
    g = torch.Generator().manual_seed(seed)
    out = []
    while len(out) < n:
        h = torch.zeros(1, model.hidden)
        i, s = 0, ""
        while True:
            e = model.emb(torch.tensor([i]))
            h = torch.tanh(model.wx(e) + model.wh(h))
            p = F.softmax(model.out(h), dim=-1)
            i = torch.multinomial(p[0], 1, generator=g).item()
            if i == 0:
                break
            s += chars[i]
        if s:
            out.append(s)
    return out


def grad_profile_rnn(model, ids, T=64):
    x = ids[:T].unsqueeze(0)
    y = ids[1:T + 1]
    logits, e = model(x, return_emb=True)
    loss = F.cross_entropy(logits[0, -1:], y[-1:])   # last position only
    loss.backward()
    return e.grad[0].norm(dim=1).tolist()


def grad_profile_gpt(T=64):
    blob = torch.load(ROOT / "data" / "runs" / "neko" / "ckpt_best.pt",
                      weights_only=True)
    model = GPT(vocab_size=len(blob["vocab"]), **blob["cfg"])
    model.load_state_dict(blob["state_dict"])
    model.eval()
    stoi = {c: i for i, c in enumerate(blob["vocab"])}
    text = (ROOT / "data" / "neko.txt").read_text(encoding="utf-8")
    idx = torch.tensor([[stoi[c] for c in text[:T + 1]]])
    x, target = idx[:, :T], idx[0, T:T + 1]
    e = (model.tok_emb(x) + model.pos_emb(torch.arange(T))).detach().requires_grad_(True)
    out = model.head(model.ln_f(model.blocks(e)))
    loss = F.cross_entropy(out[0, -1:], target)
    loss.backward()
    return e.grad[0].norm(dim=1).tolist(), text[:T]


def main():
    torch.set_num_threads(1)
    names, chars, stoi = load_names()
    V = len(chars)
    train, val = split(names)
    stream = name_stream(train, stoi)

    torch.manual_seed(0)
    model = ElmanRNN(V)
    n_params = sum(p.numel() for p in model.parameters())
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    g = torch.Generator().manual_seed(0)

    t0 = time.time()
    val_curve = []
    for step in range(1, STEPS + 1):
        ix = torch.randint(len(stream) - WINDOW - 1, (BATCH,), generator=g)
        x = torch.stack([stream[i:i + WINDOW] for i in ix])
        y = torch.stack([stream[i + 1:i + WINDOW + 1] for i in ix])
        opt.zero_grad()
        logits = model(x)
        loss = F.cross_entropy(logits.view(-1, V), y.view(-1))
        loss.backward()
        opt.step()
        if step % 250 == 0:
            va = rnn_name_nll(model, val, stoi)
            val_curve.append((step, round(rnn_name_nll(model, train, stoi), 4),
                              round(va, 4)))
            print(f"step {step} | val name-nll {va:.4f}", flush=True)
    train_time = time.time() - t0

    tr_nll = rnn_name_nll(model, train, stoi)
    va_nll = rnn_name_nll(model, val, stoi)
    best_step, _, best_val = min(val_curve, key=lambda r: r[2])
    print(f"RNN ({n_params:,} params): train nll {tr_nll:.4f} | val nll {va_nll:.4f} "
          f"| val bottom {best_val:.4f} @ step {best_step} | {train_time:.1f}s",
          flush=True)

    samples = sample_rnn(model, chars, stoi, 15, seed=1)
    print("samples:", samples)

    # bucket-brigade probe over 64 steps: untrained plain RNN vs trained GPT
    neko_vocab = len(torch.load(ROOT / "data" / "runs" / "neko" / "ckpt_best.pt",
                                weights_only=True)["vocab"])
    torch.manual_seed(0)
    fresh = ElmanRNN(neko_vocab, n_embd=32, hidden=64)
    text = (ROOT / "data" / "neko.txt").read_text(encoding="utf-8")
    blob_stoi = {c: i for i, c in enumerate(
        torch.load(ROOT / "data" / "runs" / "neko" / "ckpt_best.pt",
                   weights_only=True)["vocab"])}
    probe_ids = torch.tensor([blob_stoi[c] for c in text[:65]])
    gr_rnn = grad_profile_rnn(fresh, probe_ids, T=64)
    gr_gpt, _ = grad_profile_gpt(T=64)
    print("RNN grad pos 0/16/32/48/63:",
          [f"{gr_rnn[t]:.2e}" for t in (0, 16, 32, 48, 63)])
    print("GPT grad pos 0/16/32/48/63:",
          [f"{gr_gpt[t]:.2e}" for t in (0, 16, 32, 48, 63)])
    print(f"RNN pos0/pos63 ratio: {gr_rnn[0] / gr_rnn[63]:.2e}")
    print(f"GPT pos0/pos63 ratio: {gr_gpt[0] / gr_gpt[63]:.2e}")

    # sequential vs parallel forward, (32, 64) batch, 1 thread
    blob = torch.load(ROOT / "data" / "runs" / "neko" / "ckpt_best.pt",
                      weights_only=True)
    gpt = GPT(vocab_size=len(blob["vocab"]), **blob["cfg"])
    gpt.load_state_dict(blob["state_dict"])
    gpt.eval()
    big_rnn = ElmanRNN(len(blob["vocab"]), n_embd=96, hidden=96)  # width-matched
    xb = torch.randint(0, len(blob["vocab"]), (32, 64))
    with torch.no_grad():
        for _ in range(3):                         # warmup
            big_rnn(xb); gpt(xb)
        t0 = time.time()
        for _ in range(20):
            big_rnn(xb)
        t_rnn = (time.time() - t0) / 20 * 1000
        t0 = time.time()
        for _ in range(20):
            gpt(xb)
        t_gpt = (time.time() - t0) / 20 * 1000
    print(f"forward (32,64): RNN {t_rnn:.1f} ms (64 sequential steps) | "
          f"GPT {t_gpt:.1f} ms (matmul, both layers)", flush=True)

    RUN.mkdir(parents=True, exist_ok=True)
    with open(RUN / "rnn.csv", "w", encoding="utf-8") as f:
        f.write("params,train_nll,val_nll,best_val_nll,best_step,train_sec,"
                "fwd_rnn_ms,fwd_gpt_ms\n")
        f.write(f"{n_params},{tr_nll:.4f},{va_nll:.4f},{best_val:.4f},{best_step},"
                f"{train_time:.1f},{t_rnn:.1f},{t_gpt:.1f}\n")
    with open(RUN / "rnn_val_curve.csv", "w", encoding="utf-8") as f:
        f.write("step,train_nll,val_nll\n")
        for r in val_curve:
            f.write(",".join(map(str, r)) + "\n")
    with open(RUN / "rnn_grad.csv", "w", encoding="utf-8") as f:
        f.write("position,rnn_grad_norm,gpt_grad_norm\n")
        for t in range(64):
            f.write(f"{t},{gr_rnn[t]:.6e},{gr_gpt[t]:.6e}\n")
    with open(RUN / "rnn_samples.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(samples) + "\n")
    print(f"artifacts -> {RUN}")


if __name__ == "__main__":
    main()
