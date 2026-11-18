#!/usr/bin/env python3
"""Checks personas/_index.json: every record has what the apps read, every pack folder matches its record,
an `agent` block names only verbs the index lists (Phase AG.2, 2026-11-09), its `confirm`/`sources` are well formed
and the index's verbs are the compiled verbs/ios catalog (Phase AV.0). Phase FL.10 (2026-11-16): a companion pack
(`agent.mode: "companion"`) says how a person asks for each step, and a pack that keeps nothing (`retention: "none"`) may only
name steps that say what they keep (`privateChat.keeps`), pauses before a step that writes, and never searches.

    python3 personas/validate_personas.py personas/_index.json
"""
import json, re, sys
from pathlib import Path

PLANNERS = {'apple', 'local'}
CONFIRM = {'plan', 'writes', 'never'}   # Phase AV.2: when the agent pauses for the person
# Phase FL.7: `none` = a private companion keeps nothing (no saved chat, no pinned lines, no mini-app storage).
RETENTION = {'default', 'none'}
MODES = {'agent', 'companion'}   # Phase FL.10: a companion chats as a persona and takes a step only when asked
OFFER_WHEN = {'personSays', 'noteHasSource', 'noteHasQuiz', 'noteHasEpisode', 'noteHasGame', 'afterCalculation'}
# Phase FL.15: the app's own sums (AgentCompanion.calculation) and its step that opens one of the pack's `tools`.
FORMULAS = {'lumpSum', 'monthlySaving', 'cardPayoff', 'feeDrag'}
TOOL_VERB = 'openTool'
# Phase FL.14: the app's own step that opens one of the pack's `games` (no planner, no catalog verb). It is never in
# agent.verbs, so a build without it skips the offer.
GAME_VERB = 'openGame'
PHRASE = re.compile(r'^[a-z0-9]+( [a-z0-9]+)*$')
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
            # A step that takes no input (the battery, My Macs) has an empty argument list; it must still have the key.
            if v.get(key) is None or v.get(key) == '' or (v.get(key) == [] and key != 'arguments'):
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
        if 'retention' in p:
            retention = p['retention']
            if not isinstance(retention, str) or retention not in RETENTION:
                found.append(f"{where}: retention must be one of {sorted(RETENTION)}, not {retention!r}")
            elif retention == 'none':
                # The app treats a keep-nothing pack as on-device-only whatever `model` says; the record must say so itself.
                if p.get('model') != 'on-device-only':
                    found.append(f'{where}: retention "none" needs model "on-device-only"')
                if (p.get('memory') or {}).get('optIn'):
                    found.append(f'{where}: retention "none" cannot offer memory.optIn (nothing is kept)')
        agent = p.get('agent')
        if agent is not None:
            if not isinstance(agent, dict):
                found.append(f'{where}: agent must be an object'); continue
            ids = agent.get('verbs') or []
            if not ids and agent.get('catalogVerbs') is not True:
                found.append(f'{where}: agent.verbs is empty (allowed only with catalogVerbs: true, where the router picks)')
            unknown = [v for v in ids if v not in verb_ids]
            if unknown:
                found.append(f'{where}: agent.verbs not in the index verbs: {unknown}')
            fallback = agent.get('fallbackVerbs') or []
            if not isinstance(fallback, list) or any(v not in {x.get('id') for x in verbs} for v in fallback):
                found.append(f'{where}: agent.fallbackVerbs must name verbs the index lists')
            skip = agent.get('fallbackSkipPhrases') or []
            if not isinstance(skip, list) or any(not isinstance(x, str) or x != x.lower() or not x.strip() for x in skip):
                found.append(f'{where}: agent.fallbackSkipPhrases must be lowercase phrases')
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
            if 'catalogVerbs' in agent and not isinstance(agent['catalogVerbs'], bool):
                found.append(f'{where}: agent.catalogVerbs must be true or false')
            if 'catalogSources' in agent and not isinstance(agent['catalogSources'], bool):
                found.append(f'{where}: agent.catalogSources must be true or false')
            if len(ids) > 6:
                found.append(f'{where}: an agent offers at most 6 verbs per session (the router picks from the catalog; {len(ids)} named)')
            if not p.get('starters'):
                found.append(f'{where}: an agent pack needs starters (the sentences a person can say)')
            if not (p.get('surfaces') or {}).get('chat', True):
                found.append(f'{where}: an agent pack must be a chat surface')
            found.extend(companion_problems(where, p, agent, ids, {v.get('id'): v for v in verbs}))
        found.extend(pack_content_problems(where, p, folder))
        if folder is not None:
            pj = Path(folder) / p.get('id', '') / 'persona.json'
            if pj.exists():
                record = {k: v for k, v in json.loads(pj.read_text()).items() if k != '_note'}
                mine = {k: v for k, v in p.items() if k != '_note'}
                if record != mine:
                    diff = sorted(k for k in set(record) | set(mine) if record.get(k) != mine.get(k))
                    found.append(f'{where}: persona.json differs from the index record in {diff}')
    template = index.get('agentTemplate')
    if template is not None and source_ids is not None:
        unknown = [x for x in template.get('sources') or [] if x not in source_ids]
        if unknown:
            found.append(f'agentTemplate.sources not in sources/_index.json: {unknown}')
    return found


