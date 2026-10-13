#!/usr/bin/env python3
"""Weekly routine entry for the Grants & Contracts scan.

Copy to routines/grants-scan/run.py in the assistant's working folder (the
routine runner needs its entry inside ./routines/<slug>/). It runs the shared
scanner from the linked grants/ folder, writing runs/ and state/ next to
itself, so manual and scheduled scans share one seen-ledger.
"""
import runpy
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
scanner = here.parents[1] / "grants" / "tools" / "scan.py"
if not scanner.is_file():
    sys.exit(f"scanner not found at {scanner}; is grants/ linked into the working folder?")
sys.argv = [str(scanner), "--state", str(here / "state"), "--out", str(here / "runs")] + sys.argv[1:]
runpy.run_path(str(scanner), run_name="__main__")
