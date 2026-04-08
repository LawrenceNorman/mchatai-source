# mchatai-source

Public code registry for the [mChatAI](https://mchatai.com) platform. All executable artifacts — skills, mini-apps, games, microservices, templates, pipelines, and agents — live here with full version history, quality scores, and community contributions.

## Structure

```
skills/           JavaScript skills for mChatAI+ pipeline engine
miniapps/         HTML/JS mini-apps (web apps that run in mChatAI+)
games/            Web games (HTML/JS/CSS game bundles)
microservices/    Python services for mChatAIShell
templates/        Project templates for AIWizard / mchataiDev
swift-apps/       Swift macOS apps (Sources/ + Package.swift)
pipelines/        Pipeline definitions (JSON step configs)
agents/           Agent definitions (persona + skill bindings)
catalog.json      Master index of all artifacts
```

## How It Works

Every artifact has a `manifest.json` with metadata (name, version, description, dependencies, platform targets). The `catalog.json` at the root is the master index that all platform consumers read.

**Consumers:**
- **mChatAI+** — Discover Hub reads catalog for listings; install pulls artifact content
- **mChatAIShell** — Pulls microservices on launch; upgrades via `git pull`
- **mchataiDev** — "New from Registry" browser; "Publish" commits back
- **mchataiCloud** — Cloud functions pull tagged versions; auto-deploy on merge
- **DevAgents** — Browse via GitHub API, submit fixes as PRs

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for artifact format specs, quality requirements, and the PR process.

## Quality Scoring

Every artifact in `catalog.json` has a quality score (0.0–1.0):
- **0.3** — Automated tests pass
- **0.2** — Security scan clean
- **0.3** — User rating (community feedback)
- **0.2** — Download count tier

## License

Content in this repository is licensed under the [MIT License](LICENSE) unless individual artifacts specify otherwise in their manifest.
