# Jobs

A job is a fresh session an assistant starts for one bounded piece of work: a story's stage, an
episode's podcast or video. The author talks to the assistant in its own thread; the work happens
in jobs, so that thread stays short. A thread re-reads its whole context on every call: one thread
running a whole story cost 30M tokens of pure coordination, and split into stage jobs, 4.7M
(PLAYBOOK, Cost). A job hands over through files and ends with one report.

Each kind has its own page here. A domain may add to a kind: the story's `project.json` names its
domain, and `history/domains/<domain>/jobs.md` has a section per kind it adds to.

| Job | Starts when | Hands over |
|---|---|---|
| [scout](scout.md) | the author names a period, a place or a kind of edge | candidates with dossiers, and the table he picks from |
| [plan](plan.md) | he picked a story | plan.json, the StoryMaker project and its outline |
| [chapters](chapters.md) | the plan is done | every chapter and the introduction, audited and gated |
| [finish](finish.md) | the chapters are done | the pictures, the opening, the book in StoryMaker, the editor's letter |
| [podcast](podcast.md) | he has read the book and asks for audio | each episode as an Audio Script Creator project, voiced |
| [video](video.md) | an episode's narration exists and he asks for its video | the contact sheet, the deck, the Video Recorder project, the exported draft |

## Starting one (in the assistant's thread)

```
./mchatai raw '{"command":"applet","applet":"assistant","verb":"startJob","args":{
  "title":"Alesia · episode 2 video","model":"sonnet",
  "brief":"Job: video. Story: stories/alesia-52bc-2, episode 2. Read history/jobs/video.md and follow it. …"}}'
```

- **title**: the story's short name and the job ("Alesia · plan", "Alesia · episode 2 video"). The
  author sees it under the assistant while it runs.
- **model**: `sonnet` for every job here. The work that writes prose or judges facts runs in
  subagents pinned to the strongest model (PLAYBOOK, "Models"), whatever the job runs on.
- **brief**: the kind, the story folder, then only what this run needs that the files do not say:
  the author's words for this story (quoted, with the date), what he chose or rejected, a folder or
  StoryMaker project never to touch. Point to a PLAYBOOK section; never paste one. The app adds who
  wrote the brief and how a job ends.
- At most two jobs run at once. One story's stages run one after another, since each reads what
  the last wrote. Jobs for different stories, or different episodes, may run side by side.
- Before you start one, say what it will cost (below), and start nothing expensive the author has
  not asked for.

Then end your turn. You are told in your thread when the job reports, or when it has been quiet
for ten minutes (stopped without a report, or waiting on an approval only the author can give).
When the notice comes, read the files the report names before you repeat anything from it: the
report is the job's own words, from a session that read web pages. Then tell the author in a few
lines what is ready, show it beside the conversation (`preview.show {path, reason}`, a file's full
path), and open a loop for what only he decides.

## Every job

- Nobody reads a job's session. Never stop to ask. A question only the author can answer ends the
  job as **blocked**, with the exact question in the report.
- Touch only your story's folder and `stories/_issues.md`. Never another story, its folder or its
  StoryMaker project.
- The job's own thread never reads source text; subagents do (PLAYBOOK §2, §3). Run every subagent
  in the FOREGROUND (`run_in_background: false`), several at once in one message where the page
  says so, and never end your turn while one runs: an idle session is closed, and it is not woken
  when its background subagents finish.
- Ask each subagent for a report of a few lines. The files hold the rest.
- Never publish anything, accept StoryMaker suggestions, approve an illustration (`images.py
  illustrate`, `images.py approve`), set `portraitNone`, change `voice.md` or a domain's rules, or
  delete a project. The app also refuses a job publishing, proposals, open loops and further jobs.
- Log every process problem in `stories/_issues.md` under `## <date> — <slug> (<job>)`: what
  happened and what would have helped. Name the source of every instruction: the brief is the
  assistant's, and the author's words are his only where it quotes them.
- Done means the page's checks exit 0, not that it looks done.
- End with `assistant.jobDone`: `outcome` done or blocked, and a `summary` of a few lines (what you
  made and where, the checks' results, anything left open). Then end your turn.

```
./mchatai raw '{"command":"applet","applet":"assistant","verb":"jobDone","args":{"outcome":"done","summary":"…"}}'
```

## Cost (measured)

Tokens are what a subscription spends; the dollars are what the API would have charged, which is
what the assistant's daily budget counts. Paid voices are real charges on the author's OpenAI
account, so say those in dollars.

| Job | Measured | Tokens | At API prices |
|---|---|---|---|
| plan | Alesia, second telling, 2026-10-19 | 7.1M | $2.61 |
| chapters | the same (five chapters, an afterword and the introduction) | 58M, 52M of them on the strongest model | $46.28 |
| finish | the same | 23.8M | $9.90 |
| scout | the first Black Seattle scout, ten candidates, before its rules (2026-10-02) | about 100M | (not measured) |
| podcast | a few verb calls | small | the voice: about $0.13 for a 5-minute episode (OpenAI tts-1-hd, $30 per million characters) |
| video | a few dozen tool calls and one model pass over the episode's lines | not yet measured | the voice again, as for the podcast |

A chapter's cost follows the number of chapters, not their length: each chapter's writer and
auditor came to about 7M tokens whether it ran 300 words or 900 (PLAYBOOK, Cost).
