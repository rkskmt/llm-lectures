#!/usr/bin/env python3
"""Build data/neko.txt — cleaned full text of 夏目漱石『吾輩は猫である』.

Source: Aozora Bunko (public domain). Strips the Aozora header/footer,
ruby (《…》 and ｜), and inline editorial annotations （［＃…］）.
Author-side tool — students receive the committed data/neko.txt.
"""

import io
import re
import subprocess
import zipfile
from pathlib import Path

URL = "https://www.aozora.gr.jp/cards/000148/files/789_ruby_5639.zip"
OUT = Path(__file__).resolve().parent.parent / "data" / "neko.txt"


def main():
    # curl, not urllib: some hosts reset connections from Python's TLS stack
    raw = subprocess.run(["curl", "-sfL", "--max-time", "60", URL],
                         check=True, capture_output=True).stdout
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        name = [n for n in zf.namelist() if n.endswith(".txt")][0]
        text = zf.read(name).decode("cp932")

    # header: everything up to the second ---- delimiter line
    parts = re.split(r"-{10,}\r?\n", text)
    if len(parts) < 3:
        raise ValueError("unexpected Aozora header format")
    body = parts[2]
    # footer: 底本 info block
    body = re.split(r"\r?\n底本：", body)[0]

    body = body.replace("｜", "")
    body = re.sub(r"《[^》]*》", "", body)      # ruby
    body = re.sub(r"［＃[^］]*］", "", body)    # editorial annotations
    body = body.replace("\r\n", "\n").strip() + "\n"

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(body, encoding="utf-8")
    print(f"{len(body)} chars, {len(set(body))} unique -> {OUT}")


if __name__ == "__main__":
    main()
