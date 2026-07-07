#!/usr/bin/env python3
"""
Setup script for LLM lectures development environment.

Usage:
    python setup.py          # Full setup (conda env + MathJax)
    python setup.py --mathjax-only   # Only download MathJax
"""

import subprocess
import sys
import shutil
import tarfile
import urllib.request
from pathlib import Path

ENV_NAME = "llm"
MATHJAX_VERSION = "2.7.9"
MATHJAX_URL = f"https://github.com/mathjax/MathJax/archive/refs/tags/{MATHJAX_VERSION}.tar.gz"

ROOT = Path(__file__).parent
ENV_FILE = ROOT / "environment.yml"
LIBS_DIR = ROOT / "libs"
MATHJAX_DIR = LIBS_DIR / "mathjax"
VSCODE_DIR = ROOT / ".vscode"


def run(cmd, check=True, capture=False):
    print(f"  $ {cmd}")
    return subprocess.run(cmd, shell=True, check=check, capture_output=capture, text=True)


def conda_env_exists(name):
    result = run("conda env list", capture=True)
    return any(line.split()[0] == name for line in result.stdout.splitlines() if line.strip())


def setup_conda_env():
    print(f"\n=== Conda environment: {ENV_NAME} ===")

    if conda_env_exists(ENV_NAME):
        print(f"  Updating environment '{ENV_NAME}' from {ENV_FILE.name}...")
        run(f"conda env update -f {ENV_FILE}")
    else:
        print(f"  Creating environment '{ENV_NAME}' from {ENV_FILE.name}...")
        run(f"conda env create -f {ENV_FILE}")

    setup_quarto_hook()


def setup_quarto_hook():
    print("\n=== QUARTO_PYTHON activate hook ===")

    result = run("conda info --base", capture=True)
    conda_base = Path(result.stdout.strip())
    activate_dir = conda_base / "envs" / ENV_NAME / "etc" / "conda" / "activate.d"
    hook_file = activate_dir / "quarto_python.sh"

    activate_dir.mkdir(parents=True, exist_ok=True)

    hook_content = '#!/bin/sh\nexport QUARTO_PYTHON="$CONDA_PREFIX/bin/python"\n'
    hook_file.write_text(hook_content)
    print(f"  Created {hook_file}")


def setup_vscode():
    print("\n=== VSCode settings ===")

    VSCODE_DIR.mkdir(exist_ok=True)
    settings_file = VSCODE_DIR / "settings.json"

    result = run("conda info --base", capture=True)
    conda_base = Path(result.stdout.strip())
    python_path = conda_base / "envs" / ENV_NAME / "bin" / "python"

    settings = f'''\
{{
    "python-envs.defaultEnvManager": "ms-python.python:conda",
    "python-envs.defaultPackageManager": "ms-python.python:conda",
    "python.defaultInterpreterPath": "{python_path}"
}}
'''
    settings_file.write_text(settings)
    print(f"  Created {settings_file}")


def setup_mathjax():
    print("\n=== MathJax (self-hosted) ===")

    if MATHJAX_DIR.exists():
        print(f"  {MATHJAX_DIR} already exists, skipping.")
        return

    LIBS_DIR.mkdir(exist_ok=True)
    tarball = LIBS_DIR / "mathjax.tar.gz"

    print(f"  Downloading MathJax {MATHJAX_VERSION}...")
    urllib.request.urlretrieve(MATHJAX_URL, tarball)

    print("  Extracting...")
    with tarfile.open(tarball, "r:gz") as tar:
        tar.extractall(LIBS_DIR)

    extracted = LIBS_DIR / f"MathJax-{MATHJAX_VERSION}"
    extracted.rename(MATHJAX_DIR)
    tarball.unlink()

    print(f"  Installed to {MATHJAX_DIR}")


def main():
    print("AI Lectures Setup")
    print("=" * 40)

    mathjax_only = "--mathjax-only" in sys.argv

    if not mathjax_only:
        setup_conda_env()
        setup_vscode()

    setup_mathjax()

    print("\n" + "=" * 40)
    print("Done!")
    if not mathjax_only:
        print(f"\nActivate the environment with:")
        print(f"  conda activate {ENV_NAME}")
    print(f"\nStart the dev server with:")
    print(f"  quarto preview --port 4321")


if __name__ == "__main__":
    main()
