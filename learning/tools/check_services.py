#!/usr/bin/env python3
"""Check learning/cloud-services.json against the LLM catalog: every role names an active model the
compute-proxy can route, every prompt file exists, and the quiz checker is a different provider family
from the quiz writer (one model must never grade its own questions). Exit 1 on any failure.

    python3 learning/tools/check_services.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
cfg = json.loads((ROOT / "learning/cloud-services.json").read_text())
problems = []
catalogs = {}
for name, role in cfg["roles"].items():
    provider, model = role.get("provider"), role.get("model")
    if provider not in catalogs:
        path = ROOT / f"llm-catalog/providers/{provider}.json"
        if not path.exists():
            problems.append(f"{name}: no catalog for provider {provider!r}")
            continue
        catalogs[provider] = {m.get("name"): m for m in json.loads(path.read_text()).get("models", [])}
    entry = catalogs.get(provider, {}).get(model)
    if not entry:
        problems.append(f"{name}: {provider}/{model} is not in llm-catalog/providers/{provider}.json")
    elif entry.get("status") != "active":
        problems.append(f"{name}: {provider}/{model} status is {entry.get('status')!r}, not active")
    if not (ROOT / role.get("prompt", "")).is_file():
        problems.append(f"{name}: prompt {role.get('prompt')!r} not found")
writer, checker = cfg["roles"].get("quizWriter", {}), cfg["roles"].get("quizChecker", {})
if writer.get("provider") == checker.get("provider"):
    problems.append("quizChecker must be a different provider family from quizWriter")
limits = cfg.get("limits", {})
if not 1 <= limits.get("defaultQuestions", 0) <= limits.get("maxQuestions", 0):
    problems.append("limits: defaultQuestions must be between 1 and maxQuestions")
if limits.get("minQuoteWords", 0) < 5:
    problems.append("limits: minQuoteWords below 5 lets a question quote almost nothing")
days = cfg.get("review", {}).get("boxDays", [])
if not days or days != sorted(days):
    problems.append("review.boxDays must be a rising list")
for p in problems:
    print("FAIL", p)
print("OK" if not problems else f"{len(problems)} problem(s)")
sys.exit(1 if problems else 0)
