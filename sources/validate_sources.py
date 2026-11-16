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


def load_kinds(folder=HERE):
    """Phase AV.16: `_kinds.json`, the kinds of thing sources carry and the words that ask for each."""
    path = folder / '_kinds.json'
    return json.loads(path.read_text()) if path.exists() else None


def kinds_problems(kinds, sources):
    if kinds is None:
        return ['sources/_kinds.json is missing']
    found, named = [], kinds.get('kinds')
    if not isinstance(named, dict) or not named:
        return ['_kinds.json: `kinds` must map each kind to the words that ask for it']
    for kind, words in named.items():
        if not re.match(r'^[a-z][a-z0-9-]{1,30}$', kind):
            found.append(f'_kinds.json: kind {kind!r} must be lowercase letters, digits and dashes')
        if not isinstance(words, list) or not words or any(not isinstance(w, str) or w != w.lower() or not w.strip() for w in words):
            found.append(f'_kinds.json: kind {kind} needs a list of lowercase words or phrases')
    personal = kinds.get('personal')
    if not isinstance(personal, list) or any(k not in named for k in personal):
        found.append('_kinds.json: `personal` must list kinds that exist')
    default = kinds.get('defaultKinds', [])
    if not isinstance(default, list) or any(k not in named for k in default):
        found.append('_kinds.json: `defaultKinds` must list kinds that exist')

    for s in sources:
        given = s.get('kinds')
        if given is None:
            found.append(f"source {s.get('id', '?')}: missing kinds (one or more of {sorted(named)})")
        elif not isinstance(given, list) or not given or any(k not in named for k in given):
            found.append(f"source {s.get('id', '?')}: kinds must be one or more of {sorted(named)}")
    return found


def load_categories(folder=HERE):
    """Phase AV.21: `_categories.json`, each category's top sites, the kinds the web joins, and sites that refuse apps."""
    path = folder / '_categories.json'
    return json.loads(path.read_text()) if path.exists() else {'categories': {}}


def compiled_kinds(kinds, categories=None):
    categories = categories or {}
    return {'kinds': kinds['kinds'], 'personal': kinds['personal'], 'regions': kinds.get('regions', {}), 'nameFillers': kinds.get('nameFillers', []),
            'defaultKinds': kinds.get('defaultKinds', []), 'siteFinder': kinds.get('siteFinder'),
            'webAlongside': categories.get('webAlongside', []), 'unreadable': categories.get('unreadable', []),
            'answerShapes': kinds.get('answerShapes', []), 'sharpen': kinds.get('sharpen', {}), 'sharpenUnless': kinds.get('sharpenUnless'),
            'timeWindows': kinds.get('timeWindows', [])}


def time_window_problems(kinds, sources):
    """Phase AV.28: each time window has words and a maximum age; a source's date filters name windows that exist."""
    found, ids = [], set()
    for window in (kinds or {}).get('timeWindows', []):
        ids.add(window.get('id'))
        if not window.get('id') or not window.get('words') or not isinstance(window.get('maxAgeDays'), int) or not 1 <= window['maxAgeDays'] <= 366:
            found.append(f"_kinds.json: time window {window.get('id', '?')} needs an id, words and maxAgeDays from 1 to 366")
    for s in sources:
        for field in ('recent', 'recentQuery'):
            extra = set((s.get('search') or {}).get(field) or {}) - ids
            if extra:
                found.append(f"source {s.get('id')}: search.{field} names windows that do not exist: {sorted(extra)}")
    return found


