# Runs when a deck's Jupyter kernel starts; see tools/fig_cap.py.
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import fig_cap  # noqa: E402,F401
sys.path.pop(0)
