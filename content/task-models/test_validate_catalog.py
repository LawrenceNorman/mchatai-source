import copy
import json
import unittest
from pathlib import Path

import validate_catalog as v

HERE = Path(__file__).resolve().parent
ENTRY = {
    'id': 'touchlanguage-spanish-gemma4-e2b', 'releaseID': '0.1.0-stock-6bit', 'version': '0.1.0',
    'displayName': 'TouchLanguage Spanish', 'task': 'conversation', 'languages': ['es'],
    'baseModel': 'google/gemma-4-E2B-it@' + 'a' * 40,
    'license': {'spdx': 'Apache-2.0', 'url': 'https://www.apache.org/licenses/LICENSE-2.0'},
    'compatibility': {'minimumIOS': '27.2', 'minimumMemoryGB': 8,
                      'testedDevices': [{'device': 'iPad mini (A17 Pro)', 'os': 'iOS 27.3'}]},
    'releaseStatus': 'preview', 'access': 'subscriber', 'summary': 'A Spanish tutor.', 'description': 'Talks.',
    'category': 'languages', 'applets': ['touchlanguage'], 'basedOn': 'Based on Google Gemma 4 E2B (unmodified)',
    'instructions': 'Target language: {{target}}. Level: {{levelLabel}}.',
    'sample': [{'role': 'learner', 'text': 'Hola.'}, {'role': 'model', 'text': '¡Hola! ¿Qué tal?'}],
    'assets': [{'id': 'ios-arm64-coreai-6bit', 'platform': 'ios', 'architecture': 'arm64', 'runtime': 'coreai',
                'url': 'mchatai-model://touchlanguage-spanish-gemma4-e2b/0.1.0-stock-6bit/ios-arm64-coreai-6bit',
                'archiveSizeBytes': 1, 'installedSizeBytes': 1, 'sha256': 'b' * 64, 'resourceTreeSHA256': 'c' * 64,
                'contextTokens': 4096, 'compression': '6bit', 'compressionLabel': 'compressed to 6-bit'}],
}


def catalog(*entries, version=2):
    return {'schemaVersion': version, 'models': [copy.deepcopy(e) for e in entries]}


class ValidateCatalogTests(unittest.TestCase):
    def test_public_catalog_file_is_valid(self):
        self.assertEqual(v.problems(json.loads((HERE / 'catalog.json').read_text())), [])

    def test_complete_v2_entry_passes(self):
        self.assertEqual(v.problems(catalog(ENTRY)), [])

    def test_identity_url_must_match_its_entry(self):
        bad = copy.deepcopy(ENTRY); bad['assets'][0]['url'] = bad['assets'][0]['url'].replace('0.1.0-stock-6bit', '0.0.9')
        self.assertTrue(any('url must be mchatai-model://' in p for p in v.problems(catalog(bad))))

    def test_http_urls_only_in_the_private_catalog(self):
        staged = copy.deepcopy(ENTRY); staged['assets'][0]['url'] = 'http://[fd8f::2]:8767/artifacts/x.zip'
        self.assertTrue(v.problems(catalog(staged)))
        self.assertEqual(v.problems(catalog(staged), private=True), [])

    def test_bucket_names_are_refused_anywhere(self):
        leaky = copy.deepcopy(ENTRY); leaky['description'] = 'bytes at gs://mchatai-user-projects/local-models/x'
        self.assertTrue(any('storage bucket' in p for p in v.problems(catalog(leaky))))

    def test_v2_listing_fields_and_enums(self):
        bare = {k: val for k, val in ENTRY.items() if k not in ('summary', 'access')}
        bare['releaseStatus'] = 'beta'
        found = v.problems(catalog(bare))
        for needle in ('missing summary', 'missing access', 'releaseStatus must be'):
            self.assertTrue(any(needle in p for p in found), needle)

    def test_v2_listing_must_say_what_the_weights_are(self):
        bad = copy.deepcopy(ENTRY); del bad['basedOn']; del bad['assets'][0]['compressionLabel']
        found = v.problems(catalog(bad))
        self.assertTrue(any('missing basedOn' in p for p in found), found)
        self.assertTrue(any('missing compressionLabel' in p for p in found), found)

    def test_duplicates_and_unknown_placeholders(self):
        odd = copy.deepcopy(ENTRY); odd['instructions'] = 'Speak {{dialect}}.'
        found = v.problems(catalog(ENTRY, odd))
        self.assertTrue(any('duplicate' in p for p in found))
        self.assertTrue(any('{{dialect}}' in p for p in found))

    def test_v2_task_vocabulary_and_recommendation(self):
        bad = copy.deepcopy(ENTRY); bad['task'] = 'speech'
        self.assertTrue(any('task must be one of' in p for p in v.problems(catalog(bad))))
        speech = copy.deepcopy(ENTRY)
        speech.update({'id': 'parakeet-tdt-0.6b-v3', 'task': 'transcription', 'languages': ['es', 'de', 'fr'],
                       'category': 'speech', 'applets': ['transcription'], 'instructions': None})
        speech['assets'][0]['url'] = 'mchatai-model://parakeet-tdt-0.6b-v3/0.1.0-stock-6bit/ios-arm64-coreai-6bit'
        speech['recommendation'] = {'useWhen': 'Transcribing Spanish or another European language.',
                                    'preferBuiltInWhen': 'English: the built-in transcriber is more accurate.',
                                    'languagesBest': ['es', 'de', 'fr'], 'surfaces': ['transcription', 'handsfree'],
                                    'windowSeconds': 20, 'runningMemoryGB': 1.7}
        self.assertEqual(v.problems(catalog(speech)), [])
        for broken, needle in (({'useWhen': ''}, 'useWhen'), ({'useWhen': 'x', 'surfaces': ['podcasts']}, 'surfaces'),
                               ({'useWhen': 'x', 'extra': 1}, 'unknown keys'), ({'useWhen': 'x', 'windowSeconds': 0}, 'windowSeconds')):
            e = copy.deepcopy(speech); e['recommendation'] = broken
            self.assertTrue(any(needle in p for p in v.problems(catalog(e))), needle)


if __name__ == '__main__':
    unittest.main()
