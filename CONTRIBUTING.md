# Contributing to mchatai-source

We welcome contributions! Whether you're fixing a bug in a skill, adding a new mini-app, or improving a microservice, here's how to participate.

## Artifact Formats

### JavaScript Skills (`skills/{skillID}/`)
```
skills/{skillID}/
  skill.js          # Main skill code (CommonJS, runs in JavaScriptCore)
  manifest.json     # Required metadata
  test-input.json   # Mock SkillData for testing (optional)
  README.md         # Description and usage (optional)
```

**manifest.json:**
```json
{
  "id": "community.my-skill",
  "name": "My Skill",
  "version": "1.0.0",
  "description": "What this skill does",
  "author": "your-github-handle",
  "license": "MIT",
  "platforms": ["mchatai-plus", "mchatai-shell"],
  "configSchema": {
    "apiKey": { "type": "credential", "required": false }
  }
}
```

### Mini-Apps (`miniapps/{appID}/`)
```
miniapps/{appID}/
  index.html        # Main content (self-contained or multi-file)
  manifest.json     # Required metadata
  MINIAPP.md        # App manifest (name, permissions, description)
```

### Games (`games/{gameID}/`)
```
games/{gameID}/
  play/
    index.html      # Entry point
    game.js         # Game logic
    game.css        # Styles
  game.json         # Game metadata (engine, rules, theme)
  manifest.json     # Registry metadata
```

### Microservices (`microservices/{serviceID}/`)
```
microservices/{serviceID}/
  main.py           # Entry point
  requirements.txt  # Python dependencies (optional)
  manifest.json     # Required metadata
  tests/            # Tests (optional but encouraged)
```

### Pipelines (`pipelines/{pipelineID}/`)
```
pipelines/{pipelineID}/
  pipeline.json     # Pipeline definition (steps + config)
  manifest.json     # Required metadata
  README.md         # Description and usage
```

## Pull Request Process

1. Fork this repository
2. Create a branch: `git checkout -b fix/skill-name` or `feat/new-miniapp`
3. Make your changes
4. Ensure your artifact has a valid `manifest.json`
5. If adding a new artifact, add an entry to `catalog.json`
6. Submit a PR with a clear description of what changed and why

## Quality Requirements

- All code must be functional and tested (manual testing is fine for small changes)
- No hardcoded API keys, secrets, or credentials
- No malicious code, tracking pixels, or data exfiltration
- Skills must handle errors gracefully (try/catch, meaningful error messages)
- Mini-apps must work offline (no required external API calls on load)

## Version Bumping

When updating an existing artifact, bump the version in `manifest.json`:
- **Patch** (1.0.1): Bug fixes, typo corrections
- **Minor** (1.1.0): New features, non-breaking changes
- **Major** (2.0.0): Breaking changes to config schema or behavior

## AI-Generated Contributions

PRs from DevAgents (AI-generated fixes) are welcome and go through the same review process as human contributions. Please tag them with `ai-generated` in the PR description.
