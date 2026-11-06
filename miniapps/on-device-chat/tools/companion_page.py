#!/usr/bin/env python3
"""Render a pack's companion.md as a self-contained page for mchatai.com.

    python3 tools/companion_page.py <pack-id> <out-dir>

Reads personas/<pack-id>/companion.md and writes <out-dir>/index.html: one file,
inline styles, light and dark, no scripts. Pictures referenced relatively are
embedded as data URIs (the /u/ pages' CSP allows data: images and blocks
hotlinks), external sites stay links (never embeds). `### ` headings become
folded sections, so chapter questions stay closed until the reader opens them.
Deploy the folder with the hub `deploy` verb (plain: true) from mChatAI+.

The Markdown it understands: #/##/### headings, paragraphs, - lists, links,
images, *em*, **strong**, a --- rule. Enough for a reading companion.
"""
import base64, html, mimetypes, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
source_root = os.path.abspath(os.path.join(here, "..", "..", ".."))
if len(sys.argv) != 3:
    sys.exit(__doc__)
pack_id, out_dir = sys.argv[1], sys.argv[2]
pack_dir = os.path.join(source_root, "personas", pack_id)
md = open(os.path.join(pack_dir, "companion.md"), encoding="utf-8").read()

def inline(src):
    s = re.sub(r"(\*\*|__)(.+?)\1", r"<strong>\2</strong>", html.escape(src, quote=False))
    s = re.sub(r"(?<![*\w])\*(?!\*)(.+?)\*(?!\*)", r"<em>\1</em>", s)
    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: f'<a href="{html.escape(m.group(2), quote=True)}" rel="noopener">{m.group(1)}</a>', s)

def picture(alt, src):
    path = os.path.join(pack_dir, src)
    if not os.path.exists(path):
        sys.exit(f"companion.md names a picture that isn't in the pack: {src}")
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    data = base64.b64encode(open(path, "rb").read()).decode("ascii")
    return f'<figure><img src="data:{mime};base64,{data}" alt="{html.escape(alt, quote=True)}" loading="lazy"><figcaption>{inline(alt)}</figcaption></figure>'

body, title, open_details, in_list = [], pack_id, False, False
def close_list():
    global in_list
    if in_list: body.append("</ul>"); in_list = False
def close_details():
    global open_details
    close_list()
    if open_details: body.append("</details>"); open_details = False

for raw in md.splitlines():
    line = raw.rstrip()
    if not line.strip():
        close_list(); continue
    m = re.match(r"^(#{1,3})\s+(.*)$", line)
    if m:
        level, text = len(m.group(1)), m.group(2).strip()
        if level == 1:
            close_details(); title = text; body.append(f"<h1>{inline(text)}</h1>")
        elif level == 2:
            close_details(); body.append(f"<h2>{inline(text)}</h2>")
        else:
            close_details(); open_details = True
            body.append(f"<details><summary>{inline(text)}</summary>")
        continue
    m = re.match(r"^!\[(.*?)\]\((\S+)\)\s*$", line)
    if m:
        close_list(); body.append(picture(m.group(1), m.group(2))); continue
    if line.strip() == "---":
        close_details(); body.append("<hr>"); continue
    m = re.match(r"^\s*[-*]\s+(.*)$", line)
    if m:
        if not in_list: body.append("<ul>"); in_list = True
        body.append(f"<li>{inline(m.group(1))}</li>"); continue
    close_list(); body.append(f"<p>{inline(line.strip())}</p>")
close_details()

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(title)}: a reading companion from mChatAI.">
<style>
  :root {{ --bg: #f6f5f2; --surface: #fff; --text: #1d1d1f; --muted: #6b6b70; --border: #e3e1dc; --accent: #2f6f5e; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --bg: #141416; --surface: #1f1f22; --text: #f2f2f4; --muted: #9a9aa2; --border: #303034; --accent: #5fb39b; }} }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--text); font: 17px/1.55 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    padding: calc(16px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom)); }}
  main {{ max-width: 42em; margin: 0 auto; }}
  h1 {{ font-size: 28px; line-height: 1.2; margin: 8px 0 12px; }}
  h2 {{ font-size: 20px; margin: 28px 0 8px; }}
  p {{ margin: 0 0 12px; }}
  a {{ color: var(--accent); }}
  ul {{ padding-left: 1.2em; margin: 0 0 12px; }}
  li {{ margin: 4px 0; }}
  figure {{ margin: 18px 0; }}
  figure img {{ display: block; max-width: 100%; max-height: 60vh; border-radius: 12px; border: 1px solid var(--border); margin: 0 auto; }}
  figcaption {{ font-size: 14px; color: var(--muted); margin-top: 6px; text-align: center; }}
  details {{ background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px; margin: 8px 0; }}
  summary {{ cursor: pointer; font-weight: 600; }}
  details[open] summary {{ margin-bottom: 6px; }}
  hr {{ border: 0; border-top: 1px solid var(--border); margin: 28px 0 16px; }}
  hr + p {{ color: var(--muted); font-size: 14px; }}
</style>
</head>
<body>
<main>
{chr(10).join(body)}
</main>
</body>
</html>
"""
os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
    f.write(page)
print(f"wrote {out_dir}/index.html ({len(page)} bytes) from personas/{pack_id}/companion.md")
