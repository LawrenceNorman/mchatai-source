import copy, json, sys, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import validate_verbs as v  # noqa: E402

NOUNS, CAPS, VERBS = v.load_catalog()


def verb(vid):
    return copy.deepcopy(next(x for x in VERBS if x['id'] == vid))


def check(verbs):
    return v.problems(NOUNS, CAPS, verbs)


class VerbCatalogTests(unittest.TestCase):
    def test_catalog_is_valid(self):
        self.assertEqual(check(VERBS), [])

    def test_compiled_copy_matches_the_catalog(self):
        self.assertEqual(v.compiled_problems(VERBS), [])

    def test_every_capability_is_used_by_a_verb(self):
        used = {x['capability'] for x in VERBS if x.get('capability')} | {s['capability'] for x in VERBS for s in x.get('steps') or []}
        self.assertEqual(used, {c['id'] for c in CAPS['capabilities']})

    def test_unknown_capability_is_refused(self):
        x = verb('readPage'); x['capability'] = 'web.deleteHistory'
        self.assertTrue(any('not in _capabilities.json' in p for p in check([x])))

    def test_under_declared_safety_is_refused(self):
        x = verb('createDocument'); x['safetyClass'] = 'read'
        self.assertTrue(any('uses a write capability' in p for p in check([x])))

    def test_network_must_be_declared(self):
        x = verb('readPage'); x['network'] = False
        self.assertTrue(any('declare network: true' in p for p in check([x])))

    def test_argument_must_belong_to_the_capability(self):
        x = verb('summarizeText'); x['arguments'].append({'name': 'tone', 'type': 'string', 'description': 'x'})
        self.assertTrue(any('not an argument of text.summarize' in p for p in check([x])))

    def test_reason_is_never_declared_by_content(self):
        x = verb('readPage'); x['arguments'].append({'name': 'reason', 'type': 'string', 'description': 'x'})
        self.assertTrue(any('added by the engine' in p for p in check([x])))

    def test_recipe_binding_to_unknown_field_is_refused(self):
        x = verb('podcastFromDocument'); x['steps'][1]['with']['text'] = '${doc.result.body}'
        self.assertTrue(any('offers result.' in p for p in check([x])))

    def test_recipe_binding_to_unknown_argument_is_refused(self):
        x = verb('summarizePageToDocument'); x['steps'][0]['with']['url'] = '${args.address}'
        self.assertTrue(any('no argument address' in p for p in check([x])))

    def test_recipe_binding_to_a_later_step_is_refused(self):
        x = verb('summarizePageToDocument'); x['steps'][0]['with']['url'] = '${gist.result.text}'
        self.assertTrue(any('no earlier step is called gist' in p for p in check([x])))

    def test_recipe_must_pass_required_arguments(self):
        x = verb('podcastFromDocument'); del x['steps'][2]['with']['script']
        self.assertTrue(any('misses required script' in p for p in check([x])))

    def test_capability_or_steps_not_both(self):
        x = verb('readPage'); x['steps'] = verb('summarizePageToDocument')['steps']
        self.assertTrue(any('exactly one' in p for p in check([x])))

    def test_dangerous_verb_cannot_be_an_intent(self):
        caps = copy.deepcopy(CAPS)
        caps['capabilities'].append({'id': 'files.deleteAll', 'summary': 'x', 'arguments': [], 'output': 'File',
                                     'result': ['count'], 'safetyClass': 'dangerous', 'network': False})
        x = verb('readPage'); x.update(capability='files.deleteAll', safetyClass='dangerous', appIntent=True, arguments=[])
        found = v.problems(NOUNS, caps, [x])
        self.assertTrue(any('never be an App Intent' in p for p in found))

    def test_tool_name_shape(self):
        x = verb('readPage'); x['id'] = 'web.readPage'; x['_file'] = None
        self.assertTrue(any('plain tool name' in p for p in check([x])))

    def test_compiled_records_drop_notes_and_sort(self):
        out = v.compiled_verbs(VERBS)
        self.assertEqual([o['id'] for o in out], sorted(o['id'] for o in out))
        self.assertFalse(any(k.startswith('_') for o in out for k in o))

    def test_route_words_are_single_lowercase_words(self):
        x = verb('extractPDF'); x['routeWords'] = ['PDF file']
        self.assertTrue(any('single lowercase' in p for p in check([x])))

    def test_route_on_address_needs_a_url_argument(self):
        x = verb('summarizeText'); x['routeOnAddress'] = True
        self.assertTrue(any('routeOnAddress' in p for p in check([x])))

    def test_eval_goals_name_real_verbs(self):
        self.assertEqual(v.eval_problems(VERBS), [])
        self.assertEqual(len(json.loads((v.IOS / '_evals' / 'goals.json').read_text())['goals']), 10)

    def test_four_ag2_verbs_keep_their_ids(self):
        ids = {x['id'] for x in VERBS}
        self.assertTrue({'searchPapers', 'readPaper', 'createDocument', 'createPodcast'} <= ids)


if __name__ == '__main__':
    unittest.main()
