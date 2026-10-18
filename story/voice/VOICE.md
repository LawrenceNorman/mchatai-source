# Listening to the author: their edits become voice rules

When the author has edited chapters an agent wrote, their changes are the best evidence of their
voice. You turn that evidence into rules the author can accept, one at a time. You never change
the voice on your own, and you never change their text.

The book keeps its voice in two files in its working folder: `voice/voice.md` (the rules in
words, one version per accepted batch) and `voice/lint-rules.project.json` (the rules a checker
can enforce). The writer agent reads the first and its drafts are gated by the second.

## 1. Read the edits

Save `storymaker.listEdits {project}`'s result as `voice/edits.json`. Each edit has an `id`, the
agent's text (`before`), the author's (`after`), and a `source`: only `author` edits are
evidence. An accepted suggestion is the agent's own text.

## 2. Sort them

- **Fact**: a changed name, number, date or rule of the world. That is a correction to the bible,
  not the voice: tell the author what the bible should now say, and change it only with their OK.
- **Cut**: a passage removed. Several cuts of the same kind (an explaining last line, a recap of
  the last chapter) are evidence.
- **Style**: wording. Several changes the same way (a stock gesture replaced, a kind of sentence
  rewritten) are evidence.
- **Taste**: what the author prefers that no pattern can catch (shorter scenes, less interior
  monologue). Still a rule, but unenforced.

## 3. Propose rules

When at least two of the author's edits point the same way, write `voice/proposal.json`:

```json
{"rules": [{"id": "no_nodding", "say": "Characters don't nod to agree; they say or do something.",
            "kind": "style", "edits": ["<edit id>", "<edit id>"],
            "pattern": "\\bnodd(?:ed|ing|s)\\b"}]}
```

`say` is the rule in plain words, as the author would put it. `pattern` (a regular expression,
for a phrase-level rule) must catch what the agent wrote in those edits and must not catch
anything the author wrote. Leave it out for a rule no pattern can enforce; the rule is then
recorded as unenforced. Add `"in": "all"` only for a rule about dialogue too.

## 4. Check them

    python3 story/tools/voice_rules.py check --edits voice/edits.json voice/proposal.json

It refuses a rule citing an edit that is not the author's or does not exist, a rule with fewer
than two edits, a pattern that misses the edits it cites, and a pattern that would flag the
author's own words (that rule is not their voice). Fix the rule, or drop it.

## 5. Ask the author

For each rule: the rule in plain words, the edits that suggest it (what was written → what they
made it), and whether it will be enforced. Ask which ones to keep. Never add a rule they did not
choose.

## 6. Record what they kept

    python3 story/tools/voice_rules.py apply --voice voice/voice.md --overlay voice/lint-rules.project.json \
        --edits voice/edits.json --accept no_nodding,... --author-said "<their words>" voice/proposal.json

It adds a new version of `voice.md` naming the edits behind each rule, and the enforceable rules
to the overlay. From then on every draft is checked with
`python3 story/tools/prose_lint.py chapter <file> --also voice/lint-rules.project.json`.
