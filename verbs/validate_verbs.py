#!/usr/bin/env python3
"""Checks the iOS verb catalog (Phase AV.0, 2026-11-09): verbs/ios/*.json against verbs/ios/_capabilities.json
and verbs/ios/_nouns.json, and, when asked, that the compiled copy the chat fetches matches.

    python3 verbs/validate_verbs.py                      # the catalog
    python3 verbs/validate_verbs.py --compiled           # + personas/_verbs.json and personas/_index.json agree with it

A verb is a planner-facing record (title, summary, whenToUse, arguments with types and descriptions, an example)
bound to ONE capability the iOS app implements, or composed of `steps` over several (a recipe). Content can only
compose registered capabilities (docs/CONTENT_VERB_ENGINE.md §2); the drift test on the iOS side keeps
_capabilities.json equal to the Swift registry.
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IOS = HERE / 'ios'
PERSONAS = HERE.parent / 'personas'

SAFETY = ['read', 'write', 'dangerous']
LANES = {'debug', 'developerID', 'mas'}
ARG_TYPES = {'string', 'int', 'bool'}
REQUIRED = ('id', 'title', 'summary', 'arguments', 'example', 'safetyClass', 'outputs')
TOOL_NAME = re.compile(r'^[a-zA-Z][a-zA-Z0-9_]{1,40}$')
BINDING = re.compile(r'\$\{([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_.]*)\}')
VERSION = re.compile(r'^\d{4}\.\d{2}\.\d{2}(\.\d+)?$')


def load_catalog(folder=IOS):
    nouns = json.loads((folder / '_nouns.json').read_text())
    caps = json.loads((folder / '_capabilities.json').read_text())
    verbs = []
    for path in sorted(folder.glob('*.json')):
        if path.name.startswith('_'):
            continue
        record = json.loads(path.read_text())
        record['_file'] = path.stem
        verbs.append(record)
    return nouns, caps, verbs


def safety_rank(name):
    return SAFETY.index(name) if name in SAFETY else -1


def capability_problems(caps, nouns):
    found = []
    if not VERSION.match(caps.get('version', '')):
        found.append(f"_capabilities.json: version must be YYYY.MM.DD or YYYY.MM.DD.n, not {caps.get('version')!r}")
    seen = set()
    noun_ids = set((nouns.get('nouns') or {}).keys())
    for c in caps.get('capabilities') or []:
        cid = c.get('id', '?')
        where = f'capability {cid}'
        if not re.match(r'^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$', cid):
            found.append(f'{where}: id must look like domain.action')
        if cid in seen:
            found.append(f'{where}: duplicate id')
        seen.add(cid)
        if c.get('safetyClass') not in SAFETY:
            found.append(f'{where}: safetyClass must be one of {SAFETY}')
        if c.get('output') not in noun_ids:
            found.append(f"{where}: output noun {c.get('output')!r} is not in _nouns.json")
        if not c.get('summary'):
            found.append(f'{where}: missing summary')
        if not isinstance(c.get('result'), list) or not c['result']:
            found.append(f'{where}: result must list the fields a later step may bind')
        names = set()
        for a in c.get('arguments') or []:
            if not a.get('name') or a.get('type') not in ARG_TYPES:
                found.append(f"{where}: argument {a.get('name', '?')} needs a name and a type in {sorted(ARG_TYPES)}")
            if a.get('noun') and a['noun'] not in noun_ids:
                found.append(f"{where}: argument {a.get('name')} names unknown noun {a['noun']!r}")
            names.add(a.get('name'))
        if 'network' not in c:
            found.append(f'{where}: say whether it reaches the network (network: true|false)')
    return found


def verb_problems(verb, caps_by_id, noun_ids):
    found = []
    vid = verb.get('id', '?')
    where = f'verb {vid}'
    for key in REQUIRED:
        if verb.get(key) in (None, '', []) and not (key == 'arguments' and verb.get(key) == []):
            found.append(f'{where}: missing {key}')
    if not TOOL_NAME.match(str(vid)):
        found.append(f'{where}: id must be a plain tool name (letters, digits, _), 2 to 41 characters')
    if verb.get('_file') not in (None, vid):
        found.append(f"{where}: file is named {verb['_file']}.json; name it {vid}.json")
    if verb.get('safetyClass') not in SAFETY:
        found.append(f'{where}: safetyClass must be one of {SAFETY}')
    arg_names = []
    for a in verb.get('arguments') or []:
        name = a.get('name')
        if not name or not a.get('description'):
            found.append(f'{where}: every argument needs name and description')
        if a.get('type', 'string') not in ARG_TYPES:
            found.append(f"{where}: argument {name} type must be in {sorted(ARG_TYPES)}")
        if a.get('noun') and a['noun'] not in noun_ids:
            found.append(f"{where}: argument {name} names unknown noun {a['noun']!r}")
        if name in arg_names:
            found.append(f'{where}: duplicate argument {name}')
        if name == 'reason':
            found.append(f'{where}: `reason` is added by the engine; do not declare it')
        arg_names.append(name)
    for key in ('inputs', 'outputs'):
        for n in verb.get(key) or []:
            if n not in noun_ids:
                found.append(f'{where}: {key} names unknown noun {n!r}')
    for alias, target in (verb.get('aliases') or {}).items():
        if target not in arg_names:
            found.append(f'{where}: alias {alias} points at unknown argument {target}')
    if 'reason' in verb and not isinstance(verb['reason'], bool):
        found.append(f'{where}: reason must be true or false')
    words = verb.get('routeWords')
    if words is not None and (not isinstance(words, list) or not all(isinstance(w, str) and re.fullmatch(r'[a-z0-9]+', w) for w in words)):
        found.append(f'{where}: routeWords must be single lowercase words (the router compares whole words)')
    if verb.get('routeOnAddress') and 'url' not in arg_names:
        found.append(f'{where}: routeOnAddress needs an argument called url')
    if verb.get('routeOnSite') and 'site' not in arg_names:
        found.append(f'{where}: routeOnSite needs an argument called site')
    if verb.get('routeOnList') and 'id' not in arg_names:
        found.append(f'{where}: routeOnList needs an argument called id (the number of an item in the list)')
    for flag in ('routeOnAddress', 'routeOnSite', 'routeOnList'):
        if flag in verb and not isinstance(verb[flag], bool):
            found.append(f'{where}: {flag} must be true or false')
    lanes = verb.get('releaseLanes')
    if lanes is not None and (not isinstance(lanes, list) or not set(lanes) <= LANES):
        found.append(f'{where}: releaseLanes must be a subset of {sorted(LANES)}')
    if verb.get('appIntent') and verb.get('safetyClass') == 'dangerous':
        found.append(f'{where}: a dangerous verb can never be an App Intent')

    has_cap = bool(verb.get('capability'))
    has_steps = bool(verb.get('steps'))
    if has_cap == has_steps:
        found.append(f'{where}: bind exactly one `capability`, or compose `steps`')
        return found
    used = []
    if has_cap:
        cap = caps_by_id.get(verb['capability'])
        if cap is None:
            found.append(f"{where}: capability {verb['capability']} is not in _capabilities.json (content can only compose registered capabilities; a new primitive needs Swift)")
        else:
            used.append(cap)
            cap_args = {a['name']: a for a in cap.get('arguments') or []}
            for name in arg_names:
                if name not in cap_args:
                    found.append(f"{where}: argument {name} is not an argument of {cap['id']} ({sorted(cap_args)})")
            for name, a in cap_args.items():
                if a.get('required') and name not in arg_names:
                    found.append(f"{where}: {cap['id']} requires argument {name}")
    else:
        steps = verb['steps']
        if len(steps) > 12:
            found.append(f'{where}: {len(steps)} steps; the limit is 12')
        step_ids = []
        for s in steps:
            sid = s.get('id')
            if not sid or sid in step_ids or sid == 'args':
                found.append(f'{where}: every step needs a unique id (not "args"); got {sid!r}')
            cap = caps_by_id.get(s.get('capability'))
            if cap is None:
                found.append(f"{where}: step {sid} uses unknown capability {s.get('capability')!r}")
                step_ids.append(sid)
                continue
            used.append(cap)
            cap_args = {a['name']: a for a in cap.get('arguments') or []}
            bindings = s.get('with') or {}
            for name in bindings:
                if name not in cap_args:
                    found.append(f"{where}: step {sid} passes {name}, not an argument of {cap['id']}")
            for name, a in cap_args.items():
                if a.get('required') and name not in bindings:
                    found.append(f"{where}: step {sid} misses required {name} of {cap['id']}")
            for value in bindings.values():
                if not isinstance(value, str):
                    found.append(f'{where}: step {sid}: every `with` value must be a string (got {value!r})')
                for scope, path in BINDING.findall(str(value)):
                    if scope == 'args':
                        if path not in arg_names:
                            found.append(f'{where}: step {sid} binds ${{args.{path}}} but the verb has no argument {path}')
                    elif scope in step_ids:
                        earlier = next(x for x in steps if x.get('id') == scope)
                        fields = caps_by_id.get(earlier.get('capability'), {}).get('result') or []
                        parts = path.split('.')
                        if parts[0] != 'result' or len(parts) < 2 or parts[1] not in fields:
                            found.append(f'{where}: step {sid} binds ${{{scope}.{path}}}; {scope} offers result.{{{", ".join(fields)}}}')
                    else:
                        found.append(f'{where}: step {sid} binds ${{{scope}.{path}}} but no earlier step is called {scope}')
            step_ids.append(sid)
        out = verb.get('output') or {}
        for value in out.values():
            for scope, path in BINDING.findall(str(value)):
                if scope != 'args' and scope not in step_ids:
                    found.append(f'{where}: output binds ${{{scope}.{path}}} but no step is called {scope}')
    if used:
        needed = max(safety_rank(c.get('safetyClass', 'dangerous')) for c in used)
        if safety_rank(verb.get('safetyClass', '')) < needed:
            found.append(f"{where}: declares safetyClass {verb.get('safetyClass')} but uses a {SAFETY[needed]} capability")
        if any(c.get('network') for c in used) and not verb.get('network'):
            found.append(f'{where}: a capability it uses reaches the network; declare network: true')
    return found


def problems(nouns, caps, verbs):
    found = capability_problems(caps, nouns)
    noun_ids = set((nouns.get('nouns') or {}).keys())
    if not VERSION.match(nouns.get('version', '')):
        found.append('_nouns.json: version must be YYYY.MM.DD or YYYY.MM.DD.n')
    caps_by_id = {c['id']: c for c in caps.get('capabilities') or [] if c.get('id')}
    seen = set()
    for v in verbs:
        if v.get('id') in seen:
            found.append(f"verb {v.get('id')}: duplicate id")
        seen.add(v.get('id'))
        found.extend(verb_problems(v, caps_by_id, noun_ids))
    found.extend(template_problems(caps, {v.get('id') for v in verbs}))
    return found


def agent_template(caps):
    """How a new agent is filled in (Phase AV.12): the `template` of the agents.create capability, without notes."""
    t = next((c.get('template') for c in caps.get('capabilities') or [] if c.get('id') == 'agents.create'), None)
    return {k: v for k, v in t.items() if not k.startswith('_')} if isinstance(t, dict) else None


def template_problems(caps, verb_ids):
    if not any(c.get('id') == 'agents.create' for c in caps.get('capabilities') or []):
        return []
    t = agent_template(caps)
    where = 'capability agents.create template'
    if t is None:
        return [f'{where}: missing (a new agent needs its role, steps and starters from content)']
    found = []
    prompt = t.get('prompt') or ''
    if '{name}' not in prompt or '{purpose}' not in prompt:
        found.append(f'{where}: prompt must contain {{name}} and {{purpose}}')
    always = t.get('always') or []
    unknown = [x for x in always if x not in verb_ids]
    if unknown:
        found.append(f'{where}: always names unknown steps {unknown}')
    if len(always) > 6:
        found.append(f'{where}: always names more than six steps')
    starters = t.get('starters') or {}
    if not isinstance(starters, dict) or not starters:
        found.append(f'{where}: starters must map step ids to a sentence')
    else:
        bad = [k for k in starters if k not in verb_ids]
        if bad:
            found.append(f'{where}: starters name unknown steps {bad}')
    if 'namePrompt' in t and '{purpose}' not in (t.get('namePrompt') or ''):
        found.append(f'{where}: namePrompt must contain {{purpose}}')
    if t.get('confirm', 'never') not in ('never', 'writes', 'plan'):
        found.append(f'{where}: confirm must be never, writes or plan')
    if not isinstance(t.get('sources', []), list):
        found.append(f'{where}: sources must be a list of source ids')
    return found


def eval_problems(verbs, folder=IOS):
    """The goal set names only verbs the catalog has (Phase AV.7)."""
    path = folder / '_evals' / 'goals.json'
    if not path.exists():
        return []
    ids = {v.get('id') for v in verbs}
    found, seen = [], set()
    for g in json.loads(path.read_text()).get('goals') or []:
        where = f"eval {g.get('id', '?')}"
        if g.get('id') in seen:
            found.append(f'{where}: duplicate id')
        seen.add(g.get('id'))
        if not g.get('goal') or not g.get('pack') or not g.get('expect'):
            found.append(f'{where}: needs goal, pack and expect')
        unknown = [x for x in (g.get('expect') or []) + (g.get('mustRun') or []) + (g.get('forbid') or []) if x not in ids]
        if unknown:
            found.append(f'{where}: unknown verbs {unknown}')
    return found


def compiled_verbs(verbs):
    """The records the chat fetches: everything but the author's notes, in id order."""
    return [{k: v for k, v in sorted(verb.items()) if not k.startswith('_')} for verb in sorted(verbs, key=lambda v: v['id'])]


