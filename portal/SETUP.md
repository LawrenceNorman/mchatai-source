# Connect Claude Code (or Codex) to mChatAI+

Once connected, you can talk to your coding assistant in plain English and it
will drive mChatAI+ for you — build mini-apps and games, fix them, write skills
and pipelines, and add content to applets like LoopStar and ToonStudio.

Everything you need is already on your Mac: mChatAI+ keeps this folder in sync
automatically. Setup is three short steps and takes about a minute.

---

## Before you start

- **mChatAI+ installed and open.**
- **A coding assistant installed** — [Claude Code](https://claude.com/claude-code)
  or OpenAI Codex CLI.
- **Which version of mChatAI+ do you have?** If you downloaded it from
  mchatai.com, all of this works. If you installed it from the Mac App Store,
  skip to [Mac App Store users](#mac-app-store-users) — App Store rules mean
  that version connects a different way.

Throughout, `<CACHE>` means this folder:

```
~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source
```

---

## Step 1 — Turn on the portal

mChatAI+ only listens for commands when you ask it to. Quit the app, then
relaunch it this way:

```bash
open -a mChatAI --args --mchatai-tunnel
```

That's it — the app looks and works exactly as usual, it just also accepts
commands now. (You can add this to a Login Item or a shell alias if you want it
every time.)

## Step 2 — Add the `mchatai` command

```bash
mkdir -p ~/bin
ln -s "$HOME/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source/portal/bin/mchatai" ~/bin/mchatai
```

If `~/bin` isn't on your PATH yet, add this line to `~/.zshrc`:

```bash
export PATH="$HOME/bin:$PATH"
```

Open a new terminal, then check everything at once:

```bash
mchatai doctor
```

It prints a checklist and tells you exactly how to fix anything that isn't
ready. Re-run it any time something feels off — it is the one command to
remember.

## Step 3 — Teach your assistant about mChatAI+

**Claude Code:**

```bash
mkdir -p ~/.claude/skills
ln -s "$HOME/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source/portal/skills/mchatai-portal" ~/.claude/skills/
```

Because that's a link into the synced folder, it updates itself whenever
mChatAI+ syncs — you never reinstall it.

**Codex (or any assistant that reads `AGENTS.md`):** link the guide into
whatever project you're working in:

```bash
ln -sfn "$HOME/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source/portal/AGENTS.md" ./AGENTS.md
```

Use a **link, not a copy**. The guide changes when mChatAI+ syncs, and a stale
copy is worse than none — it makes your assistant answer from an out-of-date
file instead of asking the running app.

---

## Try it

Start your assistant and just ask for something:

> "What can mChatAI+ do? List the skills."

> "Build me a dice game in mChatAI+."

> "The chess mini-app has a bug where castling is allowed through check — fix it."

> "Add a swing feel to the boombap LoopStar pack."

You don't need to know any commands. The assistant discovers what's available,
runs it, checks the result, and iterates.

If you're curious what it's doing, these are the same commands it uses:

```bash
mchatai manifest          # everything the assistant is allowed to do
mchatai skills            # skills installed in your app
mchatai extension-points  # which applets you can add content to
mchatai status            # what the app is working on right now
```

---

## When something goes wrong

**Run `mchatai doctor` first.** It checks each piece and gives you the fix.

| What you see | What it means |
|---|---|
| `mChatAI+ is not running` | Open the app. |
| `app is not listening` | Relaunch with `open -a mChatAI --args --mchatai-tunnel` (Step 1). |
| `portal content missing` | Open mChatAI+ and let it sync, or run `mchatai raw '{"command":"refreshMchataisourceCache"}'`. |
| `no response after Ns` | The app is busy building something. Wait, or pass a longer `--wait 300`. |
| A build says it failed but the app looks fine | Sometimes true — the checker is stricter on tool-style apps than game-style ones. Open it and judge for yourself. |

**Content you edited isn't showing up?** mChatAI+ syncs content from GitHub. If
you edited files locally without publishing them, run
`mchatai raw '{"command":"invalidateMchataisourceCaches"}'` instead — that
re-reads what's on disk without fetching.

---

## Mac App Store users

The App Store version can't listen for terminal commands — Apple's rules don't
allow it. It connects through **Shortcuts** instead, which works from the
terminal too:

```bash
shortcuts run "mChatAI Portal Info"
shortcuts run "List mChatAI Skills" -o -
shortcuts run "Open mChatAI Applet"
```

Your assistant can use those the same way. Building and iterating on artifacts
needs the version from mchatai.com.

---

## What your assistant can actually do

- **Build and fix** mini-apps, games, and documents, then check its own work.
- **Add content to applets** — LoopStar packs and phrases, ToonStudio puppets
  and backdrops, StoryMaker prompts, and more. Run `mchatai extension-points`
  to see the full list with an example file for each.
- **Write skills and pipelines** that become part of your app.
- **Publish** what you make to the Community Hub.

It cannot recompile mChatAI+ itself, and it won't install anything on your
machine without you asking.

---

*Reference: `portal/AGENTS.md` is the technical version of this page, written
for the assistant rather than for you.*
