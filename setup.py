#!/usr/bin/env python3
"""
Setup script for LLM lectures development environment.

Usage:
    python setup.py          # Full setup (conda env + MathJax)
    python setup.py --mathjax-only   # Only download MathJax

Runs on Linux and Windows. On Windows, d2 comes from its official release
instead of conda-forge: the conda-forge package carries a symlink in its
license files, and conda cannot extract it without symlink privilege
(Developer Mode or admin), so `conda env create` would fail.
"""

import hashlib
import re
import subprocess
import sys
import shutil
import tarfile
import tempfile
import urllib.request
from pathlib import Path

ENV_NAME = "llm"
MATHJAX_VERSION = "2.7.9"
MATHJAX_URL = f"https://github.com/mathjax/MathJax/archive/refs/tags/{MATHJAX_VERSION}.tar.gz"

# Windows only (see module docstring)
D2_VERSION = "0.7.1"
D2_URL = f"https://github.com/terrastruct/d2/releases/download/v{D2_VERSION}/d2-v{D2_VERSION}-windows-amd64.tar.gz"
D2_SHA256 = "d289c2866221c618c9fc6efcd416ee8c16e122bd0100761aea51001e3c958f57"

WINDOWS = sys.platform == "win32"

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


def env_prefix():
    result = run("conda info --base", capture=True)
    return Path(result.stdout.strip()) / "envs" / ENV_NAME


def env_python():
    if WINDOWS:
        return env_prefix() / "python.exe"
    return env_prefix() / "bin" / "python"


def setup_conda_env():
    print(f"\n=== Conda environment: {ENV_NAME} ===")

    with tempfile.TemporaryDirectory() as tmp:
        env_file = ENV_FILE
        if WINDOWS:
            env_file = Path(tmp) / ENV_FILE.name
            write_env_file_without_d2(env_file)

        if conda_env_exists(ENV_NAME):
            print(f"  Updating environment '{ENV_NAME}' from {ENV_FILE.name}...")
            run(f'conda env update -f "{env_file}"')
        else:
            print(f"  Creating environment '{ENV_NAME}' from {ENV_FILE.name}...")
            run(f'conda env create -f "{env_file}"')

    if WINDOWS:
        install_d2_windows()

    setup_quarto_hook()


def write_env_file_without_d2(path):
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines(keepends=True)
    kept = [line for line in lines if not re.match(r"\s*-\s*d2(\s|#|$)", line)]
    if len(kept) != len(lines) - 1:
        raise RuntimeError(f"expected exactly one d2 dependency in {ENV_FILE.name}")
    path.write_text("".join(kept), encoding="utf-8")
    print(f"  (Windows) d2 left out of {ENV_FILE.name}; installed from its release below")


def install_d2_windows():
    print(f"\n=== d2 {D2_VERSION} (official release) ===")

    target = env_prefix() / "Library" / "bin" / "d2.exe"
    with tempfile.TemporaryDirectory() as tmp:
        tarball = Path(tmp) / "d2.tar.gz"
        print(f"  Downloading {D2_URL}")
        urllib.request.urlretrieve(D2_URL, tarball)
        digest = hashlib.sha256(tarball.read_bytes()).hexdigest()
        if digest != D2_SHA256:
            raise RuntimeError(f"d2 checksum mismatch: expected {D2_SHA256}, got {digest}")
        with tarfile.open(tarball, "r:gz") as tar:
            binary = tar.extractfile(f"d2-v{D2_VERSION}/bin/d2.exe").read()

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(binary)
    print(f"  Installed {target}")


def setup_quarto_hook():
    if WINDOWS:
        # Env vars stored in the env apply on every `conda activate` (any shell) and under `conda run`
        print("\n=== QUARTO_PYTHON env var ===")
        run(f'conda env config vars set -n {ENV_NAME} QUARTO_PYTHON="{env_python()}"')
        return

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

    python_path = env_python().as_posix()

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
    print("LLM Lectures Setup")
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
    print(f"  quarto preview --port 4322")


if __name__ == "__main__":
    main()