def compiled_problems(verbs, personas_dir=PERSONAS, caps=None):
    found = []
    want = compiled_verbs(verbs)
    index_path = personas_dir / '_index.json'
    if caps is not None and index_path.exists() and json.loads(index_path.read_text()).get('agentTemplate') != agent_template(caps):
        found.append('personas/_index.json: agentTemplate differs from verbs/ios/_capabilities.json; run verbs/build_index.py')
    for name in ('_verbs.json', '_index.json'):
        path = personas_dir / name
        if not path.exists():
            found.append(f'{path} is missing; run verbs/build_index.py')
            continue
        have = json.loads(path.read_text()).get('verbs')
        if have != want:
            found.append(f'personas/{name}: verbs differ from the catalog; run verbs/build_index.py')
    return found


def main(argv):
    nouns, caps, verbs = load_catalog()
    found = problems(nouns, caps, verbs) + eval_problems(verbs)
    if '--compiled' in argv and not found:
        found.extend(compiled_problems(verbs, caps=caps))
    for line in found:
        print(line)
    if not found:
        recipes = sum(1 for v in verbs if v.get('steps'))
        print(f'verbs/ios: {len(verbs)} verbs ({recipes} recipes) over {len(caps["capabilities"])} capabilities, {len(nouns["nouns"])} nouns: valid')
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
