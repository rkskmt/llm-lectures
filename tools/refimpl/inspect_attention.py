# Inspects the attention patterns of the trained checkpoint (ckpt_best.pt).
# Run before writing any deck text that describes what the trained heads look
# at: every claim about head behaviour must come from this script's output.
#
# Usage: python inspect_attention.py [--out DIR]
#   Prints per-head statistics and dumps labelled heatmaps (PNG) to DIR.

import argparse
from pathlib import Path

import japanize_matplotlib  # noqa: F401
import matplotlib.pyplot as plt
import torch
import torch.nn.functional as F

from gpt import GPT

ROOT = Path(__file__).resolve().parents[2]


def load_model():
    blob = torch.load(ROOT / "data" / "runs" / "neko" / "ckpt_best.pt",
                      weights_only=True)
    model = GPT(vocab_size=len(blob["vocab"]), **blob["cfg"])
    model.load_state_dict(blob["state_dict"])
    model.eval()
    chars = blob["vocab"]
    stoi = {c: i for i, c in enumerate(chars)}
    return model, chars, stoi


@torch.no_grad()
def attention_maps(model, idx):
    """Re-walk the forward pass, capturing each head's softmaxed weights.

    Returns maps[layer][head] = (T, T) tensor. Must mirror gpt.GPT.forward /
    gpt.Head.forward exactly (same ln placement, same scaling, same mask).
    """
    B, T = idx.shape
    x = model.tok_emb(idx) + model.pos_emb(torch.arange(T))
    maps = []
    for block in model.blocks:
        h_in = block.ln1(x)
        layer_maps = []
        for head in block.sa.heads:
            q, k = head.query(h_in), head.key(h_in)
            w = q @ k.transpose(-2, -1) / (k.shape[-1] ** 0.5)
            w = w.masked_fill(head.tril[:T, :T] == 0, float("-inf"))
            layer_maps.append(F.softmax(w, dim=-1)[0])
        maps.append(layer_maps)
        x = x + block.sa(h_in)
        x = x + block.ff(block.ln2(x))
    return maps


def head_stats(w):
    """Summary numbers for one head's (T, T) attention map."""
    T = w.shape[0]
    rows = torch.arange(T)
    self_mass = w[rows, rows].mean().item()
    prev_mass = w[rows[1:], rows[1:] - 1].mean().item()
    first_mass = w[:, 0].mean().item()
    # expected backward offset per query, averaged (skip t=0, trivially 0)
    offsets = []
    for t in range(1, T):
        pos = torch.arange(t + 1).float()
        offsets.append((w[t, :t + 1] * (t - pos)).sum().item())
    mean_offset = sum(offsets) / len(offsets)
    ent = -(w.clamp(min=1e-12).log() * w).sum(dim=-1)[1:].mean().item()
    max_ent = torch.log(torch.arange(2, T + 1).float()).mean().item()
    return self_mass, prev_mass, first_mass, mean_offset, ent, max_ent


def report(model, chars, stoi, text, tag, outdir, focus=()):
    idx = torch.tensor([[stoi[c] for c in text]])
    maps = attention_maps(model, idx)
    T = len(text)
    print(f"\n== probe [{tag}] ({T} chars): {text}")
    print("layer head | self   prev   first  mean_bk_offset  entropy(/max)")
    for li, layer in enumerate(maps):
        for hi, w in enumerate(layer):
            s, p, f0, off, ent, ment = head_stats(w)
            print(f"  L{li} H{hi}   | {s:.3f}  {p:.3f}  {f0:.3f}  "
                  f"{off:14.2f}  {ent:.2f}/{ment:.2f}")

    # top attended positions from the last char, a mid char, and any extras
    for t in dict.fromkeys([T - 1, T // 2, *focus]):
        print(f"  query at position {t} ('{text[t]}') — top-3 per head:")
        for li, layer in enumerate(maps):
            for hi, w in enumerate(layer):
                top = w[t].topk(3)
                cells = [f"'{text[j]}'@{j}:{v:.2f}"
                         for v, j in zip(top.values.tolist(), top.indices.tolist())]
                print(f"    L{li} H{hi}: " + "  ".join(cells))

    # labelled heatmap grid (readable up to ~30 chars)
    n_layer, n_head = len(maps), len(maps[0])
    fig, axes = plt.subplots(n_layer, n_head,
                             figsize=(4.2 * n_head, 4.4 * n_layer))
    for li in range(n_layer):
        for hi in range(n_head):
            ax = axes[li][hi]
            ax.imshow(maps[li][hi], cmap="Blues", vmin=0, vmax=1)
            ax.set_xticks(range(T)); ax.set_yticks(range(T))
            ax.set_xticklabels(list(text), fontsize=6)
            ax.set_yticklabels(list(text), fontsize=6)
            ax.set_title(f"layer {li} head {hi}", fontsize=10)
    fig.suptitle(f"attention maps — {tag}", fontsize=12)
    plt.tight_layout()
    path = outdir / f"attn_{tag}.png"
    fig.savefig(path, dpi=110)
    plt.close(fig)
    print(f"  heatmaps -> {path}")


def bertviz_html(model, stoi, text, path):
    """Interactive head view of the real maps (bertviz, html_action='return').

    Note: the generated HTML loads d3/jquery/require.js from cdnjs — viewing
    it needs internet access.
    """
    from bertviz import head_view

    idx = torch.tensor([[stoi[c] for c in text]])
    maps = attention_maps(model, idx)
    # bertviz expects one (B, n_head, T, T) tensor per layer
    attn = [torch.stack(layer).unsqueeze(0) for layer in maps]
    html = head_view(attn, list(text), html_action="return")
    path.write_text("<html><head><meta charset='utf-8'></head><body>"
                    + html.data + "</body></html>", encoding="utf-8")
    print(f"  bertviz -> {path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="attention_maps")
    args = ap.parse_args()
    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)

    torch.set_num_threads(1)
    model, chars, stoi = load_model()

    probes = {
        # opening line (verbatim; focus 12 = 「だ」 right before 「無」)
        "opening": ("吾輩は猫である。名前はまだ無い。", (12,)),
        # dialogue with quote brackets (verbatim in the corpus)
        "dialogue": ("「どっちの方角へ足が向くかね」と主人は真面目な顔をして、", ()),
    }
    text = (ROOT / "data" / "neko.txt").read_text(encoding="utf-8")
    for tag, (probe, focus) in probes.items():
        if probe not in text:
            raise ValueError(f"probe [{tag}] is not verbatim in the corpus")
        report(model, chars, stoi, probe, tag, outdir, focus)
        bertviz_html(model, stoi, probe, outdir / f"bertviz_{tag}.html")


if __name__ == "__main__":
    main()
