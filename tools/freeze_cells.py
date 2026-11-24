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
#     It is saved through fig_cap.py (Full HD, 256 colors). A figure that
#     already has an image keeps that pixel size, so the slide does not change.
#
# This script runs every cell Quarto would run plus the frozen ones, in order
# and in one namespace, exactly as a student who copies the slides top to
# bottom would, compares the output with the saved files, and with --write
# saves
#
#     <OUT>/<deck>.json              {label: printed text}
#     <OUT>/<deck>-<label>-<n>.png   figures drawn by frozen cells
#     <OUT>/<deck>.npz               arrays named in ARRAYS below (if any)
#
# Cells marked `# frozen display` are skipped (they read these files), and so
# are other `eval: false` cells (解答例, take-home code), as at render.
#
# Usage (repo root):
#   python tools/freeze_cells.py <deck>.qmd          list what would change
#   python tools/freeze_cells.py <deck>.qmd --write  save the new output
# Save again for a deck whenever a frozen cell, or a cell before one, changes;
# then check the slide text against the new output.

import argparse
import contextlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import fig_cap  # noqa: E402  (same directory as this script)

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


def same_file(new, old):
    """Whether a file holds the same content, ignoring how it was encoded."""
    if new.suffix == ".png":
        a, b = Image.open(new).convert("RGBA"), Image.open(old).convert("RGBA")
        return a.size == b.size and a.tobytes() == b.tobytes()
    if new.suffix == ".npz":
        with np.load(new) as a, np.load(old) as b:
            return set(a.files) == set(b.files) and all(np.array_equal(a[k], b[k]) for k in a.files)
    return new.read_bytes() == old.read_bytes()


def report(staged, saved, names):
    """Print how each produced file compares with the saved one; return the differing ones."""
    differing = []
    for name in names:
        old = saved / name
        state = "new" if not old.exists() else "same" if same_file(staged / name, old) else "changed"
        if state != "same":
            differing.append(name)
        detail = ""
        if state == "changed" and name.endswith(".json"):
            before = json.loads(old.read_text(encoding="utf-8"))
            after = json.loads((staged / name).read_text(encoding="utf-8"))
            detail = "  (" + ", ".join(sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k))) + ")"
        print(f"{state:8}{(OUT / name).as_posix()}{detail}")
    return differing


def freeze(deck, write):
    path = ROOT / deck
    stem = path.stem
    saved = ROOT / OUT
    saved.mkdir(parents=True, exist_ok=True)
    ns = {"__name__": "__main__"}
    texts = {}
    current = {"label": None, "n": 0}
    produced = []

    with tempfile.TemporaryDirectory() as temp:
        staged = Path(temp)
        # The saved images come along so that fig_cap keeps their pixel size.
        for image in saved.glob(f"{stem}-frz-*.png"):
            shutil.copyfile(image, staged / image.name)

        def show(*args, **kwargs):
            if current["label"]:
                for num in plt.get_fignums():
                    current["n"] += 1
                    name = f"{stem}-{current['label']}-{current['n']}.png"
                    fig_cap.save_figure(plt.figure(num), staged / name)
                    produced.append(name)
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
        (staged / f"{stem}.json").write_text(json.dumps(texts, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        produced.append(f"{stem}.json")
        arrays = {name: f(ns) for name, f in ARRAYS.get(stem, {}).items()}
        if arrays:
            np.savez_compressed(staged / f"{stem}.npz", **arrays)
            produced.append(f"{stem}.npz")

        differing = report(staged, saved, produced)
        if write:
            for name in differing:
                shutil.copyfile(staged / name, saved / name)
            print(f"saved {len(differing)} file(s)")
        elif differing:
            print(f"nothing saved: add --write to save these {len(differing)} file(s)")
        else:
            print("nothing to save")


if __name__ == "__main__":
    # One deck per process: a deck renders in a fresh kernel, and torch/numpy
    # global RNG state or imported modules must not carry over from another deck.
    parser = argparse.ArgumentParser(description="Run a deck's frozen cells and compare or save their output.")
    parser.add_argument("deck", help="<deck>.qmd")
    parser.add_argument("--write", action="store_true", help="save the output; without it nothing is saved")
    args = parser.parse_args()
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    freeze(args.deck, args.write)
