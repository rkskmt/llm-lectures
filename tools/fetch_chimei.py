#!/usr/bin/env python3
"""Build data/chimei.csv — hiragana readings of all Japanese municipality names.

Source: 総務省「全国地方公共団体コード」(政府標準利用規約 — CC BY compatible).
The xlsx is parsed with the stdlib only (zipfile + ElementTree) so this tool
needs no extra dependency. Sheet 1 lists prefectures (no 市区町村名 cell) and
municipalities; kana readings are half-width katakana.

Output CSV columns: yomi,kanji  (e.g. "しぶやく,渋谷区")
Author-side tool — students receive the committed data/chimei.csv.
"""

import csv
import re
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

URL = "https://www.soumu.go.jp/main_content/000925835.xlsx"
OUT = Path(__file__).resolve().parent.parent / "data" / "chimei.csv"
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def kata_to_hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def main():
    tmp = OUT.parent / "_code.xlsx"
    if len(sys.argv) > 1:              # already-downloaded xlsx
        tmp = Path(sys.argv[1])
    else:
        # curl, not urllib: soumu.go.jp resets connections from Python's TLS stack
        subprocess.run(["curl", "-sfL", "--max-time", "60", "-o", str(tmp), URL], check=True)
    z = zipfile.ZipFile(tmp)

    ss = ET.fromstring(z.read("xl/sharedStrings.xml"))
    strings = ["".join(t.text or "" for t in si.iter(M + "t")) for si in ss]
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    rows = []
    for row in sheet.iter(M + "row"):
        vals = {}
        for c in row.iter(M + "c"):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            v = c.find(M + "v")
            if v is None:
                continue
            vals[col] = strings[int(v.text)] if c.get("t") == "s" else v.text
        if "C" not in vals:            # prefecture-only row
            continue
        if not re.fullmatch(r"\d{6}", vals.get("A", "")):   # header row
            continue
        kanji, kana_raw = vals["C"], vals["E"]
        yomi = kata_to_hira(unicodedata.normalize("NFKC", kana_raw))
        if not re.fullmatch(r"[ぁ-ゖー]+", yomi):
            raise ValueError(f"non-hiragana reading: {kanji} / {yomi}")
        rows.append((yomi, kanji))
    tmp.unlink()

    if not 1500 < len(rows) < 2000:
        raise ValueError(f"unexpected municipality count: {len(rows)}")
    rows.sort()
    OUT.parent.mkdir(exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["yomi", "kanji"])
        w.writerows(rows)
    print(f"{len(rows)} municipalities -> {OUT}")


if __name__ == "__main__":
    main()
