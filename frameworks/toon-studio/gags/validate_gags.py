import json, os, sys, glob

DIR = os.path.dirname(os.path.abspath(__file__))
PARTS = {"body", "head", "mouth", "eyes"}
XFORM = {"rotate", "dx", "dy", "scale", "scaleX", "scaleY"}
FACES = {"face_angry","face_happy","face_sad","face_surprised","face_suspicious","face_worried"}
FX = {"ts_fx_burst","ts_fx_flash","ts_fx_glow","ts_fx_smoke","ts_fx_sparkle","ts_fx_speedlines","ts_fx_splash"}
SOUNDS = set("bell_toll bells bolt boom caper carnival chains clock coins crumble door_creak dread "
             "drip fire footsteps gasp gulls heartbeat knock lament magic mystic owl pop quest rain "
             "roar scrape shimmer splash sting_horror sting_reveal sword tension theme thunder "
             "triumph waves whoosh wind".split())
BEAT_KEYS = {"at","role","pose","expression","parts","move","shake","duration","sound","gain",
             "effect","atRole","fromRole","toRole","dy","eased","hold","hide","show","clip","_comment"}
MOVE_KEYS = {"x","y","dx","dy","scale","scaleBy"}
BARE = {"looks","turns","runs","walks","goes","says","moves","stops","sees","comes","takes"}

def check(path, universal):
    name = os.path.basename(path)[:-5]
    errs, warns = [], []
    try:
        g = json.load(open(path))
    except Exception as e:
        return [f"JSON does not parse: {e}"], []
    if g.get("id") != name: errs.append(f"id {g.get('id')!r} != filename {name!r}")
    for k in ("id","triggers","seconds","roles","beats"):
        if k not in g: errs.append(f"missing required key {k!r}")
    if errs: return errs, warns

    roles = g["roles"]
    for rn, r in roles.items():
        if r.get("kind") not in ("cast","prop"): errs.append(f"role {rn}: bad kind {r.get('kind')!r}")
        n = r.get("needsAnyOf") or {}
        # A role that CONJURES brings its own prop, so its needs are a contract
        # against the candidates it names — not a narrowing of the library. That
        # contract is load-bearing: blow-fail requires `shudder` precisely so the
        # brick house qualifies and blow-down's `collapse` requirement does not.
        conjures = bool(r.get("conjure"))
        if universal and not conjures:
            if "clips" in n: errs.append(f"[B] role {rn}: needsAnyOf.clips is TIER 4")
            poses = n.get("poses") or []
            if poses and "idle" not in poses:
                errs.append(f"[B] role {rn}: needs {poses} and none is guaranteed — only 'idle' is")
            for p in n.get("parts",[]) or []:
                if p not in PARTS: errs.append(f"[B] role {rn}: needs part {p!r} not guaranteed")
            if r.get("kind") == "prop" and n and not conjures:
                warns.append(f"[B] prop role {rn} declares needsAnyOf but conjures nothing; "
                             f"it can only cast on a set that already happens to carry a match")

    trig = g.get("triggers") or []
    if not (4 <= len(trig) <= 14): warns.append(f"[E] {len(trig)} triggers (want 6-12)")
    for t in trig:
        w = t.lower().replace("-", " ").split()
        if len(w) < 2: errs.append(f"[E] trigger {t!r} is a single word — will misfire")
        elif len(w) == 2 and w[0] in ("he","she","it","they") and w[1] in BARE:
            warns.append(f"[E] trigger {t!r} is very generic")

    last = {}
    prev_at = -1
    scaled, restored = set(), set()
    parted, cleared = set(), set()
    for i, b in enumerate(g.get("beats") or []):
        for k in b:
            if k not in BEAT_KEYS: errs.append(f"beat {i}: unknown key {k!r}")
        at = b.get("at")
        if at is None: errs.append(f"beat {i}: no 'at'"); continue
        if at < prev_at - 1e-9: errs.append(f"[F] beat {i}: at={at} out of order")
        prev_at = at
        role = b.get("role")
        if role and role not in roles: errs.append(f"[F] beat {i}: role {role!r} not declared")
        for rk in ("atRole","fromRole","toRole"):
            if b.get(rk) and b[rk] not in roles: errs.append(f"[F] beat {i}: {rk} {b[rk]!r} not declared")
        if universal and b.get("clip"): errs.append(f"[B] beat {i}: 'clip' is TIER 4")
        if b.get("sound") and b["sound"] not in SOUNDS: errs.append(f"[A] beat {i}: sound {b['sound']!r} does not exist")
        if b.get("effect") and b["effect"] not in FX: errs.append(f"[A] beat {i}: effect {b['effect']!r} does not exist")
        if b.get("expression") and b["expression"] not in FACES: errs.append(f"[A] beat {i}: expression {b['expression']!r} does not exist")
        p = b.get("parts")
        if p is not None:
            if p == {}: cleared.add(role)
            for pid, tr in p.items():
                if universal and pid not in PARTS: errs.append(f"[A] beat {i}: part {pid!r} not guaranteed")
                parted.add(role)
                for tk in (tr or {}):
                    if tk not in XFORM: errs.append(f"[A] beat {i}: part transform key {tk!r} invalid")
        m = b.get("move")
        if m:
            for mk in m:
                if mk not in MOVE_KEYS: errs.append(f"beat {i}: move key {mk!r} invalid")
            if "scale" in m: errs.append(f"[C] beat {i}: move uses ABSOLUTE 'scale' — must be 'scaleBy'")
            if "scaleBy" in m:
                if abs(m["scaleBy"] - 1.0) < 1e-6: restored.add(role)
                else: scaled.add(role)
        # 12fps: one FRAME is 0.083s. Two beats on the same role but different
        # CHANNELS at the same instant are fine — a pose and a move together is
        # ordinary. Two beats on the SAME channel closer than 2 frames cannot
        # both be seen, so an alternating tremble at 0.04s renders as nothing.
        if role is not None:
            chans = []
            if b.get("move"): chans.append("xform")
            if b.get("pose") is not None or b.get("parts") is not None: chans.append("pose")
            if b.get("expression"): chans.append("face")
            if b.get("hide") or b.get("show"): chans.append("vis")
            for ch in chans:
                k = (role, ch)
                if k in last and 0 < at - last[k] < 0.17:
                    errs.append(f"[D] beat {i}: {ch} on {role} only {at - last[k]:.2f}s after the "
                                f"previous one — under 2 frames at 12fps, it will not be seen")
                last[k] = at
    for r in scaled - restored:
        warns.append(f"[C] role {r!r} never returns to scaleBy 1.0 (the binder restores it, "
                     f"but an explicit beat reads better on the timeline)")
    for r in parted - cleared:
        errs.append(f"[C] role {r!r} has part transforms and never restores with \"parts\": {{}}")
    return errs, warns

targets = sys.argv[1:] or sorted(glob.glob(f"{DIR}/*.json"))
tier4 = {"blow-down", "collapse", "faint"}
bad = 0
for path in targets:
    n = os.path.basename(path)
    if n.startswith("_"): continue
    e, w = check(path, universal=os.path.basename(path)[:-5] not in tier4)
    status = "FAIL" if e else ("warn" if w else "ok")
    if e: bad += 1
    print(f"{status:5s} {n}")
    for x in e: print(f"        ERROR {x}")
    for x in w: print(f"        warn  {x}")
print(f"\n{bad} file(s) with errors")
