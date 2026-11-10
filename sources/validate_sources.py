#!/usr/bin/env python3
"""Checks sources/*.json, the places an on-device agent can search (Phase AV.3, 2026-11-09).

    python3 sources/validate_sources.py

Three adapters exist in the app: `feed` (Atom or RSS), `json` (a JSON API with a field map) and `site` (a page read in the
person's own browser session). A pack names one and supplies templates; it can never add code. Public repo: nothing
personal goes here. A person's own sites stay on their device (My sources).
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ADAPTERS = {'feed', 'json', 'site'}
PLACEHOLDER = re.compile(r'\{([a-z]+)\}')
ALLOWED = {'search': {'query', 'terms', 'max'}, 'details': {'ids'}, 'item': {'id'}, 'link': {'id'}}


def load(folder=HERE):
    return [dict(json.loads(p.read_text()), _file=p.stem) for p in sorted(folder.glob('*.json')) if not p.name.startswith('_')]


def template_problems(where, template, allowed):
    found = []
    if not template or not template.startswith('https://'):
        found.append(f'{where}: must be an https:// template')
        return found
    bad = set(PLACEHOLDER.findall(template)) - allowed
    if bad:
        found.append(f'{where}: unknown placeholder {sorted(bad)}; allowed {sorted(allowed)}')
    return found


def problems(sources):
    found, seen = [], set()
    for s in sources:
        sid = s.get('id', '?')
        where = f'source {sid}'
        for key in ('id', 'title', 'summary', 'adapter', 'search', 'attribution'):
            if not s.get(key):
                found.append(f'{where}: missing {key}')
        if not re.match(r'^[a-z][a-z0-9-]{1,40}$', sid):
            found.append(f'{where}: id must be lowercase letters, digits and dashes')
        if sid in seen:
            found.append(f'{where}: duplicate id')
        seen.add(sid)
        if s.get('_file') not in (None, sid):
            found.append(f"{where}: file is named {s['_file']}.json; name it {sid}.json")
        adapter = s.get('adapter')
        if adapter not in ADAPTERS:
            found.append(f'{where}: adapter must be one of {sorted(ADAPTERS)}')
        search = s.get('search') or {}
        found += template_problems(f'{where} search.urlTemplate', search.get('urlTemplate'), ALLOWED['search'])
        details = search.get('details')
        if details:
            found += template_problems(f'{where} search.details.urlTemplate', details.get('urlTemplate'), ALLOWED['details'])
            if not details.get('itemsPath'):
                found.append(f'{where}: search.details needs itemsPath')
            if not search.get('idsPath'):
                found.append(f'{where}: search.details needs search.idsPath')
        item = s.get('item')
        if item:
            found += template_problems(f'{where} item.urlTemplate', item.get('urlTemplate'), ALLOWED['item'])
            if item.get('format', 'record') not in ('record', 'text'):
                found.append(f'{where}: item.format must be record or text')
        for key in ('linkTemplate', 'pdfTemplate'):
            if s.get(key):
                found += template_problems(f'{where} {key}', s[key], ALLOWED['link'])
        if adapter == 'json':
            fields = s.get('fields') or {}
            for key in ('id', 'title'):
                if not fields.get(key):
                    found.append(f'{where}: a json source maps fields.{key}')
            if not search.get('itemsPath') and not details:
                found.append(f'{where}: a json source needs search.itemsPath or search.details')
            if not fields.get('url') and not s.get('linkTemplate'):
                found.append(f'{where}: a json source needs fields.url or linkTemplate')
        if s.get('summaryFormat', 'text') not in ('text', 'invertedIndex'):
            found.append(f'{where}: summaryFormat must be text or invertedIndex')
    return found


def compiled(sources):
    return [{k: v for k, v in sorted(s.items()) if not k.startswith('_')} for s in sorted(sources, key=lambda x: x['id'])]


def main():
    sources = load()
    found = problems(sources)
    print('\n'.join(found) if found else f'sources: {len(sources)} packs valid')
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main())
