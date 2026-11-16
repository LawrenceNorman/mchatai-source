#!/usr/bin/env python3
"""Expands ios-agent-domains.json into qaflywheel-ios-agent-broad.json (Phase AV.20, 2026-11-12).

    python3 qa-flywheel/generate_ios_agent_broad.py           write the catalog
    python3 qa-flywheel/generate_ios_agent_broad.py --check   fail when the written catalog is stale

Deterministic: the same spec gives the same prompts, so a run can be compared with the last one. Each domain gets each intent;
the phrasings rotate across domains so every template is used and no domain reads like a copy of another.
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = HERE / 'ios-agent-domains.json'
APPLETS = HERE / 'ios-applet-coverage.json'
OUT = HERE / 'qaflywheel-ios-agent-broad.json'


def build(spec):
    papers = spec['papersSources']
    prompts = []
    for d_index, domain in enumerate(spec['domains']):
        subjects = domain['subjects']
        for intent_id, intent in spec['intents'].items():
            if intent.get('papersOnly') and not domain.get('papers'):
                continue
            every = intent.get('every', 1)
            if d_index % every:
                continue
            templates = intent['templates']
            for n in range(intent['pick']):
                template = templates[(d_index + n) % len(templates)]
                subject = subjects[(d_index + n + len(prompts)) % len(subjects)]
                goal = (template.replace('{s}', subject).replace('{a}', domain['agent']).replace('{label}', domain['label'])
                        .replace('{aLabel}', ('an ' if domain['label'][0].lower() in 'aeiou' else 'a ') + domain['label'])
                        .replace('{site1}', domain['sites'][0]).replace('{site2}', domain['sites'][1]).replace('{explain}', domain['explain']))
                entry = {'id': f"{domain['id']}-{intent_id}-{n + 1}", 'category': intent_id, 'domain': domain['id'], 'pack': 'agent', 'goal': goal}
                for key in ('expect', 'forbid', 'minFound', 'wants', 'then'):
                    if key in intent:
                        entry[key] = intent[key]
                # A domain that is not research must never be answered from the paper archives.
                if not domain.get('papers') and not domain.get('papersOK') and 'searchPapers' in intent.get('expect', []):
                    entry['forbidSources'] = papers
                if intent.get('needPapers'):
                    entry['needSources'] = papers
                # A web-first domain's find must reach the web search, not only the news feeds or Hacker News.
                if domain.get('web') and intent_id == 'find':
                    entry['needSources'] = ['duckduckgo', 'news-gnews-local']   # or its declared stand-in when it asks for a person
                prompts.append(entry)
    for extra in spec['extras']:
        prompts.append(dict({'pack': 'agent'}, **extra))   # an extra may name its own pack (an agent class)
    # Every applet can be opened by name, so a new applet with no coverage row fails the router tier.
    for applet in (json.loads(APPLETS.read_text())['applets'] if APPLETS.exists() else []):
        prompts.append({'id': f"applet-open-{applet['id']}", 'category': 'applets', 'pack': 'agent', 'goal': f"Open {applet['title']}.",
                        'expect': ['openApplet'], 'forbid': ['searchPapers', 'createDocument'], 'wants': f"Opens {applet['title']} by name.",
                        **({'when': applet['when'], 'applet': applet['id']} if applet.get('when') else {})})
    return {'$description': f"Generated from {SPEC.name} by {Path(__file__).name}; do not edit by hand.", 'prompts': prompts}


def main(argv):
    built = build(json.loads(SPEC.read_text()))
    text = json.dumps(built, indent=1, ensure_ascii=False) + '\n'
    if '--check' in argv:
        if not OUT.exists() or OUT.read_text() != text:
            print(f'{OUT.name} is stale: run {Path(__file__).name}'); return 1
        print(f"{OUT.name}: {len(built['prompts'])} prompts, current"); return 0
    ids = [p['id'] for p in built['prompts']]
    assert len(ids) == len(set(ids)), 'duplicate scenario ids'
    OUT.write_text(text)
    by = {}
    for p in built['prompts']:
        by[p['category']] = by.get(p['category'], 0) + 1
    print(f"wrote {OUT.name}: {len(ids)} prompts · " + ', '.join(f'{k} {v}' for k, v in sorted(by.items())))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
