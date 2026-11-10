#!/usr/bin/env python3
"""Checks personas/_index.json: every record has what the apps read, every pack folder matches its record,
an `agent` block names only verbs the index lists (Phase AG.2, 2026-11-09), its `confirm`/`sources` are well formed
and the index's verbs are the compiled verbs/ios catalog (Phase AV.0).

    python3 personas/validate_personas.py personas/_index.json
"""
import json, re, sys
from pathlib import Path

PLANNERS = {'apple', 'local'}
CONFIRM = {'plan', 'writes', 'never'}   # Phase AV.2: when the agent pauses for the person
REQUIRED = ('id', 'name', 'prompt')
VERB_REQUIRED = ('id', 'title', 'summary', 'arguments', 'example')


def problems(index, folder=None, source_ids=None):
    found = []
    version = index.get('version', '')
    if not re.match(r'^\d{4}\.\d{2}\.\d{2}(\.\d+)?$', version):
        found.append(f'version must be YYYY.MM.DD or YYYY.MM.DD.n, not {version!r}')
    verbs = index.get('verbs') or []
    verb_ids = set()
    for v in verbs:
        for key in VERB_REQUIRED:
            if v.get(key) in (None, '', []):
                found.append(f"verb {v.get('id', '?')}: missing {key}")
        if v.get('id') in verb_ids:
            found.append(f"verb {v['id']}: duplicate id")
        verb_ids.add(v.get('id'))
        for a in v.get('arguments') or []:
            if not a.get('name') or not a.get('description'):
                found.append(f"verb {v.get('id', '?')}: every argument needs name and description")
    seen = set()
    for p in index.get('personas', []):
        where = f"persona {p.get('id', '?')}"
        for key in REQUIRED:
            if not p.get(key):
                found.append(f'{where}: missing {key}')
        if p.get('id') in seen:
            found.append(f'{where}: duplicate id')
        seen.add(p.get('id'))
        agent = p.get('agent')
        if agent is not None:
            if not isinstance(agent, dict):
                found.append(f'{where}: agent must be an object'); continue
            ids = agent.get('verbs') or []
            if not ids:
                found.append(f'{where}: agent.verbs is empty')
            unknown = [v for v in ids if v not in verb_ids]
            if unknown:
                found.append(f'{where}: agent.verbs not in the index verbs: {unknown}')
            must = agent.get('mustRun') or []
            if not isinstance(must, list) or any(m not in ids for m in must):
                found.append(f'{where}: agent.mustRun must be a subset of agent.verbs')
            if agent.get('planner', 'apple') not in PLANNERS:
                found.append(f"{where}: agent.planner must be one of {sorted(PLANNERS)}")
            if agent.get('confirm', 'never') not in CONFIRM:
                found.append(f"{where}: agent.confirm must be one of {sorted(CONFIRM)}")
            sources = agent.get('sources')
            if sources is not None:
                if not isinstance(sources, list) or not all(isinstance(x, str) and x for x in sources):
                    found.append(f'{where}: agent.sources must be a list of source ids')
                elif source_ids is not None:
                    unknown = [x for x in sources if x not in source_ids]
                    if unknown:
                        found.append(f'{where}: agent.sources not in sources/_index.json: {unknown}')
            if len(ids) > 6:
                found.append(f'{where}: an agent offers at most 6 verbs per session (the router picks from the catalog; {len(ids)} named)')
            if not p.get('starters'):
                found.append(f'{where}: an agent pack needs starters (the sentences a person can say)')
            if not (p.get('surfaces') or {}).get('chat', True):
                found.append(f'{where}: an agent pack must be a chat surface')
        if folder is not None:
            pj = Path(folder) / p.get('id', '') / 'persona.json'
            if pj.exists():
                record = {k: v for k, v in json.loads(pj.read_text()).items() if k != '_note'}
                mine = {k: v for k, v in p.items() if k != '_note'}
                if record != mine:
                    diff = sorted(k for k in set(record) | set(mine) if record.get(k) != mine.get(k))
                    found.append(f'{where}: persona.json differs from the index record in {diff}')
    return found


def known_source_ids(index_path):
    """The source packs (Phase AV.3), when the folder exists; None means do not check."""
    if not index_path.exists():
        return None
    return {s.get('id') for s in json.loads(index_path.read_text()).get('sources', [])}


def compiled_verb_problems(personas_dir):
    """The index's verbs must be the compiled verbs/ios catalog (Phase AV.0) when that folder exists."""
    verbs_dir = personas_dir.parent / 'verbs'
    if not (verbs_dir / 'validate_verbs.py').exists():
        return []
    sys.path.insert(0, str(verbs_dir))
    import validate_verbs as vv
    nouns, caps, verbs = vv.load_catalog(verbs_dir / 'ios')
    found = vv.problems(nouns, caps, verbs)
    return found or vv.compiled_problems(verbs, personas_dir)


def main(argv):
    if len(argv) != 1:
        print(__doc__); return 2
    path = Path(argv[0])
    source_ids = known_source_ids(path.parent.parent / 'sources' / '_index.json')
    found = problems(json.loads(path.read_text()), folder=path.parent, source_ids=source_ids)
    found.extend(compiled_verb_problems(path.parent))
    for line in found:
        print(line)
    if not found:
        print(f'{path}: valid')
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