def phrases_ok(value, least_words=1):
    return isinstance(value, list) and bool(value) and all(
        isinstance(x, str) and PHRASE.match(x) and len(x.split()) >= least_words for x in value)


def companion_problems(where, p, agent, ids, verbs_by_id):
    """Phase FL.10: the companion mode, and what a pack that keeps nothing may do with steps."""
    found = []
    mode = agent.get('mode', 'agent')
    if mode not in MODES:
        found.append(f"{where}: agent.mode must be one of {sorted(MODES)}, not {mode!r}")
    if mode == 'companion':
        if not ids:
            found.append(f'{where}: a companion names its steps (agent.verbs)')
        if agent.get('catalogVerbs') or agent.get('fallbackVerbs'):
            found.append(f'{where}: a companion takes only the steps it names (no catalogVerbs, no fallbackVerbs)')
        ask = agent.get('ask')
        if not isinstance(ask, dict):
            found.append(f'{where}: a companion needs agent.ask: the phrases that ask for each step')
        else:
            for vid in ids:
                # Two words or more: one word ("quiz", "task") would take a sentence that only mentions it away from the chat.
                if not phrases_ok(ask.get(vid), least_words=2):
                    found.append(f'{where}: agent.ask.{vid} must be lowercase phrases of two or more words (letters, digits, spaces)')
            extra = sorted(set(ask) - set(ids))
            if extra:
                found.append(f'{where}: agent.ask names steps the pack does not have: {extra}')
        back = agent.get('pointBack', {})
        if not isinstance(back, dict) or set(back) - set(ids):
            found.append(f'{where}: agent.pointBack must be keyed by steps the pack has')
        else:
            for vid, rule in back.items():
                names = [a.get('name') for a in (verbs_by_id.get(vid) or {}).get('arguments') or []]
                if not isinstance(rule, dict) or rule.get('argument') not in names or not str(rule.get('ask') or '').strip():
                    found.append(f'{where}: agent.pointBack.{vid} needs an argument of that step and the line that asks for it')
        decline = agent.get('decline', [])
        if not isinstance(decline, list) or any(
                not isinstance(rule, dict) or not phrases_ok(rule.get('ask'), least_words=2) or not str(rule.get('say') or '').strip()
                for rule in decline):
            found.append(f'{where}: each agent.decline rule needs ask (lowercase phrases of two or more words) and the line to say')
        # Phase FL.13: answers the pack gives from its own text, before any decline.
        guides = agent.get('guides', [])
        guide_ids = [g.get('id') for g in guides if isinstance(g, dict)]
        if not isinstance(guides, list) or any(
                not isinstance(g, dict) or not str(g.get('id') or '').strip() or not phrases_ok(g.get('ask'), least_words=2)
                or not str(g.get('say') or '').strip() or len(str(g.get('say') or '')) > 900
                or not isinstance(g.get('also', []), list) or not isinstance(g.get('notes', []), list)
                for g in guides) or len(set(guide_ids)) != len(guide_ids):
            found.append(f'{where}: each agent.guides entry needs its own id, ask (lowercase phrases of two or more words), '
                         f'the answer to say (900 characters at most), and also/notes as lists')
        # FL.15: sums the app works out itself.
        calcs = agent.get('calculators', [])
        if not isinstance(calcs, list) or any(
                not isinstance(c, dict) or not str(c.get('id') or '').strip() or c.get('formula') not in FORMULAS
                or not phrases_ok(c.get('ask')) or not str(c.get('say') or '').strip() or len(str(c.get('say') or '')) > 600
                or not isinstance(c.get('notes', []), list)
                or any(k in c and (not isinstance(c[k], str) or not c[k].strip()) for k in ('never', 'missing'))
                for c in calcs):
            found.append(f'{where}: each agent.calculators entry needs an id, a formula ({", ".join(sorted(FORMULAS))}), ask '
                         f'(lowercase words), the line to say (600 characters at most), notes as a list, and never/missing as lines')
        after = agent.get('afterNotes', [])
        if not isinstance(after, list) or set(after) - set(ids):
            found.append(f'{where}: agent.afterNotes must list steps the pack has')
    elif 'ask' in agent:
        found.append(f'{where}: agent.ask is read only in mode "companion"')
    if p.get('retention') == 'none':
        if mode != 'companion':
            found.append(f'{where}: a pack that keeps nothing may take steps only as a companion (agent.mode "companion")')
        if agent.get('planner', 'apple') != 'apple' or agent.get('localPlannerAllowed'):
            found.append(f'{where}: a pack that keeps nothing plans on Apple\'s on-device model only')
        if agent.get('sources') or agent.get('catalogSources') or agent.get('useInterests'):
            found.append(f'{where}: a pack that keeps nothing cannot search (its words would leave the device) or read interests')
        writes = False
        for vid in ids:
            verb = verbs_by_id.get(vid) or {}
            keeps = (verb.get('privateChat') or {}).get('keeps')
            if not isinstance(keeps, str) or not keeps.strip():
                found.append(f'{where}: step {vid} does not say what it keeps (privateChat.keeps), so a private chat cannot use it')
            writes = writes or verb.get('safetyClass', 'read') != 'read'
        if writes and agent.get('confirm') != 'writes':
            found.append(f'{where}: a pack that keeps nothing pauses before a step that writes (agent.confirm "writes")')
    return found


