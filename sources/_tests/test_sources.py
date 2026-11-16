import copy, sys, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import validate_sources as v  # noqa: E402

SOURCES = v.load()
KINDS = v.load_kinds()


def get(sid):
    return copy.deepcopy(next(s for s in SOURCES if s['id'] == sid))


class SourceTests(unittest.TestCase):
    def test_packs_are_valid(self):
        self.assertEqual(v.problems(SOURCES), [])

    def test_the_planned_packs_exist(self):
        self.assertEqual({s['id'] for s in SOURCES}, {'arxiv', 'semanticscholar', 'openalex', 'pubmed', 'hackernews', 'duckduckgo', 'wikipedia'})

    def test_web_search_is_the_default_and_the_site_finder_reads_real_sources(self):
        """Phase AV.19: an open search with no kind asked covers the web, not arXiv first; the site finder names sources that exist."""
        self.assertEqual(KINDS['defaultKinds'], ['web'])
        everything = SOURCES + v.news_sources(KINDS)
        self.assertEqual(v.site_finder_problems(KINDS, everything), [])
        ddg = next(s for s in SOURCES if s['id'] == 'duckduckgo')
        self.assertEqual(ddg['adapter'], 'site')
        self.assertIn('duckduckgo.com', ddg['links']['skipHosts'])
        self.assertEqual(v.site_finder_problems(dict(KINDS, siteFinder={'sources': ['nope'], 'limit': 8}), everything),
                         ['_kinds.json: `siteFinder.sources` must list source ids that exist'])

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

    def test_kinds_are_valid(self):
        self.assertEqual(v.kinds_problems(KINDS, SOURCES), [])
        self.assertIn('news', KINDS['personal'])

    def test_news_comes_from_the_ai_news_feeds_not_the_archives(self):
        self.assertFalse(any('news' in s['kinds'] for s in SOURCES), 'the source packs are archives and Hacker News')
        news = v.news_sources(KINDS)
        self.assertGreaterEqual(len(news), 30)
        self.assertEqual(v.problems(news) + v.kinds_problems(KINDS, news) + v.region_problems(KINDS, news), [])
        self.assertTrue(all('news' in s['kinds'] and s['id'].startswith('news-') for s in news))
        searchable = [s for s in news if '{query}' in s['search']['urlTemplate']]
        self.assertEqual([s['id'] for s in searchable], ['news-gnews-local'], 'one news source takes search words: any place or topic')
        self.assertFalse(any('{' in s['search']['urlTemplate'].replace('{query}', '') for s in news), 'every locale placeholder is filled')

    def test_a_source_needs_known_kinds(self):
        s = get('arxiv'); s['kinds'] = ['gossip']
        self.assertTrue(any('kinds must be' in p for p in v.kinds_problems(KINDS, [s])))
        del s['kinds']
        self.assertTrue(any('missing kinds' in p for p in v.kinds_problems(KINDS, [s])))

    def test_kind_words_are_lowercase(self):
        kinds = copy.deepcopy(KINDS); kinds['kinds']['news'].append('News')
        self.assertTrue(any('lowercase' in p for p in v.kinds_problems(kinds, SOURCES)))

    def test_details_need_ids(self):
        s = get('pubmed'); del s['search']['idsPath']
        self.assertTrue(any('idsPath' in p for p in v.problems([s])))


if __name__ == '__main__':
    unittest.main()
