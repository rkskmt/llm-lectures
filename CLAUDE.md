# CLAUDE.md

This repository is public. Keep this file and `doc/` to rules and their technical reasons; leave out dates, history, who decided, and anything specific to one author's machine or tools.

## Project Overview

Quarto-based lecture website ("LLM Lectures"). Sequel to the [ai-lectures](https://github.com/rkskmt/ai-lectures) course: students who built an MNIST classifier from scratch now build a small GPT from scratch. Slide decks in Japanese.

**Read [doc/course-arc.md](doc/course-arc.md) before writing or restructuring any lecture** — it holds the course-wide narrative (文豪テスト cold open, two-trunk structure, per-lecture specs) and the list of measured facts every observation callout must be based on.

## Tech Stack

Identical to `ai-lectures`: Quarto website, vendored **cleanslidekit-revealjs** extension, Python 3 via Jupyter kernel, MathJax, **D2** diagrams, Quarto's built-in lightbox (no extension). Conda env is `llm` (`environment.yml`; same packages as `ai-lectures`).

## Conventions

**All conventions of [ai-lectures' CLAUDE.md](https://github.com/rkskmt/ai-lectures/blob/develop/CLAUDE.md) apply verbatim.** In particular: `##` delimits slides; no numbers in slide headers or index links; bullet points not prose (except 演習 statements in 命令形＋体言止め steps); every echoed cell self-contained; `print(...)` not bare expressions; data files read by student code need a download link in the slide body; never fabricate figure data; `eval: false` 解答例 must be run manually before shipping; EN co-notation via `[…]{.en}` at first appearance; `==…==` highlight; figure sizing via `#| classes: fig-small`/`fig-medium` or the `.fig` wrapper, never `out-width` (theme CSS overrides it); one slide = one idea; Tweak / 練習問題 devices; identity scrub (never expose the school name — use 七夕 / example.com in examples).

Theme classes and their attributes (`.table-style`, `.table-compact`, `.fig`, `.peek`, badges, …) are catalogued in `_extensions/rkskmt/cleanslidekit/_schema.yml`, shipped inside the vendored theme; read it before proposing or writing layout markup instead of guessing class names.

Course-specific additions:

- **Every numeric or behavioral claim in an observation callout must come from a measured run** of the reference implementation (`tools/refimpl/`). Measured facts live in [doc/course-arc.md](doc/course-arc.md) §実測ログ. Re-measure before changing model sizes in a deck.
- **Committed data**: `data/chimei.csv` (municipality-name readings) and `data/neko.txt` (cleaned 吾輩は猫である) are the two course corpora. Regeneration scripts are in `tools/`; do not edit the CSVs by hand.
- Heavier artifacts (training logs, checkpoints, generated samples) used by decks are committed under `data/runs/` as small CSV/TXT — decks load them in hidden cells and show the real training code in `code-fold` blocks (mnist-project pattern).
- Seeds: any cell whose output text is discussed on the slide must set an explicit seed (`torch.manual_seed`, `np.random.seed`, or `random.seed`).

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
