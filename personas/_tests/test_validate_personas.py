import copy, json, unittest
from pathlib import Path
import sys
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import validate_personas as v  # noqa: E402

INDEX = json.loads((HERE.parent / '_index.json').read_text())


class ValidatePersonasTests(unittest.TestCase):
    def test_index_file_is_valid(self):
        self.assertEqual(v.problems(INDEX, folder=HERE.parent), [])

    def test_agent_verbs_must_exist(self):
        idx = copy.deepcopy(INDEX)
        pack = next(p for p in idx['personas'] if p.get('agent'))
        pack['agent']['verbs'].append('flyToTheMoon')
        self.assertTrue(any('not in the index verbs' in p for p in v.problems(idx)))

    def test_agent_needs_starters_and_a_known_planner(self):
        idx = copy.deepcopy(INDEX)
        pack = next(p for p in idx['personas'] if p.get('agent'))
        pack['starters'] = []
        pack['agent']['planner'] = 'cloud'
        found = v.problems(idx)
        self.assertTrue(any('needs starters' in p for p in found))
        self.assertTrue(any('planner must be' in p for p in found))

    def test_must_run_is_a_subset_of_verbs(self):
        idx = copy.deepcopy(INDEX)
        pack = next(p for p in idx['personas'] if p.get('agent'))
        pack['agent']['mustRun'] = ['notAVerb']
        self.assertTrue(any('mustRun' in p for p in v.problems(idx)))

    def test_confirm_and_sources_shapes(self):
        idx = copy.deepcopy(INDEX)
        pack = next(p for p in idx['personas'] if p.get('agent'))
        pack['agent']['confirm'] = 'always'
        pack['agent']['sources'] = 'arxiv'
        found = v.problems(idx)
        self.assertTrue(any('confirm must be' in p for p in found))
        self.assertTrue(any('sources must be a list' in p for p in found))

    def test_sources_checked_against_the_source_index_when_given(self):
        idx = copy.deepcopy(INDEX)
        pack = next(p for p in idx['personas'] if p.get('agent'))
        pack['agent']['sources'] = ['arxiv', 'myspace']
        self.assertTrue(any('myspace' in p for p in v.problems(idx, source_ids={'arxiv'})))
        self.assertEqual([p for p in v.problems(idx, source_ids=None) if 'sources' in p], [])

    def test_at_most_six_verbs_per_agent(self):
        idx = copy.deepcopy(INDEX)
        pack = next(p for p in idx['personas'] if p.get('agent'))
        pack['agent']['verbs'] = [x['id'] for x in idx['verbs']][:7]
        self.assertTrue(any('at most 6' in p for p in v.problems(idx)))

    def test_compiled_verbs_match_the_catalog(self):
        self.assertEqual(v.compiled_verb_problems(HERE.parent), [])

    def test_version_format(self):
        idx = copy.deepcopy(INDEX); idx['version'] = 'latest'
        self.assertTrue(any('version must be' in p for p in v.problems(idx)))

    def test_an_agent_may_leave_its_steps_to_the_router(self):
        idx = copy.deepcopy(INDEX)
        pack = next(p for p in idx['personas'] if p['id'] == 'agent')
        self.assertEqual(pack['agent']['verbs'], [])
        self.assertEqual(v.problems(idx), [])
        pack['agent']['catalogVerbs'] = False
        self.assertTrue(any('agent.verbs is empty' in p for p in v.problems(idx)))

    def test_retention_accepts_default_and_none(self):
        # Phase FL.7: a private companion on the on-device model keeps nothing.
        idx = copy.deepcopy(INDEX)
        a, b = idx['personas'][0], idx['personas'][1]
        a['retention'] = 'default'
        b['retention'] = 'none'; b['model'] = 'on-device-only'; b.pop('memory', None)
        self.assertEqual([p for p in v.problems(idx) if 'retention' in p], [])

    def test_retention_rejects_other_values(self):
        idx = copy.deepcopy(INDEX)
        idx['personas'][0]['retention'] = 'forever'
        self.assertTrue(any('retention must be one of' in p for p in v.problems(idx)))
        idx['personas'][0]['retention'] = 7
        self.assertTrue(any('retention must be one of' in p for p in v.problems(idx)))

    def test_retention_none_must_be_on_device_only_and_offer_no_memory(self):
        idx = copy.deepcopy(INDEX)
        pack = idx['personas'][0]
        pack['retention'] = 'none'; pack['model'] = 'any'; pack['memory'] = {'optIn': True}
        found = v.problems(idx)
        self.assertTrue(any('needs model "on-device-only"' in p for p in found))
        self.assertTrue(any('cannot offer memory.optIn' in p for p in found))

    # Phase FL.10 (2026-11-16): a companion pack, and steps in a pack that keeps nothing.

    def companion(self, idx):
        return next(p for p in idx['personas'] if (p.get('agent') or {}).get('mode') == 'companion')

    def test_a_companion_says_how_each_step_is_asked_for(self):
        idx = copy.deepcopy(INDEX)
        pack = self.companion(idx)
        del pack['agent']['ask'][pack['agent']['verbs'][0]]
        self.assertTrue(any('agent.ask.' in p for p in v.problems(idx)))
        idx = copy.deepcopy(INDEX)
        self.companion(idx)['agent']['ask']['addToDo'] = ['task']   # one word would take ordinary sentences away from the chat
        self.assertTrue(any('two or more words' in p for p in v.problems(idx)))

    def test_a_companion_takes_only_the_steps_it_names(self):
        idx = copy.deepcopy(INDEX)
        self.companion(idx)['agent']['catalogVerbs'] = True
        self.assertTrue(any('only the steps it names' in p for p in v.problems(idx)))

    def test_a_private_pack_may_only_name_steps_that_say_what_they_keep(self):
        idx = copy.deepcopy(INDEX)
        pack = self.companion(idx)
        self.assertEqual(pack.get('retention'), 'none')
        pack['agent']['verbs'].append('makeQuiz')
        pack['agent']['ask']['makeQuiz'] = ['make a quiz']
        self.assertTrue(any('makeQuiz does not say what it keeps' in p for p in v.problems(idx)))

    def test_a_private_pack_pauses_before_a_write_and_never_searches(self):
        idx = copy.deepcopy(INDEX)
        self.companion(idx)['agent']['confirm'] = 'never'
        self.assertTrue(any('pauses before a step that writes' in p for p in v.problems(idx)))
        idx = copy.deepcopy(INDEX)
        self.companion(idx)['agent']['sources'] = ['duckduckgo']
        self.assertTrue(any('cannot search' in p for p in v.problems(idx)))
        idx = copy.deepcopy(INDEX)
        self.companion(idx)['agent']['mode'] = 'agent'
        self.assertTrue(any('only as a companion' in p for p in v.problems(idx)))
        idx = copy.deepcopy(INDEX)
        self.companion(idx)['agent']['localPlannerAllowed'] = True
        self.assertTrue(any("Apple's on-device model only" in p for p in v.problems(idx)))

    def test_media_and_offers_shapes(self):
        idx = copy.deepcopy(INDEX)
        pack = self.companion(idx)
        pack['media'][0]['path'] = 'personas/money-check-in/media/missing.m4a'
        self.assertTrue(any('not both' in p for p in v.problems(idx)), 'FL.12: the episodes are named by url (the bucket)')
        pack['media'][0].pop('url', None)
        self.assertTrue(any('is not in mchatai-source' in p for p in v.problems(idx, folder=HERE.parent)))
        idx = copy.deepcopy(INDEX)
        pack = self.companion(idx)
        pack['offers']['rules'].append(dict(pack['offers']['rules'][0]))
        self.assertTrue(any('two offers for' in p for p in v.problems(idx)))
        idx = copy.deepcopy(INDEX)
        self.companion(idx)['offers']['rules'][0]['verb'] = 'searchPapers'
        self.assertTrue(any('a step the pack does not have' in p for p in v.problems(idx)))
        idx = copy.deepcopy(INDEX)
        self.companion(idx)['offers']['rules'][1]['say'] = 'x' * 141
        self.assertTrue(any('at most 140 characters' in p for p in v.problems(idx)))

    def test_guides_shapes(self):
        # Phase FL.13: the pack's own answers, matched before any decline.
        self.assertEqual([p for p in v.problems(copy.deepcopy(INDEX)) if 'guides' in p], [])
        for change in (lambda g: g.update(ask=['Invest']), lambda g: g.update(say=''), lambda g: g.update(say='x' * 901),
                       lambda g: g.update(also='anxious'), lambda g: g.pop('id')):
            idx = copy.deepcopy(INDEX)
            change(self.companion(idx)['agent']['guides'][0])
            self.assertTrue(any('agent.guides' in p for p in v.problems(idx)))
        idx = copy.deepcopy(INDEX)
        guides = self.companion(idx)['agent']['guides']
        guides[1]['id'] = guides[0]['id']
        self.assertTrue(any('agent.guides' in p for p in v.problems(idx)), 'two guides with one id')

    def test_games_and_their_offer(self):
        # Phase FL.14: a published Hub game the pack offers; its offer verb is the app's own, never one of agent.verbs.
        self.assertEqual([p for p in v.problems(copy.deepcopy(INDEX)) if 'game' in p.lower()], [])
        self.assertTrue(self.companion(copy.deepcopy(INDEX)).get('games'), 'the pack carries its game')
        for change in (lambda g: g.update(url='http://example.com/'), lambda g: g.update(ask=['Play']),
                       lambda g: g.update(chapters=['two']), lambda g: g.pop('title'), lambda g: g.update(say=''),
                       lambda g: (g.pop('product'), g.pop('url'))):
            idx = copy.deepcopy(INDEX)
            change(self.companion(idx)['games'][0])
            self.assertTrue(any('game' in p for p in v.problems(idx)), 'a malformed game is refused')
        idx = copy.deepcopy(INDEX)
        self.companion(idx)['agent']['verbs'].append('openGame')
        self.assertTrue(any('keep it out of agent.verbs' in p for p in v.problems(idx)), 'an older build would route it')
        idx = copy.deepcopy(INDEX)
        self.companion(idx).pop('games')
        self.assertTrue(any('a pack with games' in p for p in v.problems(idx)), 'an offer with no game to open')

    def test_calculators_and_offer_chips(self):
        # Phase FL.15: sums the app works out, and offers as chips (a build without chips shows `say`).
        self.assertEqual([p for p in v.problems(copy.deepcopy(INDEX)) if 'calculators' in p or 'chip' in p], [])
        self.assertTrue(self.companion(copy.deepcopy(INDEX))['agent'].get('calculators'), 'the pack carries its calculators')
        for change in (lambda c: c.update(formula='compoundDaily'), lambda c: c.update(say=''), lambda c: c.update(ask='save'),
                       lambda c: c.update(missing='  ')):
            idx = copy.deepcopy(INDEX)
            change(self.companion(idx)['agent']['calculators'][0])
            self.assertTrue(any('agent.calculators' in p for p in v.problems(idx)), 'a malformed calculator is refused')
        idx = copy.deepcopy(INDEX)
        rule = next(r for r in self.companion(idx)['offers']['rules'] if 'button' in r)
        rule.pop('send')
        self.assertTrue(any('a chip needs both button and send' in p for p in v.problems(idx)))
        idx = copy.deepcopy(INDEX)
        self.companion(idx)['offers']['rules'].append({'verb': 'openTool', 'when': 'afterCalculation', 'say': 'Try the calculator.'})
        if not self.companion(idx).get('tools'):
            self.assertTrue(any('a pack with tools' in p for p in v.problems(idx)), 'an offer with no tool to open')

    def test_guard_repeat_name_and_assent_shapes(self):
        # A malformed field drops the whole guard in the app, advice patterns and all.
        self.assertEqual([p for p in v.problems(copy.deepcopy(INDEX)) if 'guard' in p], [])
        for field, value, message in [('noRepeats', 'yes', 'guard.noRepeats must be true or false'),
                                      ('shortNames', ['the handbook'], 'guard.shortNames must map'),
                                      ('shortNames', {'Money, Plainly': ''}, 'guard.shortNames must map'),
                                      ('assent', 'Yes. Answer it.', 'guard.assent must name {question}'),
                                      ('repeated', '  ', 'guard.repeated must be a line of text')]:
            idx = copy.deepcopy(INDEX)
            self.companion(idx)['guard'][field] = value
            self.assertTrue(any(message in p for p in v.problems(idx)), field)

    def test_every_note_of_a_companion_names_a_federal_source(self):
        """The pack's notes are generated (never hand-edited); "show me where that comes from" opens only what they carry."""
        notes = json.loads((HERE.parent / 'money-check-in' / 'chunks.json').read_text())
        for note in notes:
            self.assertTrue(note.get('sources'), note['id'])
            self.assertIsInstance(note.get('chapter'), int, note['id'])
            for source in note['sources']:
                host = source['url'].split('/')[2]
                self.assertTrue(source['url'].startswith('https://') and (host.endswith('.gov') or host == 'investor.gov'), source['url'])
                self.assertNotIn('ouinvest', source['url'])


if __name__ == '__main__':
    unittest.main()
