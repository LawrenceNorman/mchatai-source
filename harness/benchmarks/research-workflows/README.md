# Research Workflow A/B Benchmark

This suite is an internal DRACO-style pilot. It lets mChatAI+ compare:

- `research-cold-baseline`: the existing generic DRACO research prompt.
- `research-harness-profile`: the same cases with the mChatAI deep-research system prompt and research Lego profile.
- `research-claude-code-baseline`: the same cases through a cold Claude Code dev session, writing `answer.md` in an isolated benchmark work directory.

The cases are not a replacement for the external Perplexity DRACO dataset. They are a stable prompt catalog for fast local iteration before spending time and tokens on the full external 100-case run.

## Dry Run

After updating `mchatai-source`, refresh the app-side cache first:

```json
{"command":"refreshMchataisourceCache","requestID":"research-cache-refresh-001"}
```

Use the mChatAI+ DebugTestTunnel:

```json
{"command":"diagBenchmarkRun","suiteID":"research-cold-baseline","caseLimit":2,"dryRun":true,"requestID":"research-cold-dry-001"}
```

```json
{"command":"diagBenchmarkRun","suiteID":"research-harness-profile","caseLimit":2,"dryRun":true,"requestID":"research-harness-dry-001"}
```

```json
{"command":"diagBenchmarkRun","suiteID":"research-claude-code-baseline","caseLimit":1,"dryRun":true,"requestID":"research-claude-dry-001"}
```

## Real Pilot

Start with one or two cases:

```json
{"command":"diagBenchmarkRun","suiteID":"research-cold-baseline","caseLimit":2,"criteriaLimit":5,"requestID":"research-cold-001"}
```

```json
{"command":"diagBenchmarkRun","suiteID":"research-harness-profile","caseLimit":2,"criteriaLimit":5,"requestID":"research-harness-001"}
```

```json
{"command":"diagBenchmarkRun","suiteID":"research-claude-code-baseline","caseLimit":1,"criteriaLimit":5,"requestID":"research-claude-001"}
```

Then inspect:

```json
{"command":"diagBenchmarkReport","requestID":"research-report-001"}
```

## Metrics Already Recorded

The existing benchmark report captures score, pass/fail status, latency, provider/model, judge provider/model, input/output/cache tokens when available, estimated cost when provider metadata exposes it, criteria evaluated/met/failed, session IDs, and report paths.

The Claude Code runner additionally records `turnCount` when reported by mChatAIShell, plus `totalSteps`, `completedSteps`, `failedSteps`, `elapsedSeconds`, `workDir`, and `answerPath` in per-case details.

## Next Runner

If `turnCountSource` is `unavailable`, rebuild/relaunch mChatAIShell so its status endpoint includes Claude Code `num_turns` metadata. Older shell builds still run the suite but can only report step counts.
