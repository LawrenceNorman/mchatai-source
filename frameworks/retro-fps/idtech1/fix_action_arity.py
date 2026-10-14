#!/usr/bin/env python3
"""
Give every Woof state action the signature it is called with.

P_SetMobjState and P_SetPsprite call every state action as
action.p3(mobj, player, psp), but ~80 actions are defined with one parameter
(mobj_t *) and registered through the union's .p1 member. Native ABIs ignore
the extra arguments; WebAssembly traps ("function signature mismatch") on the
first such call. This widens those actions to three parameters, registers them
as .p3, and passes NULL, NULL at their direct call sites. Idempotent.

Usage: fix_action_arity.py <woof/src>
"""
import pathlib
import re
import sys

REGISTRY_FILES = ("info.c", "deh_bex_pointers.c", "decl_states.c")


def matching_paren(text, open_idx):
    depth = 0
    for i in range(open_idx, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return i
    return -1


def has_top_level_comma(args):
    depth = 0
    for ch in args:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        elif ch == "," and depth == 0:
            return True
    return False


def main():
    src = pathlib.Path(sys.argv[1])
    actions = set()
    for name in REGISTRY_FILES:
        # .p3 too, so a rerun still finds actions whose registration was
        # converted but whose definition was missed; only one-parameter
        # definitions and one-argument calls are rewritten below.
        actions |= set(re.findall(r"\.p[13]\s*=\s*(A_\w+)", (src / name).read_text()))
    names = "|".join(sorted(actions, key=len, reverse=True))

    changed = {}
    for path in sorted(list(src.glob("*.c")) + list(src.glob("*.h"))):
        text = original = path.read_text()

        # Registrations: .p1 = A_X  ->  .p3 = A_X
        text = re.sub(rf"\.p1(\s*=\s*)({names})\b", r".p3\1\2", text)

        # Header prototypes: void A_X(struct mobj_s *);
        text = re.sub(rf"(\bvoid\s+(?:{names}))\s*\(\s*struct mobj_s\s*\*\s*\)",
                      r"\1(struct mobj_s *, struct player_s *, struct pspdef_s *)", text)

        # Definitions and .c prototypes: [static] void A_X(mobj_t *name)
        text = re.sub(rf"(\bvoid\s+(?:{names}))\s*\(\s*mobj_t\s*\*\s*(\w+)\s*\)",
                      r"\1(mobj_t *\2, player_t *player, pspdef_t *psp)", text)

        # Direct one-argument calls: A_X(expr) -> A_X(expr, NULL, NULL)
        out, i = [], 0
        for m in re.finditer(rf"\b({names})\s*\(", text):
            start = m.end() - 1
            if start < i:
                continue
            before = text[max(0, m.start() - 6):m.start()]
            close = matching_paren(text, start)
            if close < 0 or re.search(r"void\s+$", before):
                continue
            args = text[start + 1:close]
            if not args.strip() or has_top_level_comma(args):
                continue
            out.append(text[i:close])
            out.append(", NULL, NULL")
            i = close
        out.append(text[i:])
        text = "".join(out)

        if text != original:
            path.write_text(text)
            changed[path.name] = sum(1 for a, b in zip(original.splitlines(), text.splitlines()) if a != b)

    print(f"{len(actions)} actions widened; files changed: {changed}")


if __name__ == "__main__":
    main()
