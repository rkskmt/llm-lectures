# CLAUDE.md

This repository is public. Keep this file and `doc/` to rules and their technical reasons; leave out dates, history, who decided, and anything specific to one author's machine or tools.

## Project Overview

Quarto-based lecture website ("LLM Lectures"). Sequel to the [ai-lectures](https://github.com/rkskmt/ai-lectures) course: students who built an MNIST classifier from scratch now build a small GPT from scratch. Slide decks in Japanese.

**Read [doc/course-arc.md](doc/course-arc.md) before writing or restructuring any lecture** — it holds the course-wide narrative (文豪テスト cold open, two-trunk structure, per-lecture specs) and the list of measured facts every observation callout must be based on.

## Tech Stack

Identical to `ai-lectures`: Quarto website, vendored **cleanslidekit-revealjs** extension, Python 3 via Jupyter kernel, MathJax, **D2** diagrams, Quarto's built-in lightbox (no extension). Conda env is `llm` (`environment.yml`; same packages as `ai-lectures`).

## Conventions

**All conventions of [ai-lectures' CLAUDE.md](https://github.com/rkskmt/ai-lectures/blob/develop/CLAUDE.md) apply verbatim.** In particular: `##` delimits slides; no numbers in slide headers or index links; consider bullet points when parallel items would read better as a list (it depends on the slide); 演習 statements in 命令形＋体言止め steps; student-visible code runs when copied in slide order into one script (never relying on hidden cells); `print(...)` not bare expressions; data files read by student code need a download link in the slide body; never fabricate figure data; `eval: false` 解答例 must be run manually before shipping; EN co-notation via `[…]{.en}` at first appearance; `==…==` highlight; figure sizing via `#| classes: fig-small`/`fig-medium` or the `.fig` wrapper, never `out-width` (theme CSS overrides it); one slide = one idea; Tweak / 練習問題 devices; identity scrub (never expose the school name — use 七夕 / example.com in examples).

Theme classes and their attributes (`.table-style`, `.table-compact`, `.fig`, `.peek`, badges, …) are catalogued in `_extensions/rkskmt/cleanslidekit/_schema.yml`, shipped inside the vendored theme; read it before proposing or writing layout markup instead of guessing class names.

Course-specific additions:

- **Do not copy the output into the prose, and never state running times** (same rule as ai-lectures). The printed output and the figure already show the numbers and samples; prose that repeats them only creates text to re-check whenever the output changes. Write only what the output cannot say: the property it shows, or a prediction made before running. Running times (「約20分」「このPCで」「数秒」) depend on the machine: never write them.
- **Do not introduce an established term with 「〜を X と呼ぶ」** (same rule as ai-lectures' `doc/slide-tone-rules.md`). It reads as if the author were naming the thing on the spot. Put the term first and write what it is as a definition (`X：定義`).
   - Write out what 「この」「これ」 points to: 「隣り合う2文字の組を**バイグラム**と呼ぶ」→「**バイグラム**（[bigram]{.en}）：隣り合う2文字の組」. Swapping only the verb and keeping the pronoun (「これが X」) is not a fix.
   - The title of a slide that defines a term is the term itself (`## 過学習（[Overfitting]{.en}）`).
   - 「と呼ぶ」 stays when the question "who calls it that?" has an answer: the subject is written (「scikit-learn は SSE を `inertia_` と呼ぶ」), the sentence states common usage (「と呼ばれる」「と呼ぶことが多い」), the deck picks one of several existing names, or the author declares a way of seeing something (「この距離を、その点の**誤差**と呼ぼう」).
   - Finding candidates by search is fine; decide whether and how to rewrite each sentence from its context. No bulk replacement.
- **Numbers are mostly unnecessary** (same rule as ai-lectures' `doc/slide-tone-rules.md`). Do not use a count for emphasis (「1つの」「3本だけで」「たった2つ」). Write a number only when the number itself is the content (「語彙は75文字」「4部品を決まった順に組む」).
- **Do not write 「○○を××で△△させる」 or 「○○を、××で△△する」** (same rule as ai-lectures). What the sentence wants to say is usually △△ or ××: bring that to the front and write it short. Once it is in front, the comma after 「○○を」 is not needed either. Examples: 「勾配降下法という1つの探し方で、回帰も分類も NN も学習させる」→「回帰と分類と NN を勾配降下法で学習可能」; 「データに合う直線を、勾配降下法で求める」→「勾配降下法でデータに合う直線を求める」.
- **Every numeric or behavioral claim in an observation callout must come from a measured run** of the reference implementation (`tools/refimpl/`). Measured facts live in [doc/course-arc.md](doc/course-arc.md) §実測ログ. Re-measure before changing model sizes in a deck.
- **Committed data**: `data/chimei.csv` (municipality-name readings) and `data/neko.txt` (cleaned 吾輩は猫である) are the two course corpora. Regeneration scripts are in `tools/`; do not edit the CSVs by hand.
- Heavier artifacts (training logs, checkpoints, generated samples) used by decks are committed under `data/runs/` as small CSV/TXT — decks load them in hidden cells and show the real training code in `code-fold` blocks (mnist-project pattern).
- **Rendering never trains or samples.** A cell that trains, samples, or draws from a model trained in the deck is shown to the student as `#| eval: false` with `#| label: frz-<name>`; a hidden cell marked `# frozen display` after it prints the saved text, and a saved figure is placed after it as an image. `python tools/freeze_cells.py <deck>.qmd --write` (without `--write` it saves nothing and lists what would change) runs the deck's cells once in slide order, as a student copying the slides would, and writes `data/runs/frozen/<deck>.json` (printed text), `<deck>-frz-<name>-<n>.png` (figures) and `<deck>.npz` (arrays listed in the tool). Rerun it for a deck when a frozen cell or a cell before it changes, then check the slide text against the new output. Reason: a deploy renders the changed decks, and training at render made one deck take a minute.
- **Displayed figures are limited to 1920x1080 and 256 colors by `tools/fig_cap.py`.** Pixels beyond Full HD only add weight. matplotlib sets a size only through `figsize` x dpi, so the module replaces its PNG output and redraws a figure that is over the limit at a lower dpi (shrinking a finished PNG blurs it and makes the file larger). It loads at kernel start through `_environment` (`IPYTHONDIR=.ipython`) and `.ipython/profile_default/startup/`; decks need no code for it. `tools/freeze_cells.py` saves through the same limit and keeps the pixel size of an image that already exists, so a rerun does not change the slide.
- Seeds: a frozen cell still sets an explicit seed (`torch.manual_seed`, `np.random.seed`, or `random.seed`) in that cell, never once at the top of the deck: the seed lets the student's own run reproduce the slide, and random calls added in other cells cannot shift it. Seeds are taught content too (a Tweak changes one to show what moves).

## Build

```bash
quarto preview --port 4322   # local dev server (fixed port; ai-lectures uses 4321)
quarto render                # build to _site/
```

## Self-contained, reproducible builds

Same rules as `ai-lectures`: fresh clone + `conda env create -f environment.yml` (on Windows: `python setup.py`, which installs `d2` from its release) + `quarto render` must work. `_extensions/` is committed; every build tool is declared in `environment.yml`.

## Deploy

```bash
quarto publish gh-pages --id gh-pages --no-render --no-prompt
```

- Render only the changed decks; never re-render the whole site to deploy.

https://rkskmt.github.io/llm-lectures/

## Reference Docs

- **[doc/course-arc.md](doc/course-arc.md)** — course narrative, per-lecture specs, measured-facts log, open decisions
- **[doc/troubleshooting.md](doc/troubleshooting.md)** — CSS/JS layer gotchas (same as `ai-lectures`)
- **[ai-lectures: doc/engaging-lecture-design.md](https://github.com/rkskmt/ai-lectures/blob/develop/doc/engaging-lecture-design.md)** — the lecture-design playbook both courses follow
