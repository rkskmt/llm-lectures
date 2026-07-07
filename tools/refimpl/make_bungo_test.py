# Generates 文豪テスト candidate passages from the early-stopped checkpoint and
# checks each candidate's longest verbatim overlap with the corpus (must be
# short — the quiz is unfair if the model just regurgitates Soseki).
# Also probes memorization of the OVERFIT (10k) checkpoint for gpt-training.qmd.

from pathlib import Path

import torch

from gpt import GPT

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "data" / "runs" / "neko"


def load(tag):
    blob = torch.load(RUN / f"ckpt_{tag}.pt", weights_only=True)
    model = GPT(vocab_size=len(blob["vocab"]), **blob["cfg"])
    model.load_state_dict(blob["state_dict"])
    model.eval()
    return model, blob["vocab"]


def gen(model, vocab, prompt, n, temperature, top_k, seed):
    stoi = {c: i for i, c in enumerate(vocab)}
    torch.manual_seed(seed)
    idx = torch.tensor([[stoi[c] for c in prompt]])
    out = model.generate(idx, n, temperature=temperature, top_k=top_k)
    return "".join(vocab[i] for i in out[0].tolist())[len(prompt):]


def longest_overlap(s, corpus):
    lo, hi = 0, len(s)
    best = 0
    for L in range(8, len(s) + 1):
        found = any(s[i:i + L] in corpus for i in range(0, len(s) - L + 1, 3))
        if found:
            best = L
        else:
            break
    return best


def main():
    torch.set_num_threads(1)
    corpus = (ROOT / "data" / "neko.txt").read_text(encoding="utf-8")

    print("== best (early-stop) ckpt: 文豪テスト candidates ==")
    model, vocab = load("best")
    for seed in range(8):
        s = gen(model, vocab, "　", 120, temperature=0.8, top_k=40, seed=seed)
        s = s.replace("\n", "／")
        ov = longest_overlap(s, corpus)
        print(f"--- seed {seed} (overlap {ov}) ---\n{s}\n")

    print("== overfit (10k) ckpt: memorization probe ==")
    model10, vocab10 = load("main")
    probe = "吾輩は猫である。名前はまだ無い。"   # training-text prefix
    start = corpus.find(probe)
    print("original :", corpus[start:start + 80].replace("\n", "／"))
    cont = gen(model10, vocab10, probe, 70, temperature=0.5, top_k=5, seed=0)
    print("overfit  :", (probe + cont).replace("\n", "／"))
    contb = gen(model, vocab, probe, 70, temperature=0.5, top_k=5, seed=0)
    print("best     :", (probe + contb).replace("\n", "／"))


if __name__ == "__main__":
    main()
