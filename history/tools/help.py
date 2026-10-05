#!/usr/bin/env python3
"""Every History Writer tool's usage, in one call (2026-10-04).

A fresh thread used to spend its first minutes reading each tool's source to learn its
commands: the second story's run opened with a shell loop over every tool, then file reads.
This prints each tool's own docstring, so the usage is always the code's, never a copy.

    python3 history/tools/help.py            every tool
    python3 history/tools/help.py cite maps  just these
"""
import ast
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKIP = {"help.py", "test_tools.py", "_hw.py"}


def tools():
    return sorted(f for f in os.listdir(HERE) if f.endswith(".py") and f not in SKIP)


def main(argv):
    wanted = {a if a.endswith(".py") else a + ".py" for a in argv[1:]}
    for name in tools():
        if wanted and name not in wanted:
            continue
        with open(os.path.join(HERE, name), encoding="utf-8") as fh:
            doc = ast.get_docstring(ast.parse(fh.read())) or "(no usage written)"
        print(f"=== {name}\n{doc.strip()}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
