# Link Validator

Probes every http(s) URL found in the input text (HEAD, with GET retry on
405/501/403/network-miss) and appends a `## Link Check` markdown report:
per-URL status, dead-link list, and a machine-readable summary line:

```
LINKCHECK_SUMMARY {"total":12,"alive":10,"dead":2,"deadLinkRate":0.17}
```

## Why

Research pipelines (Web Research Brief, competitor scans, lead lists) emit
URLs that are sometimes stale or hallucinated — about half the company
websites in one canary run were 404s. Appending this skill as a final
pipeline step (or invoking it standalone on a pipeline's output) makes
dead-link rate a first-class QA signal.

## Config

| Key | Default | Notes |
|---|---|---|
| `maxLinks` | 20 | clamp 1-50 |
| `timeoutSeconds` | 8 | per-URL, clamp 2-30 |
| `failOnDeadLinks` | false | set "true" to fail the step when rate exceeds threshold |
| `deadLinkThreshold` | 0.2 | only used with failOnDeadLinks |
| `reportOnly` | false | "true" emits only the report (drops original text) |

## Canary usage

```json
{"command":"runSkill","skillID":"custom.linkValidator","input":"<pipeline output text>","config":{},"requestID":"lv-001"}
```

Parse the `LINKCHECK_SUMMARY` line from the output; assert `deadLinkRate < 0.2`.
