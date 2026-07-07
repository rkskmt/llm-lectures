# Reference implementation of the course's final model: a character-level GPT.
# This file IS the pedagogical target — every class here corresponds 1:1 to a
# lecture (Head -> attention-qkv, position/mask -> position-mask, MultiHead/
# FeedForward/Block -> transformer-block, GPT/generate -> gpt-training/sampling).
# Keep it dumb and readable: no dropout, no GELU (course only teaches ReLU),
# no weight tying, per-head Linear modules instead of a fused qkv matmul.

import math

import torch
import torch.nn as nn
import torch.nn.functional as F


class Head(nn.Module):
    """One head of masked self-attention."""

    def __init__(self, n_embd, head_size, block_size):
        super().__init__()
        self.query = nn.Linear(n_embd, head_size, bias=False)
        self.key = nn.Linear(n_embd, head_size, bias=False)
        self.value = nn.Linear(n_embd, head_size, bias=False)
        self.register_buffer("tril", torch.tril(torch.ones(block_size, block_size)))

    def forward(self, x):
        B, T, C = x.shape
        q = self.query(x)                                    # (B, T, hs)
        k = self.key(x)                                      # (B, T, hs)
        w = q @ k.transpose(-2, -1) / math.sqrt(k.shape[-1])  # (B, T, T) 関連度
        w = w.masked_fill(self.tril[:T, :T] == 0, float("-inf"))  # 未来は見ない
        w = F.softmax(w, dim=-1)                             # 割合にする
        return w @ self.value(x)                             # 重み付き平均


class MultiHead(nn.Module):
    """Several heads in parallel, concatenated."""

    def __init__(self, n_embd, n_head, block_size):
        super().__init__()
        head_size = n_embd // n_head
        self.heads = nn.ModuleList(
            Head(n_embd, head_size, block_size) for _ in range(n_head))
        self.proj = nn.Linear(n_embd, n_embd)

    def forward(self, x):
        return self.proj(torch.cat([h(x) for h in self.heads], dim=-1))


class FeedForward(nn.Module):
    def __init__(self, n_embd):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_embd, 4 * n_embd), nn.ReLU(), nn.Linear(4 * n_embd, n_embd))

    def forward(self, x):
        return self.net(x)


class Block(nn.Module):
    def __init__(self, n_embd, n_head, block_size):
        super().__init__()
        self.sa = MultiHead(n_embd, n_head, block_size)
        self.ff = FeedForward(n_embd)
        self.ln1 = nn.LayerNorm(n_embd)
        self.ln2 = nn.LayerNorm(n_embd)

    def forward(self, x):
        x = x + self.sa(self.ln1(x))   # 残差接続
        x = x + self.ff(self.ln2(x))
        return x


class GPT(nn.Module):
    def __init__(self, vocab_size, n_embd, n_head, n_layer, block_size):
        super().__init__()
        self.block_size = block_size
        self.tok_emb = nn.Embedding(vocab_size, n_embd)
        self.pos_emb = nn.Embedding(block_size, n_embd)
        self.blocks = nn.Sequential(
            *[Block(n_embd, n_head, block_size) for _ in range(n_layer)])
        self.ln_f = nn.LayerNorm(n_embd)
        self.head = nn.Linear(n_embd, vocab_size)

    def forward(self, idx):
        B, T = idx.shape
        x = self.tok_emb(idx) + self.pos_emb(torch.arange(T, device=idx.device))
        x = self.blocks(x)
        return self.head(self.ln_f(x))   # (B, T, vocab) logits

    @torch.no_grad()
    def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):
        for _ in range(max_new_tokens):
            logits = self(idx[:, -self.block_size:])[:, -1, :]
            logits = logits / temperature
            if top_k is not None:
                v, _ = torch.topk(logits, top_k)
                logits[logits < v[:, [-1]]] = float("-inf")
            probs = F.softmax(logits, dim=-1)
            nxt = torch.multinomial(probs, num_samples=1)
            idx = torch.cat([idx, nxt], dim=1)
        return idx