def answer_shape_problems(kinds):
    """Phase AV.28: each answer shape has words and a pattern that compiles; each sharpening question belongs to a kind and asks."""
    found, named = [], set((kinds or {}).get('kinds', {}))
    for shape in (kinds or {}).get('answerShapes', []):
        if not shape.get('id') or not shape.get('words') or not shape.get('pattern'):
            found.append(f"_kinds.json: answer shape {shape.get('id', '?')} needs an id, words and a pattern")
            continue
        if 'maxLine' in shape and (not isinstance(shape['maxLine'], int) or not 20 <= shape['maxLine'] <= 2000):
            found.append(f"_kinds.json: answer shape {shape['id']}: maxLine must be a number from 20 to 2000")
        for field in ('pattern', 'ignore'):
            try:
                re.compile(shape.get(field) or '')
            except re.error as error:
                found.append(f"_kinds.json: answer shape {shape['id']}: {field} does not compile ({error})")
    for kind, question in (kinds or {}).get('sharpen', {}).items():
        if kind not in named:
            found.append(f'_kinds.json: sharpen kind {kind} does not exist')
        if not question.strip().endswith('?'):
            found.append(f'_kinds.json: sharpen question for {kind} must end with a question mark')
    if (kinds or {}).get('sharpenUnless'):
        try:
            re.compile(kinds['sharpenUnless'])
        except re.error as error:
            found.append(f'_kinds.json: sharpenUnless does not compile ({error})')
    return found


def category_sources(categories, web):
    """Phase AV.21: one source per category: the web search (`web`, the DuckDuckGo pack) limited to the category's top sites."""
    if not web:
        return []
    out = []
    for cid, c in categories.get('categories', {}).items():
        limit = '%20OR%20'.join(f'site%3A{s}' for s in c['sites'])
        base = web['search']['urlTemplate'].replace('{query}', '{query}%20(' + limit + ')')
        out.append({'id': f'cat-{cid}', 'title': f"{c['title']} (top sites)",
                    'summary': f"{c['title']}: a web search limited to {', '.join(c['sites'][:4])} and {len(c['sites']) - 4} more.",
                    'kinds': [cid], 'adapter': web['adapter'], 'search': {k: v for k, v in {'urlTemplate': base, 'recent': web['search'].get('recent')}.items() if v},
                    'links': web.get('links'),
                    'attribution': f"Results by {web['title']}, from {', '.join(c['sites'])}.", '_from': 'sources/_categories.json'})
    return out


def category_problems(kinds, categories):
    found, named = [], set((kinds or {}).get('kinds', {}))
    for cid, c in categories.get('categories', {}).items():
        if cid not in named:
            found.append(f'_categories.json: category {cid} needs a kind of the same name in _kinds.json')
        sites = c.get('sites') or []
        if not c.get('title') or not 3 <= len(sites) <= 12:
            found.append(f'_categories.json: {cid} needs a title and 3 to 12 sites')
        for s in sites:
            if s != s.lower() or ' ' in s or '.' not in s or s.startswith('http'):
                found.append(f'_categories.json: {cid}: {s!r} must be a bare lowercase site, such as lonelyplanet.com')
    for k in categories.get('webAlongside', []):
        if k not in named:
            found.append(f'_categories.json: webAlongside kind {k} does not exist')
    return found


def news_sources(kinds, feeds_path=HERE.parent / 'news' / 'feeds.json'):
    """Phase AV.17: the AI News applet's feeds as agent sources, per `newsFeeds` in _kinds.json. They keep the applet's own
    names and addresses; only the placeholders the applet fills from the locale get fixed values here."""
    rule = (kinds or {}).get('newsFeeds')
    if not rule or not feeds_path.exists():
        return []
    out = []
    for feed in json.loads(feeds_path.read_text()).get('sources', []):
        if feed.get('kind', 'rss') not in rule['kinds'] or feed.get('language') not in rule['languages']:
            continue
        address = feed['rssURL']
        for placeholder, value in rule['placeholders'].items():
            address = address.replace(placeholder, value)
        category = feed.get('category', 'General')
        source = {'id': f"news-{feed['id']}", 'title': feed['name'],
                  'summary': f"{'News' if category == 'General' else category + ' news'} from {feed['name']}, as in the AI News applet.",
                  'kinds': rule['categories'].get(category, ['news']), 'adapter': 'feed', 'search': {'urlTemplate': address},
                  'attribution': feed['name'], '_from': 'news/feeds.json'}
        region = rule['countries'].get(feed.get('country', ''))
        if region:
            source['region'] = region
        outlet = rule.get('outletSearch', {}).get(feed.get('kind', 'rss'))
        if outlet:
            source['outletSearch'] = outlet
        recent = rule.get('recentQuery', {}).get(feed.get('kind', 'rss'))
        if recent:
            source['search']['recentQuery'] = recent
        out.append(source)
    return out


