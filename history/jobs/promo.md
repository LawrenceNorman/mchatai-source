# Job: promo

Make one episode's promotion: a few posts that point people at the episode, each carrying a card or
a clip from it, held to the episode's own words, and put in the author's post queue, where he
approves each one. Read `README.md` here first: its rules bind every job.

The author, 2026-10-21: promote mChatAI through Pivotal Histories, on the queue his posting
assistant works from and on the series' own channels. Nothing here posts. Where the queue is, which
accounts exist and what each one takes are his settings, in `promo` of the workspace's
`client.json` (beside `stories/`); `promo.py` reads them, and this page never names them.

**The brief gives:** the story folder and the episode number; the author's direction in his words:
the destinations he wants (else every one in `promo.destinations`), a stretch he wants as the clip,
a date to start.

1. The episode must be out. `python3 history/tools/publish.py status stories/<slug>` shows its
   video uploaded and its podcast published; their addresses are what the posts link. An episode
   that is not out: stop and report.
2. **Cards.** `aislides.renderCards {deck: <the episode's deck: project.json video.<n>.deck>}`
   writes every slide as a 16:9 picture, which X, Bluesky and Threads show whole; add `width: 1080,
   height: 1080` for a square one (Instagram): the whole slide in the middle over a blurred copy of
   itself. Each card in the reply has its `path`, its `title` and the line it goes with (`notes`).
   Pick one or two that mean something with no voice over them: a fact card whose caption says
   what the number is, a quote card whose words make sense alone, a picture with its caption. Open
   each one (read the PNG) and look; a card that says nothing on its own, choose another. Copy the
   picks into `promo/<n>/`. `check` refuses a picture over 5 MB and says how to make it a JPEG.
3. **The clip.** `python3 history/tools/promo.py windows stories/<slug> <n>` lists the stretches of
   30 to 60 seconds that start and end with whole lines, with their words and the cards on screen.
   Pick one that stands on its own: it opens on a line that sets the scene and ends on one that
   lands, and it gives away nothing of how the story ends that the episode's own title does not.
   Then `aividrecorder.clip {path: <publishing.<n>.video.export>, start, end, frame: "vertical"}`
   (Reels, Shorts, TikTok): the whole widescreen picture in the middle over a blurred copy of
   itself, its captions as small as the episode's on a phone. `"square"` or `"original"` when a
   destination wants that frame instead. Copy the clip into `promo/<n>/`.
4. **The posts** (your own judgement, the one model step): write `promo/posts-<n>.json` in the
   shape `promo.py`'s header gives, one post per destination. Each post:
   - opens with what happened, in the episode's own facts, said plainly: never a question, a
     teaser or "you won't believe";
   - uses numbers and quotations only as the episode says them (`check` holds this);
   - names the series, the story and the part ("Pivotal Histories: The Siege of Alesia, part 3
     of 6");
   - links one address, the episode's video (its podcast page where the destination is about
     listening), never a shortened link;
   - says the destination's `mustSay` in one plain line where it has one;
   - carries no hashtags unless the destination's `rules` ask for them;
   - names its `media` (what the destination's `media` takes: pictures, the video, or either),
     each with `shows`: one line saying what is on it ("The Siege of Alesia, part 3: the card
     'Caesar's ditches were twenty feet wide' over the 1720 plan of Mont Auxois");
   - has a `suggestedDate`, a day after the last episode's posts to that destination.
5. `python3 history/tools/promo.py check stories/<slug> <n>` until it says CLEAN.
6. `python3 history/tools/promo.py queue stories/<slug> <n> --dry-run`; read what it would do, then
   run it without `--dry-run`. The cards and the clip are copied into the picture folder with what
   each shows, and each post becomes a row with Approval Pending. A row the author approved, or one
   that went out, is never rewritten: a change to it is made in the queue.

**Done when** `check` says CLEAN and `queue` has run. Never post, never approve a row, never touch
the queue's other rows.

**The series' own channel.** A vertical clip under three minutes can also go up on the series'
YouTube channel as a Short. That is an upload like the episodes': the assistant's thread does it,
after the author has watched the clip; a job never uploads.

**Report:** the cards and the clip (their paths; the clip's start and end and its words), each
post's destination and first line, `check`'s result, the row IDs queued, and any row kept as it was.
