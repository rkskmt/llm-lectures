# Verifies the hand-calculation numbers and behavioural claims quoted in the
# attention decks. Run before editing those decks; every printed number is a
# fact the slides may quote.

import torch
import torch.nn.functional as F

from gpt import GPT, Head

print("== attention-intuition hand calc (3 tokens, 2-d) ==")
# 表で配る値。スコアが (2,1,1) になるよう逆算してある（手計算は整数の内積だけ）
K = torch.tensor([[1.0, 1.0], [1.0, 0.0], [0.0, 1.0]])
V = torch.tensor([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]])
q3 = torch.tensor([1.0, 1.0])
scores = K @ q3
print("scores:", scores.tolist())
w_simple = scores / scores.sum()
print("simple normalize:", w_simple.tolist(), "-> context", (w_simple @ V).tolist())
w_soft = F.softmax(scores, dim=0)
print("softmax:", [round(x, 4) for x in w_soft.tolist()],
      "-> context", [round(x, 4) for x in (w_soft @ V).tolist()])
w_scaled = F.softmax(scores / torch.tensor(2.0).sqrt(), dim=0)
print("scaled softmax:", [round(x, 4) for x in w_scaled.tolist()],
      "-> context", [round(x, 4) for x in (w_scaled @ V).tolist()])

print("\n== essence-slide numbers (self-containedness pass) ==")
# dot product as similarity (attention-intuition #peek-dot)
for a, b in [((1., 1.), (2., 2.)), ((1., 1.), (1., -1.)), ((1., 1.), (-1., -1.))]:
    print(f"dot {a}·{b} = {torch.tensor(a) @ torch.tensor(b):.0f}")
# softmax worked example (bigram-neural #peek-softmax)
s = torch.tensor([2.0, 1.0, -1.0])
print("softmax(2, 1, -1) =", [round(x, 3) for x in F.softmax(s, dim=0).tolist()],
      "sum =", round(F.softmax(s, dim=0).sum().item(), 6))
# cross-entropy worked example (bigram-neural #peek-xent)
for p in [0.9, 0.5, 0.01, 1 / 75]:
    print(f"-log({p:.4f}) = {-torch.log(torch.tensor(p)).item():.4f}")
# autograd 3-line demo (bigram-neural #peek-autograd)
x = torch.tensor(3.0, requires_grad=True)
y = x ** 2
y.backward()
print("d(x^2)/dx at x=3 ->", x.grad.item())

print("\n== why not x@x.T (attention-qkv motivation slide) ==")
X = torch.tensor([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]])
S = X @ X.T
print("X @ X.T =", S.tolist(), "(symmetric)")
W = F.softmax(S / torch.tensor(2.0).sqrt(), dim=1)
print("row-softmax(/sqrt(2)):")
for row in W:
    print("  ", [round(v, 3) for v in row.tolist()])

print("\n== shuffle invariance without positions ==")
torch.manual_seed(0)
head = Head(n_embd=8, head_size=4, block_size=16)
x = torch.randn(1, 5, 8)              # 5 tokens, no position info anywhere
out = head(x)
perm = torch.tensor([3, 1, 2, 0, 4])  # shuffle the first four, keep last in place
out_p = head(x[:, perm])
diff = (out[0, -1] - out_p[0, -1]).abs().max().item()
print(f"last-token output diff after shuffling context: {diff:.2e}")
assert diff < 1e-6

print("\n== with pos_emb the same shuffle changes the prediction ==")
torch.manual_seed(0)
m = GPT(vocab_size=50, n_embd=16, n_head=2, n_layer=1, block_size=16)
idx = torch.tensor([[10, 20, 30, 40, 5]])
logits = m(idx)[0, -1]
logits_p = m(idx[:, perm])[0, -1]
print(f"last-token logit diff: {(logits - logits_p).abs().max().item():.3f}")
