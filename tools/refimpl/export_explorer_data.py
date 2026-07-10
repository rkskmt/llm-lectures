# Exports precomputed activations of the trained checkpoint (ckpt_best.pt)
# for the interactive model explorer (explorer/index.html).
#
# For each preset sentence it walks the forward pass exactly like gpt.GPT
# and dumps every stage (embeddings, per-head q/k/v/attention, residuals,
# FFN, final logits top-k) as rounded floats.
#
# Usage: python export_explorer_data.py   -> writes ../../explorer/data_neko.js

from pathlib import Path
import json

import torch
import torch.nn.functional as F

from inspect_attention import load_model

ROOT = Path(__file__).resolve().parents[2]

PRESETS = [
    # verbatim corpus lines only (never fabricate)
    "吾輩は猫である。名前はまだ無い。",
    "「どっちの方角へ足が向くかね」と主人は真面目な顔をして、",
]


def r(t, nd=3):
    """Tensor -> nested lists rounded to nd decimals."""
    return [[round(float(v), nd) for v in row] for row in t]


@torch.no_grad()
def trace(model, chars, stoi, text):
    idx = torch.tensor([[stoi[c] for c in text]])
    T = idx.shape[1]
    te = model.tok_emb(idx)[0]
    pe = model.pos_emb(torch.arange(T))
    x = (te + pe).unsqueeze(0)

    blocks = []
    for block in model.blocks:
        h_in = block.ln1(x)
        heads = []
        for head in block.sa.heads:
            q, k, v = head.query(h_in), head.key(h_in), head.value(h_in)
            w = q @ k.transpose(-2, -1) / (k.shape[-1] ** 0.5)
            w = w.masked_fill(head.tril[:T, :T] == 0, float("-inf"))
            w = F.softmax(w, dim=-1)
            heads.append({
                "q": r(q[0]), "k": r(k[0]), "v": r(v[0]),
                "attn": r(w[0], 4), "out": r((w @ v)[0]),
            })
        sa_out = block.sa(h_in)
        res1 = x + sa_out
        ln2 = block.ln2(res1)
        ffn_out = block.ff(ln2)
        res2 = res1 + ffn_out
        blocks.append({
            "ln1": r(h_in[0]), "heads": heads, "sa_out": r(sa_out[0]),
            "res1": r(res1[0]), "ln2": r(ln2[0]), "ffn_out": r(ffn_out[0]),
            "res2": r(res2[0]),
        })
        x = res2

    ln_f = model.ln_f(x)
    logits = model.head(ln_f)[0]                      # (T, V)
    probs = F.softmax(logits, dim=-1)
    topp, topi = probs.topk(8, dim=-1)
    top = [[{"ch": chars[i], "p": round(float(p), 4)}
            for p, i in zip(prow.tolist(), irow.tolist())]
           for prow, irow in zip(topp, topi)]

    return {
        "text": text,
        "tokens": list(text),
        "ids": idx[0].tolist(),
        "tok_emb": r(te), "pos_emb": r(pe), "x0": r((te + pe)),
        "blocks": blocks,
        "ln_f": r(ln_f[0]),
        "top": top,
    }


def main():
    torch.set_num_threads(1)
    model, chars, stoi = load_model()
    cfg = {"n_embd": 96, "n_head": 4, "n_layer": 2, "head_size": 24,
           "vocab_size": len(chars)}
    data = {"cfg": cfg, "presets": [trace(model, chars, stoi, t) for t in PRESETS]}

    corpus = (ROOT / "data" / "neko.txt").read_text(encoding="utf-8")
    for p in PRESETS:
        if p not in corpus:
            raise ValueError(f"preset not verbatim in corpus: {p}")

    out = ROOT / "explorer" / "data_neko.js"
    out.parent.mkdir(exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    out.write_text("window.EXPLORER_DATA = " + payload + ";\n", encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
