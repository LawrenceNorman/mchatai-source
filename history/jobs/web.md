# Job: web

Rebuild the series' site with what is out now: each published story as a small book, and each part's
video and podcast linked from it (PLAYBOOK §6). Read `README.md` here first: its rules bind every job.

**The brief gives:** the series id and why it is being rebuilt (a story published, an episode out,
the author's change to the text).

1. Which stories the site carries is the author's decision, story by story: a story goes in only
   when its `project.json` records his review (PLAYBOOK §6, step 4; `review.asStands` when he
   published the text as it stands). `python3 history/tools/series_book.py status stories <series>`
   says what each story waits on. Never write a review into `project.json` yourself.
2. `python3 history/tools/series_book.py build stories <series> web --publish`, in the assistant's
   folder: mChatAI+ reads only its own folders, so the site is built here, never elsewhere. It reads
   every chapter back from StoryMaker, so the author's edits are what the site shows. Each part's
   Watch and listen links come from the story's publishing record (`publish.py`), the series'
   channels from the workspace's `client.json` `media`.
3. A build that refuses a story or a picture says why; report it, do not work around it.

**Done when** `web/index.html` is built with no refusal you have not reported. Never deploy: putting
the site live is the author's call, made in the assistant's thread.

**Report:** the stories the site carries (and those it left out, with why), each story's parts and
which have a video and a podcast linked, and the build's size.

## Putting it live (the assistant's thread, not the job)

Show the author `web/index.html` beside the conversation (`preview.show {path, reason}`), then
`hub.deploy {folder: "web", slug, name, tags}` with `slug`, `name` (`appName`) and `tags` from
`client.json` `deploy`. The app asks him to approve the publish; the reply names the address. Never
fetch the address before its first deploy: the CDN keeps that 404 for ten minutes.
