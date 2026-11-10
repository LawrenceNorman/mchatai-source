import copy, sys, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import validate_sources as v  # noqa: E402

SOURCES = v.load()


def get(sid):
    return copy.deepcopy(next(s for s in SOURCES if s['id'] == sid))


class SourceTests(unittest.TestCase):
    def test_packs_are_valid(self):
        self.assertEqual(v.problems(SOURCES), [])

    def test_the_five_planned_packs_exist(self):
        self.assertEqual({s['id'] for s in SOURCES}, {'arxiv', 'semanticscholar', 'openalex', 'pubmed', 'hackernews'})

    def test_template_must_be_https(self):
        s = get('arxiv'); s['search']['urlTemplate'] = 'http://example.com/?q={query}'
        self.assertTrue(any('https://' in p for p in v.problems([s])))

    def test_unknown_placeholder_is_refused(self):
        s = get('openalex'); s['search']['urlTemplate'] += '&key={apikey}'
        self.assertTrue(any('unknown placeholder' in p for p in v.problems([s])))

    def test_json_source_needs_a_field_map(self):
        s = get('hackernews'); del s['fields']['title']
        self.assertTrue(any('fields.title' in p for p in v.problems([s])))

    def test_unknown_adapter_is_refused(self):
        s = get('arxiv'); s['adapter'] = 'python'
        self.assertTrue(any('adapter must be' in p for p in v.problems([s])))

    def test_details_need_ids(self):
        s = get('pubmed'); del s['search']['idsPath']
        self.assertTrue(any('idsPath' in p for p in v.problems([s])))


if __name__ == '__main__':
    unittest.main()
