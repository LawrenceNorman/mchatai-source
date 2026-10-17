# Agents for StoryMaker books

Claude Code agent definitions for book work (STORYMAKER_AUTHORSHIP_PLAN.md QG.2). Each pins its
model in its own frontmatter, so the drafting and checking stay on the strongest model while the
thread that coordinates them may run on a lighter one. The model is content: change it here, by
PR, never in the app.

| Agent | Does | Model |
|---|---|---|
| `story-chapter-writer` | drafts one NEW chapter, runs `story/tools/prose_lint.py` until it passes | opus |
| `story-continuity-auditor` | checks one chapter against the bible and Stat Changes; edits nothing | opus |
| `story-cold-reader` | reads one chapter with no bible; reports confusion and attention | opus |

Install in a Workbench thread's working folder (the `story` folder is linked there by the
assistant's `workdirLinks`):

    mkdir -p .claude/agents && cp story/agents/story-*.md .claude/agents/

The author's text always wins: no agent here replaces or inserts text in a chapter the author has
touched. Changes to it are suggestions the author accepts or rejects.
