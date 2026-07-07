# CLAUDE.md

## Project Overview

Quarto-based lecture website ("LLM Lectures"). Sequel to the sibling `ai` course: students who built an MNIST classifier from scratch now build a small GPT from scratch. Slide decks in Japanese.

**Read [doc/course-arc.md](doc/course-arc.md) before writing or restructuring any lecture** — it holds the course-wide narrative (文豪テスト cold open, two-trunk structure, per-lecture specs) and the list of measured facts every observation callout must be based on.

## Tech Stack

Identical to the sibling `ai` repo: Quarto website, vendored **cleanslidekit-revealjs** extension, Python 3 via Jupyter kernel, MathJax, **D2** diagrams, `lightbox`. Conda env is `llm` (`environment.yml`; same packages as `ai`).

## Conventions

**All conventions of `../ai/CLAUDE.md` apply verbatim.** In particular: `##` delimits slides; no numbers in slide headers or index links; bullet points not prose (except 演習 statements in 命令形＋体言止め steps); every echoed cell self-contained; `print(...)` not bare expressions; data files read by student code need a download link in the slide body; never fabricate figure data; `eval: false` 解答例 must be run manually before shipping; EN co-notation via `[…]{.en}` at first appearance; `==…==` highlight; one slide = one idea; Tweak / 練習問題 devices; identity scrub (never expose the school name — use 七夕 / example.com in examples).

Course-specific additions:

- **Every numeric or behavioral claim in an observation callout must come from a measured run** of the reference implementation (`tools/refimpl/`). Measured facts live in [doc/course-arc.md](doc/course-arc.md) §実測ログ. Re-measure before changing model sizes in a deck.
- **Committed data**: `data/chimei.csv` (municipality-name readings) and `data/neko.txt` (cleaned 吾輩は猫である) are the two course corpora. Regeneration scripts are in `tools/`; do not edit the CSVs by hand.
- Heavier artifacts (training logs, checkpoints, generated samples) used by decks are committed under `data/runs/` as small CSV/TXT — decks load them in hidden cells and show the real training code in `code-fold` blocks (mnist-project pattern).
- Seeds: any cell whose output text is discussed on the slide must set an explicit seed (`torch.manual_seed`, `np.random.seed`, or `random.seed`).

## Build

```bash
quarto preview --port 4322   # local dev server (fixed port; ai uses 4321)
quarto render                # build to _site/
```

The user owns preview/builds; Claude may render for verification (same grant as the `ai` repo — activate env or set `QUARTO_PYTHON` + PATH per `~/docs` memory notes).

## Self-contained, reproducible builds

Same rules as `ai`: fresh clone + `conda env create -f environment.yml` + `quarto render` must work. `_extensions/` is committed; every build tool is declared in `environment.yml`.

## Deploy

Repo/site name not yet decided — no remote, no `_publish.yml` yet.

## Reference Docs

- **[doc/course-arc.md](doc/course-arc.md)** — course narrative, per-lecture specs, measured-facts log, open decisions
- **[doc/troubleshooting.md](doc/troubleshooting.md)** — CSS/JS layer gotchas (copied from `ai`)
- **[../ai/doc/engaging-lecture-design.md](../ai/doc/engaging-lecture-design.md)** — the lecture-design playbook both courses follow
