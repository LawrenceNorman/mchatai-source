# slides-pptx — context for anyone extending it

- **The app is the source of truth for layout.** Positions here mirror
  `SlideRenderView.swift` (1920×1080 design units → 13.333×7.5 in). When a layout changes
  there, change `_layout_*` here in the same PR, or the PowerPoint drifts from the PDF.
- **Charts arrive resolved.** `slide.chart` carries categories/values (or a table, or stats)
  computed by the app's `ChartDataResolver`; this service never touches Ledger.
- **Inline Markdown** (`**bold**`, `*italic*`, `` `code` ``, `[text](url)`) becomes runs, so
  the text stays editable in PowerPoint.
- New layout = a new `_layout_<id>` function + an entry in `LAYOUTS`. Unknown layouts fall back
  to bullets, the same rule as the app.
- **Quick Look needs two quirks.** A deck with speaker notes must declare a notes master
  (`_register_notes_master`) or Quick Look renders every slide blank, and it drops a chart whose
  legend has `include_in_layout = False`, so pies draw their legend as shapes instead.
- **The service installs its own dependency.** mChatAIShell before 2026-09-29 never installed new
  `python_deps` (its pip line broke under zsh), so `_pptx()` installs python-pptx on first use and
  `/prepare` lets the app do that right after an install. Keep that path even after the shell fix:
  users update the shell late.
