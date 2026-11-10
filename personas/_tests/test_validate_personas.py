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


if __name__ == '__main__':
    unittest.main()
