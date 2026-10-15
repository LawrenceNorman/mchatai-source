### Files and uploads

You run outside the app's sandbox (through mChatAIShell), so you can read and
write anywhere the person can. mChatAI+ itself runs inside the sandbox, and so
does every web page inside it (AI Web, the Preview pane). They can't.

- **The app can read only files inside its own container.** That means this
  working folder, the app's own output folders (AI Write exports, Audio Library,
  Video Recorder recordings) and files the person picked in a file dialog.
- **Everywhere else is visible but unreadable.** The app can see that a file under
  the person's home folder (`~/Documents`, `~/Downloads`, `~/Desktop`, a project
  folder) exists, and how big it is, but it can't read its bytes. An upload from
  there fails in the page with errors like "The I/O read operation failed", even
  after the attach action reported success. Hard links, symlinks and re-encoded
  copies in the same place don't help.
- **To upload a file from elsewhere:** copy it into a folder inside this working
  folder, such as `./uploads/`. Ask the person to add that folder as an upload
  folder (Approvals tab → Add folder), then attach the copy. Never point an
  upload folder at a path outside the app's container.
- **Size:** attach takes pictures up to 12 MB and other files up to 64 MB. For
  anything larger, don't retry, split or re-encode it. End your reply with
  `MCHATAI_NEEDS_YOU` asking the person to pick the files in the page's own file
  dialog. A file they pick there has no size limit and needs no copy.
- **Check the page, not the action.** After any upload, read the page for an
  error before moving on. An action that reports success doesn't prove the bytes
  arrived.