def site_finder_problems(kinds, sources):
    """Phase AV.19: the sources an agent's site finder searches must exist among all sources, packs and news feeds together."""
    finder = (kinds or {}).get('siteFinder')
    if finder is None:
        return []
    found, ids = [], {s.get('id') for s in sources}
    if not isinstance(finder.get('sources'), list) or not finder['sources'] or any(i not in ids for i in finder['sources']):
        found.append('_kinds.json: `siteFinder.sources` must list source ids that exist')
    if not isinstance(finder.get('limit'), int) or not 1 <= finder['limit'] <= 20:
        found.append('_kinds.json: `siteFinder.limit` must be a number from 1 to 20')
    for entry in finder.get('browse', []):
        if not entry.get('title') or set(PLACEHOLDER.findall(entry.get('urlTemplate', ''))) != {'query'} or not entry['urlTemplate'].startswith('https://'):
            found.append(f"_kinds.json: siteFinder.browse {entry.get('title', '?')} needs a title and an https urlTemplate with {{query}}")
    return found


def region_problems(kinds, sources):
    regions = set((kinds or {}).get('regions', {}))
    return [f"source {s['id']}: region {s['region']!r} is not one of {sorted(regions)}" for s in sources if s.get('region') and s['region'] not in regions]


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
        links = s.get('links')
        if links is not None:
            if adapter != 'site':
                found.append(f'{where}: links rules apply to a site source only')
            elif not isinstance(links.get('skipHosts', []), list) or not isinstance(links.get('unwrapParam', ''), str) or not isinstance(links.get('challengeText', ''), str):
                found.append(f'{where}: links.skipHosts is a list of hosts and links.unwrapParam a query name')
        if 'outletSearch' in s:
            outlet = s['outletSearch']
            if not isinstance(outlet, str) or set(PLACEHOLDER.findall(outlet)) != {'query', 'site'}:
                found.append(f'{where}: outletSearch must use exactly {{query}} and {{site}}')
            elif not search.get('urlTemplate', '').count('{query}'):
                found.append(f'{where}: outletSearch needs a search template that takes {{query}}')
        if s.get('summaryFormat', 'text') not in ('text', 'invertedIndex'):
            found.append(f'{where}: summaryFormat must be text or invertedIndex')
    return found


def compiled(sources):
    return [{k: v for k, v in sorted(s.items()) if not k.startswith('_')} for s in sorted(sources, key=lambda x: x['id'])]


def main():
    kinds = load_kinds()
    categories = load_categories()
    plain = load()
    sources = plain + news_sources(kinds) + category_sources(categories, next((s for s in plain if s['id'] == 'duckduckgo'), None))
    found = (problems(sources) + kinds_problems(kinds, sources) + region_problems(kinds, sources) + site_finder_problems(kinds, sources) + answer_shape_problems(kinds) + time_window_problems(kinds, sources)
             + category_problems(kinds, categories))
    ids = {s['id'] for s in sources}
    found += [f"source {s['id']}: links.fallbackSource {s['links']['fallbackSource']!r} is not a source" for s in sources
              if (s.get('links') or {}).get('fallbackSource') and s['links']['fallbackSource'] not in ids]
    print('\n'.join(found) if found else f'sources: {len(sources)} packs valid')
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main())
