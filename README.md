# LLM Lectures

「次の1文字を当てる」から小さなGPTの自作まで — Transformer・言語モデルに関するQuartoスライド。
[AI Lectures](https://rkskmt.github.io/ai-lectures/)（分類→勾配降下→NN→MNIST自作）の続編。

## セットアップ

### 必要なもの

- [Quarto](https://quarto.org/docs/get-started/) (>= 1.8)
- conda (Miniconda / Anaconda)

### ワンコマンドセットアップ

```bash
python setup.py
conda activate llm
```

`setup.py` が以下をまとめて行う：
- `environment.yml` に基づく conda 環境 `llm` の作成・更新
- `QUARTO_PYTHON` 自動設定の activate フック
- MathJax 2 のダウンロード（`libs/mathjax/`）

### ローカルプレビュー

```bash
quarto preview --port 4322
```

### ビルド・デプロイ

```bash
quarto render            # _site/ に出力
quarto publish gh-pages  # GitHub Pages へデプロイ（リポジトリ公開後）
```

## データ

- `data/chimei.csv` — 全国の市区町村名の「よみがな」。出典：地方公共団体情報システム機構の全国地方公共団体コード。再生成は `tools/fetch_chimei.py`
- `data/neko.txt` — 夏目漱石『吾輩は猫である』本文（青空文庫、ルビ・注記除去済み）。再生成は `tools/fetch_neko.py`
- `data/runs/` — 参照実装（`tools/refimpl/`）の学習ログ・生成サンプル。スライドはここを読む

## 参照実装

`tools/refimpl/` に講義全体の到達点である文字レベルGPT（PyTorch）一式がある。スライドに載せる数値・観察はすべてここでの実測に基づく（詳細は `doc/course-arc.md`）。
