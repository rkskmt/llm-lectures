# What structure do learned character embeddings actually show?
# (a) chimei MLP (d=8) -> PCA to 2D: nearest neighbours + scatter PNG
# (b) neko GPT tok_emb (d=96) -> PCA to 2D coloured by char class (needs ckpt)
# Never write an observation callout from intuition — eyeball these first.

import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import japanize_matplotlib  # noqa: F401
import matplotlib.pyplot as plt
import torch

from experiments_chimei import MLPLM, context_dataset, load_names, split, train_model

ROOT = Path(__file__).resolve().parents[2]
OUTDIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")


def pca2(X):
    X = X - X.mean(0)
    _, _, Vt = torch.linalg.svd(X, full_matrices=False)
    return X @ Vt[:2].T


def chimei():
    torch.set_num_threads(1)
    names, chars, stoi = load_names()
    train, val = split(names)
    xs, ys = context_dataset(train, stoi, 3)
    torch.manual_seed(0)
    m = MLPLM(len(chars), 3)
    train_model(m, xs, ys, steps=3000, lr=3e-3, batch=256)
    E = m.emb.weight.detach()
    P = pca2(E)

    # nearest neighbours in full 8-d space
    for probe in ["か", "き", "や", "ん", "っ", "ざ"]:
        d = (E - E[stoi[probe]]).norm(dim=1)
        nn = ["".join(chars[i]) for i in d.argsort()[1:5]]
        print(f"{probe}: {nn}")

    fig, ax = plt.subplots(figsize=(9, 9))
    ax.scatter(P[:, 0], P[:, 1], s=5, color="lightgray")
    for i, c in enumerate(chars):
        ax.annotate(c, (P[i, 0], P[i, 1]), fontsize=11)
    ax.set_title("chimei MLP embeddings (PCA)")
    fig.savefig(OUTDIR / "emb_chimei.png", dpi=110)
    print("wrote emb_chimei.png")


def neko():
    ck = ROOT / "data" / "runs" / "neko" / "ckpt_main.pt"
    if not ck.exists():
        print("no neko ckpt yet — skipping")
        return
    blob = torch.load(ck, weights_only=True)
    vocab = blob["vocab"]
    E = blob["state_dict"]["tok_emb.weight"]
    P = pca2(E)

    def klass(c):
        if "ぁ" <= c <= "ゖ":
            return "ひらがな"
        if "ァ" <= c <= "ヶ" or c == "ー":
            return "カタカナ"
        if "一" <= c <= "鿿":
            return "漢字"
        return "記号など"

    colors = {"ひらがな": "#e74c3c", "カタカナ": "#2980b9", "漢字": "#7f8c8d", "記号など": "#27ae60"}
    fig, ax = plt.subplots(figsize=(10, 10))
    for name, col in colors.items():
        idx = [i for i, c in enumerate(vocab) if klass(c) == name]
        ax.scatter(P[idx, 0], P[idx, 1], s=6, color=col, label=name, alpha=0.6)
    ax.legend()
    ax.set_title("neko GPT tok_emb (PCA), coloured by char class")
    fig.savefig(OUTDIR / "emb_neko.png", dpi=110)
    print("wrote emb_neko.png")

    # nearest neighbours for a few probes
    stoi = {c: i for i, c in enumerate(vocab)}
    for probe in ["猫", "犬", "「", "。", "一", "二", "は", "が"]:
        if probe not in stoi:
            continue
        d = (E - E[stoi[probe]]).norm(dim=1)
        nn = "".join(vocab[i] for i in d.argsort()[1:8])
        print(f"{probe}: {nn}")


if __name__ == "__main__":
    chimei()
    neko()