def pack_content_problems(where, p, folder):
    """Phase FL.10: what a pack carries beside its notes (`media`), and the offers the app may make (`offers`)."""
    found = []
    media = p.get('media')
    if media is not None:
        if not isinstance(media, list):
            return found + [f'{where}: media must be a list']
        seen = set()
        for m in media:
            mid = m.get('id') if isinstance(m, dict) else None
            if not mid or mid in seen:
                found.append(f'{where}: every media item needs its own id'); continue
            seen.add(mid)
            if m.get('kind') != 'episode':
                found.append(f"{where}: media {mid}: kind must be 'episode'")
            if not m.get('title'):
                found.append(f'{where}: media {mid}: missing title')
            path, url = m.get('path'), m.get('url')
            if bool(path) == bool(url):
                found.append(f'{where}: media {mid}: give path (in mchatai-source) or url (https), not both')
            elif url and not str(url).startswith('https://'):
                found.append(f'{where}: media {mid}: url must be https')
            elif path and (str(path).startswith('/') or '..' in str(path)):
                found.append(f'{where}: media {mid}: path must be relative to mchatai-source')
            elif path and folder is not None and not (Path(folder).parent / path).exists():
                found.append(f'{where}: media {mid}: {path} is not in mchatai-source')
    # FL.14 games and FL.15 tools: published Hub products the pack offers (one id space).
    seen = set()
    for key in ('games', 'tools'):
        games = p.get(key)
        if games is None:
            continue
        if not isinstance(games, list):
            return found + [f'{where}: {key} must be a list']
        for g in games:
            gid = g.get('id') if isinstance(g, dict) else None
            if not gid or gid in seen:
                found.append(f'{where}: every game and tool needs its own id'); continue
            seen.add(gid)
            if not str(g.get('title') or '').strip():
                found.append(f'{where}: game {gid}: missing title')
            product, url = g.get('product'), g.get('url')
            if not product and not url:
                found.append(f'{where}: game {gid}: name its Hub product id, its hosted https url, or both')
            if product is not None and not re.match(r'^[A-Za-z0-9._-]+$', str(product)):
                found.append(f'{where}: game {gid}: product must be a Hub product id')
            if url is not None and not str(url).startswith('https://'):
                found.append(f'{where}: game {gid}: url must be https')
            for field in ('label', 'sub', 'say'):
                if field in g and (not isinstance(g[field], str) or not g[field].strip() or len(g[field]) > 400):
                    found.append(f'{where}: game {gid}: {field} must be a line of text (400 characters at most)')
            chapters = g.get('chapters', [])
            if not isinstance(chapters, list) or not all(isinstance(n, int) and not isinstance(n, bool) for n in chapters):
                found.append(f'{where}: game {gid}: chapters must be chapter numbers')
            # Two words or more and verb-led: "fast forward" alone would take "I want to fast forward to retirement".
            if 'ask' in g and not phrases_ok(g['ask'], least_words=2):
                found.append(f'{where}: game {gid}: ask must be lowercase phrases of two or more words')
    library = (p.get('door') or {}).get('library') or {}
    if 'ask' in library and not phrases_ok(library['ask'], least_words=2):
        found.append(f'{where}: door.library.ask must be lowercase phrases of two or more words')
    if ('readLabel' in library) != ('readSend' in library):
        found.append(f'{where}: door.library needs both readLabel and readSend for its chip')
    explain = (p.get('knowledge') or {}).get('explain')
    if explain is not None and not phrases_ok(explain):
        found.append(f'{where}: knowledge.explain must be lowercase phrases (letters, digits, spaces)')
    guard = p.get('guard')
    if guard is not None:
        drop = guard.get('drop') if isinstance(guard, dict) else None
        for flag in ('numbersFromNotes', 'noLists', 'noRepeats'):
            if isinstance(guard, dict) and flag in guard and not isinstance(guard[flag], bool):
                found.append(f'{where}: guard.{flag} must be true or false')
        # A malformed field drops the whole guard in the app (its advice patterns too), so each is checked here.
        if isinstance(guard, dict):
            for line in ('repeated', 'assent'):
                if line in guard and (not isinstance(guard[line], str) or not guard[line].strip()):
                    found.append(f'{where}: guard.{line} must be a line of text')
            if isinstance(guard.get('assent'), str) and '{question}' not in guard['assent']:
                found.append(f'{where}: guard.assent must name {{question}} (the question the person said yes to)')
            if 'restate' in guard and not phrases_ok(guard['restate']):
                found.append(f'{where}: guard.restate must be lowercase phrases (letters, digits, spaces)')
            names = guard.get('shortNames')
            if names is not None and (not isinstance(names, dict) or not all(isinstance(k, str) and k.strip() and isinstance(v, str) and v.strip() for k, v in names.items())):
                found.append(f'{where}: guard.shortNames must map each long name to its short form (text to text)')
        if not isinstance(drop, list) or not drop or not str(guard.get('empty') or '').strip():
            found.append(f'{where}: guard needs drop (regular expressions) and the line shown when nothing is left (empty)')
        else:
            for pattern in drop:
                try:
                    re.compile(pattern)
                except (re.error, TypeError):
                    found.append(f'{where}: guard.drop has a pattern that does not compile: {pattern!r}')
        # FL.14: patterns applied only on a turn given no notes.
        without = guard.get('dropWithoutNotes') if isinstance(guard, dict) else None
        if without is not None:
            if not isinstance(without, list):
                found.append(f'{where}: guard.dropWithoutNotes must be a list of regular expressions')
            else:
                for pattern in without:
                    try:
                        re.compile(pattern)
                    except (re.error, TypeError):
                        found.append(f'{where}: guard.dropWithoutNotes has a pattern that does not compile: {pattern!r}')
    offers = p.get('offers')
    if offers is not None:
        agent = p.get('agent') or {}
        if agent.get('mode') != 'companion':
            found.append(f'{where}: offers are made only by a companion (agent.mode "companion")')
        if not isinstance(offers, dict) or not isinstance(offers.get('rules'), list):
            return found + [f'{where}: offers.rules must be a list']
        if 'accept' in offers and not phrases_ok(offers['accept']):
            found.append(f'{where}: offers.accept must be lowercase phrases (letters, digits, spaces)')
        used = set()
        for rule in offers['rules']:
            verb = rule.get('verb') if isinstance(rule, dict) else None
            if verb == GAME_VERB:
                if rule.get('when') != 'noteHasGame' or not p.get('games'):
                    found.append(f'{where}: an {GAME_VERB} offer needs when "noteHasGame" and a pack with games')
                if GAME_VERB in (agent.get('verbs') or []):
                    found.append(f'{where}: {GAME_VERB} is the app\'s own step; keep it out of agent.verbs (a build without it would route it)')
            elif verb == TOOL_VERB:
                if rule.get('when') != 'afterCalculation' or not p.get('tools'):
                    found.append(f'{where}: an {TOOL_VERB} offer needs when "afterCalculation" and a pack with tools')
                if TOOL_VERB in (agent.get('verbs') or []):
                    found.append(f'{where}: {TOOL_VERB} is the app\'s own step; keep it out of agent.verbs')
            elif rule.get('when') in ('noteHasGame', 'afterCalculation'):
                found.append(f'{where}: a {rule.get("when")} offer is made with verb {GAME_VERB!r} or {TOOL_VERB!r}')
            elif verb not in (agent.get('verbs') or []):
                found.append(f'{where}: an offer names a step the pack does not have: {verb!r}'); continue
            if verb in used:
                found.append(f'{where}: two offers for {verb} (each step is offered by one rule)')
            used.add(verb)
            if rule.get('when') not in OFFER_WHEN:
                found.append(f"{where}: offer {verb}: when must be one of {sorted(OFFER_WHEN)}")
            if rule.get('when') == 'personSays' and not phrases_ok(rule.get('phrases'), least_words=2):
                found.append(f'{where}: offer {verb}: personSays needs lowercase phrases of two or more words')
            if 'unless' in rule and not (isinstance(rule['unless'], list) and all(isinstance(w, str) and re.match(r'^[a-z0-9]+$', w) for w in rule['unless'])):
                found.append(f'{where}: offer {verb}: unless must be single lowercase words')
            say = rule.get('say')
            if not isinstance(say, str) or not say.strip() or len(say) > 140:
                found.append(f'{where}: offer {verb}: say must be one line of at most 140 characters')
            # FL.15: a chip needs its label and the words it sends; the line shown with it is optional.
            if ('button' in rule) != ('send' in rule):
                found.append(f'{where}: offer {verb}: a chip needs both button and send')
            for field, most in (('line', 140), ('button', 40), ('send', 80)):
                if field in rule and (not isinstance(rule[field], str) or not rule[field].strip() or len(rule[field]) > most):
                    found.append(f'{where}: offer {verb}: {field} must be a line of at most {most} characters')
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
    return found or vv.compiled_problems(verbs, personas_dir, caps=caps)


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
