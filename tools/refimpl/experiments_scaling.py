# Measured facts for scaling-appendix.qmd: train the SAME GPT recipe on the
# SAME data for the SAME number of steps, varying only model width (n_embd).
# Every number the appendix quotes comes from this script's output.
#
# Protocol: neko.txt, train/val = first 90% / last 10% (same as train_neko.py),
# batch 32, block 64, AdamW lr 1e-3, seed 42, 2,000 iters. Compute uses CUDA
# when the installed PyTorch build supports it, otherwise CPU (1 host thread).
# Artifacts -> data/runs/scaling/ (CSV, samples, and run metadata)
#
# Usage: python experiments_scaling.py [--device auto|cpu|cuda]

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn.functional as F

from gpt import GPT
from train_neko import eval_loss, get_batch, sample

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "data" / "runs" / "scaling"

WIDTHS = [12, 24, 48, 96, 192]   # n_embd; n_head=4, n_layer=2, block=64 fixed
ITERS = 2000
BATCH = 32
LR = 1e-3


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--iters", type=int, default=ITERS)
    parser.add_argument("--widths", type=int, nargs="+", default=WIDTHS)
    return parser.parse_args()


def select_device(requested):
    if requested == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if requested == "cuda" and not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA was requested, but this PyTorch installation cannot use it. "
            "Install a CUDA-enabled PyTorch build or use --device cpu."
        )
    return torch.device(requested)


def synchronize(device):
    if device.type == "cuda":
        torch.cuda.synchronize(device)


def main():
    args = parse_args()
    if args.iters <= 0:
        raise ValueError("--iters must be positive")
    if any(width <= 0 or width % 4 != 0 for width in args.widths):
        raise ValueError("every width must be positive and divisible by n_head=4")

    device = select_device(args.device)
    torch.set_num_threads(1)
    print(f"device: {device}", flush=True)
    if device.type == "cuda":
        print(f"gpu: {torch.cuda.get_device_name(device)}", flush=True)

    text = (ROOT / "data" / "neko.txt").read_text(encoding="utf-8")
    chars = sorted(set(text))
    stoi = {c: i for i, c in enumerate(chars)}
    data = torch.tensor([stoi[c] for c in text], dtype=torch.long)
    n = int(len(data) * 0.9)
    train_data, val_data = data[:n], data[n:]

    RUN.mkdir(parents=True, exist_ok=True)
    rows = []
    samples = []
    for width in args.widths:
        torch.manual_seed(42)
        cfg = dict(n_embd=width, n_head=4, n_layer=2, block_size=64)
        model = GPT(vocab_size=len(chars), **cfg).to(device)
        n_params = sum(p.numel() for p in model.parameters())
        opt = torch.optim.AdamW(model.parameters(), lr=LR)
        gen = torch.Generator().manual_seed(1)

        synchronize(device)
        t0 = time.time()
        best_val = float("inf")
        for it in range(1, args.iters + 1):
            x, y = get_batch(
                train_data, cfg["block_size"], BATCH, gen, device=device
            )
            opt.zero_grad()
            logits = model(x)
            loss = F.cross_entropy(logits.view(-1, logits.shape[-1]), y.view(-1))
            loss.backward()
            opt.step()
            if it % 500 == 0:
                va = eval_loss(model, val_data, cfg["block_size"],
                               torch.Generator().manual_seed(2))
                best_val = min(best_val, va)
                print(f"d={width:3d} iter {it:5d} | val {va:.4f}", flush=True)
        synchronize(device)
        total = time.time() - t0
        tr = eval_loss(model, train_data, cfg["block_size"],
                       torch.Generator().manual_seed(2))
        va = eval_loss(model, val_data, cfg["block_size"],
                       torch.Generator().manual_seed(2))
        ms = total / args.iters * 1000
        rows.append((width, n_params, round(tr, 4), round(va, 4),
                     round(best_val, 4), round(ms), round(total, 1)))
        print(f"d={width:3d} params {n_params:8,d} | train {tr:.4f} | "
              f"val {va:.4f} | {ms:.0f} ms/iter", flush=True)
        samples.append((width, n_params,
                        sample(model, chars, n_chars=80, seed=0,
                               temperature=0.8, top_k=40, prompt="吾輩は")))

    with open(RUN / "scaling.csv", "w", encoding="utf-8") as f:
        f.write("n_embd,params,train_loss,val_loss,best_val_loss,ms_per_iter,total_sec\n")
        for r in rows:
            f.write(",".join(map(str, r)) + "\n")
    with open(RUN / "scaling_samples.txt", "w", encoding="utf-8") as f:
        for i, (width, n_params, s) in enumerate(samples):
            separator = "\n\n" if i < len(samples) - 1 else "\n"
            f.write(
                f"===== n_embd {width} ({n_params:,} params) =====\n吾輩は{s}"
                f"{separator}"
            )
    metadata = {
        "requested_device": args.device,
        "device": device.type,
        "gpu": torch.cuda.get_device_name(device) if device.type == "cuda" else None,
        "torch": torch.__version__,
        "torch_cuda": torch.version.cuda,
        "iters": args.iters,
        "widths": args.widths,
        "batch": BATCH,
        "lr": LR,
        "seed": 42,
    }
    (RUN / "scaling_meta.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"artifacts -> {RUN}")


if __name__ == "__main__":
    main()
