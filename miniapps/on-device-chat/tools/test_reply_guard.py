#!/usr/bin/env python3
"""The template's reply guard (guardReply, shortenNames, assentTurn) on the money-check-in pack, in JavaScriptCore
(osascript), the engine of the app's web views.

    python3 tools/test_reply_guard.py

The cases are his iPhone's (11-16): the reply to "Yes" was the last reply again, after one new sentence. The app's Chat
applies the same rules in Swift (AgentCompanion.guarded); mChatAITests/AgentCompanionTests holds the same cases.
"""
import json, os, re, subprocess, sys, tempfile

here = os.path.dirname(os.path.abspath(__file__))
source_root = os.path.abspath(os.path.join(here, "..", "..", ".."))
html = open(os.path.join(here, "..", "index.html"), encoding="utf-8").read()
script = re.findall(r"<script>(.*?)</script>", html, flags=re.S)[-1]


def block(name_pattern):
    m = re.search(r"^(?:const|let|function)\s+" + name_pattern + r"\b.*?(?=^\s*$|^(?:const|let|function|async function|els\.|if\s*\(|window\.|document\.)\s)", script, flags=re.M | re.S)
    if not m:
        sys.exit(f"could not find {name_pattern} in the template")
    return m.group(0)


pack = json.load(open(os.path.join(source_root, "personas", "money-check-in", "persona.json")))
FIRST = ("Property investments often generate income through rent, and the property itself may increase in value over time. "
         "Diversification helps spread your money across investments so one loss hurts less. "
         "Would you like to learn more about how to manage your property investment?")
YES = ("Yes, let's learn more about how to manage your property investment. In the Money, Plainly handbook, you can start by "
       "keeping track of your income and expenses. This helps you understand how much money you have available for rent and other "
       "expenses. Diversification helps spread your money across investments so one loss hurts less. Would you like to learn more "
       "about how to manage your property investment?")
cases = [
    # (function, args, expected)
    ("guard", [YES, [FIRST]], "In the Money, Plainly handbook, you can start by keeping track of your income and expenses. "
                               "This helps you understand how much money you have available for rent and other expenses."),
    ("guard", ["Diversification helps spread your money across investments so one loss hurts less. Would you like to learn more "
               "about how to manage your property investment?", [FIRST]], pack["guard"]["repeated"]),
    ("guard", ["Diversification does not remove risk; it spreads it across many investments at once.", [FIRST]],
     "Diversification does not remove risk; it spreads it across many investments at once."),
    ("guard", [FIRST, []], FIRST),
    ("guard", ["You should buy an index fund. Fees add up over time.", []], "Fees add up over time."),
    # Asked for a repeat, the repeat stands.
    ("guard", ["An expense ratio is the yearly costs of a fund as a percentage of the money invested.",
               ["An expense ratio is the yearly costs of a fund as a percentage of the money invested. Would you like to talk about it?"],
               "Don't play the podcast, just tell me in one line."],
     "An expense ratio is the yearly costs of a fund as a percentage of the money invested."),
    ("guard", ["Listening to a podcast about buying gold might be a good starting point for exploring different investment options. "
               "What is your goal?", []], "What is your goal?"),
    ("short", ["The Money, Plainly handbook calls it an emergency fund. Money, Plainly says to start small.",
               ["In the Money, Plainly handbook, a budget is a plan for your money."]],
     "The handbook calls it an emergency fund. The handbook says to start small."),
    ("short", ["From the Money, Plainly handbook: interest is a fee. The Money, Plainly notes say more.", []],
     "From the Money, Plainly handbook: interest is a fee. The handbook notes say more."),
    ("short", ["In Money, Plainly, a fee is a cost.", ["In the Money, Plainly handbook, a budget is a plan."]],
     "In the handbook, a fee is a cost."),
    ("assent", ["Yes", [{"role": "user", "text": "Tell me about property"}, {"role": "assistant", "text": FIRST}]],
     "Would you like to learn more about how to manage your property investment?"),
    ("assent", ["Yes, I rent my place", [{"role": "assistant", "text": FIRST}]], None),
    ("assent", ["yes", [{"role": "assistant", "text": "Compound interest is interest on interest."}]], None),
]
js = "\n".join(block(n) for n in ("stemsOf", "sentencesIn", "lettersOf", "guardReply", "shortenNames", "assentTurn")) + """
var PACK = %s; var CASES = %s;
JSON.stringify(CASES.map(function (c) {
  if (c[0] === "guard") return guardReply(c[1][0], c[1][1], c[1][2]);
  if (c[0] === "short") return shortenNames(c[1][0], PACK.guard.shortNames, c[1][1]);
  var t = assentTurn(c[1][0], c[1][1]); return t ? t.query : null;
}));
""" % (json.dumps(pack), json.dumps(cases))
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
    f.write(js)
    path = f.name
try:
    out = subprocess.run(["osascript", "-l", "JavaScript", path], capture_output=True, text=True)
finally:
    os.unlink(path)
if out.returncode != 0:
    sys.exit("JavaScript failed:\n" + out.stderr)
got = json.loads(out.stdout.strip())
failures = [f"{kind} {args[0][:60]!r}:\n  want {want!r}\n  got  {have!r}" for (kind, args, want), have in zip(cases, got) if have != want]
# Every drop pattern compiles in JavaScript too (they are written for Python and Swift).
check = subprocess.run(["osascript", "-l", "JavaScript", "-e",
                        "JSON.stringify(%s.filter(function (p) { try { new RegExp(p, 'i'); return false; } catch (e) { return true; } }))" % json.dumps(pack["guard"]["drop"])],
                       capture_output=True, text=True)
bad = json.loads(check.stdout.strip() or "[]")
failures += [f"drop pattern does not compile in JavaScript: {p!r}" for p in bad]
print("\n".join(failures) if failures else f"reply guard: {len(cases)} cases pass; {len(pack['guard']['drop'])} drop patterns compile")
sys.exit(1 if failures else 0)
