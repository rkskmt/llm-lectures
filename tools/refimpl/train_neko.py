# Canonical training run on data/neko.txt. Produces the artifacts the decks
# read (data/runs/neko/): loss log, snapshot samples during training, final
# checkpoint, and longer generations for the 文豪テスト.
#
# torch.set_num_threads(1): on this hardware (WSL2 + conda-forge torch/OpenMP)
# more threads are strictly slower (1t 289ms/iter, 4t 688ms, 28t 3.5s — measured
# 2026-07-08). Single thread is also the most predictable across student machines,
# so 1 thread is what the course scripts use and what every quoted timing means.
#
# Usage: python train_neko.py [--iters N] [--tag NAME]

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn.functional as F

from gpt import GPT

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "data" / "runs" / "neko"

# model config quoted throughout the decks — change only together with course-arc.md
CFG = dict(n_embd=96, n_head=4, n_layer=2, block_size=64)
BATCH = 32
LR = 1e-3
EVAL_EVERY = 500
SNAPSHOT_AT = [0, 50, 200, 500, 1000, 2000, 5000, 10000]


def get_batch(data, block_size, batch_size, generator, device=None):
    ix = torch.randint(len(data) - block_size - 1, (batch_size,), generator=generator)
    x = torch.stack([data[i:i + block_size] for i in ix])
    y = torch.stack([data[i + 1:i + block_size + 1] for i in ix])
    if device is not None:
        x = x.to(device)
        y = y.to(device)
    return x, y


@torch.no_grad()
def eval_loss(model, data, block_size, generator, n_batches=10):
    model.eval()
    device = next(model.parameters()).device
    losses = []
    for _ in range(n_batches):
        x, y = get_batch(data, block_size, 32, generator, device=device)
        logits = model(x)
        losses.append(F.cross_entropy(logits.view(-1, logits.shape[-1]), y.view(-1)).item())
    model.train()
    return sum(losses) / len(losses)


def sample(model, itos, n_chars=150, seed=0, temperature=1.0, top_k=None, prompt="\n"):
    torch.manual_seed(seed)  # multinomial uses global rng
    stoi = {c: i for i, c in enumerate(itos)}
    device = next(model.parameters()).device
    idx = torch.tensor([[stoi[c] for c in prompt]], device=device)
    out = model.generate(idx, n_chars, temperature=temperature, top_k=top_k)
    return "".join(itos[i] for i in out[0].tolist())[len(prompt):]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--iters", type=int, default=5000)
    ap.add_argument("--tag", default="run")
    args = ap.parse_args()

    torch.set_num_threads(1)
    torch.manual_seed(42)

    text = (ROOT / "data" / "neko.txt").read_text(encoding="utf-8")
    chars = sorted(set(text))
    stoi = {c: i for i, c in enumerate(chars)}
    data = torch.tensor([stoi[c] for c in text], dtype=torch.long)
    n = int(len(data) * 0.9)
    train_data, val_data = data[:n], data[n:]
    print(f"corpus {len(data)} chars, vocab {len(chars)}, train {n}, val {len(data) - n}")

    model = GPT(vocab_size=len(chars), **CFG)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"params: {n_params:,}")
    opt = torch.optim.AdamW(model.parameters(), lr=LR)

    RUN.mkdir(parents=True, exist_ok=True)
    log_rows = []
    snaps = []
    gen = torch.Generator().manual_seed(1)
    eval_gen_seed = 2

    t0 = time.time()
    for it in range(args.iters + 1):
        if it in SNAPSHOT_AT:
            snaps.append((it, sample(model, chars, n_chars=120, seed=7)))
        if it % EVAL_EVERY == 0:
            tr = eval_loss(model, train_data, CFG["block_size"], torch.Generator().manual_seed(eval_gen_seed))
            va = eval_loss(model, val_data, CFG["block_size"], torch.Generator().manual_seed(eval_gen_seed))
            el = time.time() - t0
            log_rows.append((it, round(tr, 4), round(va, 4), round(el, 1)))
            print(f"iter {it:6d} | train {tr:.4f} | val {va:.4f} | {el:7.1f}s", flush=True)
        if it == args.iters:
            break
        x, y = get_batch(train_data, CFG["block_size"], BATCH, gen)
        opt.zero_grad()
        logits = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.shape[-1]), y.view(-1))
        loss.backward()
        opt.step()

    total = time.time() - t0
    print(f"total: {total:.1f}s for {args.iters} iters ({total / args.iters * 1000:.0f} ms/iter)")

    tag = args.tag
    with open(RUN / f"loss_{tag}.csv", "w", encoding="utf-8") as f:
        f.write("iter,train_loss,val_loss,elapsed_sec\n")
        for r in log_rows:
            f.write(",".join(map(str, r)) + "\n")
    with open(RUN / f"snapshots_{tag}.txt", "w", encoding="utf-8") as f:
        for it, s in snaps:
            f.write(f"===== iter {it} =====\n{s}\n\n")
    torch.save({"cfg": CFG, "vocab": "".join(chars),
                "state_dict": model.state_dict()}, RUN / f"ckpt_{tag}.pt")
    (RUN / f"meta_{tag}.json").write_text(json.dumps(
        {"iters": args.iters, "params": n_params, "total_sec": round(total, 1),
         "threads": 1, "batch": BATCH, "lr": LR, **CFG}, indent=1))
    print(f"artifacts -> {RUN}")


if __name__ == "__main__":
    main()
