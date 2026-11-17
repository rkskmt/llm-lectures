# Runs a deck's Python cells once, in slide order, and saves the output of
# its frozen cells, so that rendering the deck never trains or samples.
#
# A frozen cell is a cell that trains, samples or draws from a trained model.
# It carries
#
#     #| eval: false
#     #| label: frz-<name>
#
# Quarto shows its code (if echo: true) but does not run it. The deck shows
# the saved output instead:
#   - printed text: a hidden cell right after it, marked `# frozen display`,
#     runs `print(frozen["frz-<name>"], end="")` (`frozen` is loaded by a
#     hidden `# frozen display` cell near the top of the deck);
#   - figures: an image `<OUT>/<deck>-frz-<name>-<n>.png` placed after it.
#
# This script runs every cell Quarto would run plus the frozen ones, in order
# and in one namespace, exactly as a student who copies the slides top to
# bottom would, and writes
#
#     <OUT>/<deck>.json              {label: printed text}
#     <OUT>/<deck>-<label>-<n>.png   figures drawn by frozen cells
#     <OUT>/<deck>.npz               arrays named in ARRAYS below (if any)
#
# Cells marked `# frozen display` are skipped (they read these files), and so
# are other `eval: false` cells (解答例, take-home code), as at render.
#
# Usage (repo root): python tools/freeze_cells.py <deck>.qmd
# Rerun it for a deck whenever a frozen cell, or a cell before one, changes;
# then check the slide text against the new output.

import contextlib
import io
import json
import os
import re
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = Path("data/runs/frozen")   # relative to ROOT; the deck refers to it the same way

# Arrays a deck's hidden display cells need from the run's namespace:
# {deck: {name: function(namespace) -> array}}.
ARRAYS = {
    "embeddings": {"emb_weight": lambda ns: ns["model"][0].weight.detach().numpy()},
}

MARKER = "# frozen display"


def cells(path):
    """Yield (options, source) for every ```{python} cell of a qmd."""
    lines = path.read_text(encoding="utf-8").split("\n")
    i = 0
    while i < len(lines):
        if re.match(r"^```\{python\}\s*$", lines[i]):
            j = i + 1
            while lines[j] != "```":
                j += 1
            body = lines[i + 1:j]
            opts = {}
            for line in body:
                m = re.match(r"^#\|\s*([\w-]+):\s*(.*?)\s*$", line)
                if m:
                    opts[m.group(1)] = m.group(2).strip('"')
            yield opts, "\n".join(body)
            i = j
        i += 1


def freeze(deck):
    path = ROOT / deck
    stem = path.stem
    (ROOT / OUT).mkdir(parents=True, exist_ok=True)
    ns = {"__name__": "__main__"}
    texts = {}
    current = {"label": None, "n": 0}

    def show(*args, **kwargs):
        if current["label"]:
            for num in plt.get_fignums():
                current["n"] += 1
                png = ROOT / OUT / f"{stem}-{current['label']}-{current['n']}.png"
                plt.figure(num).savefig(png, dpi=plt.rcParams["figure.dpi"], bbox_inches="tight")
                print(f"wrote {png.relative_to(ROOT)}", file=sys.stderr)
        plt.close("all")

    plt.show = show
    for opts, src in cells(path):
        label = opts.get("label", "")
        frozen_cell = opts.get("eval") == "false" and label.startswith("frz-")
        if (opts.get("eval") == "false" and not frozen_cell) or MARKER in src:
            continue
        current.update(label=label if frozen_cell else None, n=0)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            exec(compile(src, f"{deck}:{label or 'cell'}", "exec"), ns)
        plt.show()
        if frozen_cell:
            if label in texts:
                raise ValueError(f"{deck}: label {label} used twice")
            texts[label] = buf.getvalue()
            print(f"--- {label}\n{buf.getvalue()}", end="")
    if not texts:
        raise ValueError(f"{deck}: no frz- cell")
    (ROOT / OUT / f"{stem}.json").write_text(json.dumps(texts, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    arrays = {name: f(ns) for name, f in ARRAYS.get(stem, {}).items()}
    if arrays:
        np.savez_compressed(ROOT / OUT / f"{stem}.npz", **arrays)
    print(f"wrote {OUT.as_posix()}/{stem}.json" + (" and .npz" if arrays else ""))


if __name__ == "__main__":
    # One deck per process: a deck renders in a fresh kernel, and torch/numpy
    # global RNG state or imported modules must not carry over from another deck.
    if len(sys.argv) != 2:
        sys.exit("usage: python tools/freeze_cells.py <deck>.qmd")
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    freeze(sys.argv[1])
