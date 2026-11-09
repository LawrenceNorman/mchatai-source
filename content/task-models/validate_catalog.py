#!/usr/bin/env python3
"""Validate a task-model catalog (schema v1 or v2) before it is committed or staged.

  python3 content/task-models/validate_catalog.py content/task-models/catalog.json [--private]

`--private` is for the developer staging catalog: it allows http(s) asset URLs. The public catalog must
address hosted assets by identity (`mchatai-model://<id>/<releaseID>/<assetID>`) and never name a bucket.
Exit status 0 = valid; problems are printed one per line."""
import json
import re
import sys
from pathlib import Path

HEX64 = re.compile(r'^[0-9a-f]{64}$')
SAFE_ID = re.compile(r'^[a-z0-9][a-z0-9._-]{0,127}$')
# What TouchLanguageJobs.localInstructions renders; the last three are per-turn context (TLTurnContext).
PLACEHOLDERS = {'target', 'native', 'levelLabel', 'levelCEFR', 'maxSentences', 'personaName', 'personaRegion',
                'personaDetails', 'levelInstruction', 'correctionInstruction', 'lessonNotes', 'learnerNotes',
                'askedQuestions'}
STATUSES = {'preview', 'released', 'retired'}
ACCESS = {'subscriber', 'free'}
RUNTIMES = {'coreai', 'mlx'}
BUCKET_HINTS = ('gs://', 'storage.googleapis.com', 'storage.cloud.google.com', 'firebasestorage')
V1_REQUIRED = ('id', 'releaseID', 'version', 'displayName', 'task', 'languages', 'baseModel')
V1_ASSET = ('id', 'platform', 'architecture', 'url', 'archiveSizeBytes', 'installedSizeBytes', 'sha256',
            'resourceTreeSHA256', 'contextTokens', 'compression')
# basedOn and each asset's compressionLabel say, in words, what the weights are and what was done to them
# ("Based on Google Gemma 4 E2B (unmodified)", "compressed to 6-bit"); the app and the web card show them.
V2_REQUIRED = ('releaseStatus', 'access', 'summary', 'description', 'category', 'applets', 'basedOn')


def problems(catalog, private=False):
    found = []
    version = catalog.get('schemaVersion')
    if version not in (1, 2):
        return [f'schemaVersion must be 1 or 2, not {version!r}']
    if any(h in json.dumps(catalog) for h in BUCKET_HINTS):
        found.append('names a storage bucket; hosted assets are addressed by mchatai-model:// identity only')
    seen = set()
    for index, model in enumerate(catalog.get('models', [])):
        where = f"models[{index}] {model.get('id', '?')}@{model.get('releaseID', '?')}"
        for key in V1_REQUIRED + (V2_REQUIRED if version == 2 else ()):
            if model.get(key) in (None, '', []):
                found.append(f'{where}: missing {key}')
        for key in ('id', 'releaseID'):
            if model.get(key) and not SAFE_ID.match(model[key]):
                found.append(f'{where}: {key} must be lowercase letters, digits, ".", "_" or "-"')
        pair = (model.get('id'), model.get('releaseID'))
        if pair in seen:
            found.append(f'{where}: duplicate id and releaseID')
        seen.add(pair)
        if not (model.get('license') or {}).get('spdx'):
            found.append(f'{where}: missing license.spdx')
        if not (model.get('compatibility') or {}).get('minimumIOS'):
            found.append(f'{where}: missing compatibility.minimumIOS')
        for name in re.findall(r'{{\s*([A-Za-z]+)\s*}}', model.get('instructions') or ''):
            if name not in PLACEHOLDERS:
                found.append(f'{where}: unknown instructions placeholder {{{{{name}}}}}')
        if version == 2:
            if model.get('releaseStatus') and model['releaseStatus'] not in STATUSES:
                found.append(f"{where}: releaseStatus must be one of {sorted(STATUSES)}")
            if model.get('access') and model['access'] not in ACCESS:
                found.append(f"{where}: access must be one of {sorted(ACCESS)}")
            if not (model.get('license') or {}).get('url'):
                found.append(f'{where}: missing license.url')
            tested = (model.get('compatibility') or {}).get('testedDevices') or []
            if not tested:
                found.append(f'{where}: compatibility.testedDevices is empty (list the device tests that passed)')
            for line in model.get('sample') or []:
                if line.get('role') not in ('learner', 'model') or not line.get('text'):
                    found.append(f'{where}: sample lines are {{role: learner|model, text}}')
        assets = model.get('assets') or []
        if not assets:
            found.append(f'{where}: no assets')
        for asset in assets:
            at = f"{where} asset {asset.get('id', '?')}"
            for key in V1_ASSET:
                if asset.get(key) in (None, ''):
                    found.append(f'{at}: missing {key}')
            for key in ('sha256', 'resourceTreeSHA256'):
                if asset.get(key) and not HEX64.match(asset[key]):
                    found.append(f'{at}: {key} must be 64 lowercase hex characters')
            if version == 2 and not asset.get('compressionLabel'):
                found.append(f'{at}: missing compressionLabel (what was done to the weights, in words)')
            if version == 2 and asset.get('runtime') not in RUNTIMES:
                found.append(f'{at}: runtime must be one of {sorted(RUNTIMES)}')
            url = asset.get('url') or ''
            identity = f"mchatai-model://{model.get('id')}/{model.get('releaseID')}/{asset.get('id')}"
            if url.startswith('mchatai-model://'):
                if url != identity:
                    found.append(f'{at}: url must be {identity}')
            elif not (private and re.match(r'^https?://', url)):
                found.append(f'{at}: url must be {identity}' + ('' if private else ' (http(s) only with --private)'))
    return found


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    if len(args) != 1:
        print(__doc__)
        return 2
    path = Path(args[0])
    found = problems(json.loads(path.read_text()), private='--private' in argv)
    for line in found:
        print(line)
    if not found:
        print(f'{path}: valid')
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
