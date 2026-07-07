# One-off benchmark: where does a training iteration spend its time, and
# which knobs (threads, fused heads, vocab size, geometry) buy speed.

import time

import torch
import torch.nn as nn
import torch.nn.functional as F

from gpt import GPT


def bench(model, V, B, T, iters=8):
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3)
    x = torch.randint(V, (B, T))
    y = torch.randint(V, (B, T))
    # warmup
    for _ in range(2):
        opt.zero_grad()
        loss = F.cross_entropy(model(x).view(-1, V), y.view(-1))
        loss.backward()
        opt.step()
    t0 = time.time()
    for _ in range(iters):
        opt.zero_grad()
        loss = F.cross_entropy(model(x).view(-1, V), y.view(-1))
        loss.backward()
        opt.step()
    return (time.time() - t0) / iters * 1000


print(torch.__config__.parallel_info())

for threads in [4, 8]:
    torch.set_num_threads(threads)
    for V in [3045, 1500]:
        for cfg in [dict(n_embd=128, n_head=4, n_layer=2, block_size=64),
                    dict(n_embd=96, n_head=4, n_layer=2, block_size=64)]:
            m = GPT(vocab_size=V, **cfg)
            ms = bench(m, V, 32, cfg["block_size"])
            print(f"threads {threads} | vocab {V} | {cfg} -> {ms:.0f} ms/iter", flush=True)
