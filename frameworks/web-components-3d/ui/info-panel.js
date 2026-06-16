// BEGIN mChatAI Web Component: ui.info-panel
//
// Collapsible instruction / info panel for 3D games + scenes. Starts as a normal
// titled panel (controls, how-to-play, scene blurb) but has a minimize button
// that shrinks it to a small round "i" icon in the same corner — so the panel
// never dominates the view and the player can immerse in the scene. Click the
// icon to expand again. Optional auto-collapse after a few seconds of play.
// Dependency-free (vanilla DOM + CSS), works over a WebGL canvas or anything.
//
// WHY: generated instruction panels routinely cover a third of the screen
// (real feedback on the Labyrinth-3D build). Use this for the how-to-play box;
// keep the compact score/HUD as-is.
//
// USAGE
//   import { createInfoPanel } from './info-panel.js';
//   const info = createInfoPanel({
//     title: 'Labyrinth 3D',
//     html: 'Tilt the board to roll the marble into the <b>green goal</b>. Avoid the pits!' +
//           '<div class="ip-keys">Tilt: WASD / arrows &middot; drag to orbit &middot; scroll to zoom</div>',
//     corner: 'top-left',       // top-left | top-right | bottom-left | bottom-right
//     accent: '#ffd24a',        // title + icon accent
//     autoCollapseMs: 9000,     // optional: minimize itself after 9s (0/undefined = never)
//   });
//   // info.expand() / info.collapse() / info.toggle() / info.destroy()

export function createInfoPanel(opts = {}) {
  const {
    title = '',
    html = '',
    corner = 'top-left',
    accent = '#ffd24a',
    collapsed = false,
    autoCollapseMs = 0,
    icon = 'i',
    width = 340,
  } = opts;

  if (!document.getElementById('mchatai-info-panel-style')) {
    const st = document.createElement('style');
    st.id = 'mchatai-info-panel-style';
    st.textContent = `
.ip-root{position:fixed;z-index:50;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  -webkit-user-select:none;user-select:none}
.ip-root.tl{top:16px;left:16px}.ip-root.tr{top:16px;right:16px}
.ip-root.bl{bottom:16px;left:16px}.ip-root.br{bottom:16px;right:16px}
.ip-card{max-width:88vw;background:rgba(18,22,34,.82);color:#eef2ff;border:1px solid rgba(255,255,255,.10);
  border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.45);backdrop-filter:blur(8px);
  transform-origin:var(--ip-origin,top left);transition:opacity .18s ease,transform .18s ease}
.ip-hide{opacity:0;transform:scale(.6);pointer-events:none}
.ip-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.ip-title{font-weight:700;font-size:16px;color:var(--ip-accent,#ffd24a);flex:1;min-width:0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ip-min{cursor:pointer;border:0;background:rgba(255,255,255,.10);color:#cdd6f4;width:26px;height:26px;
  border-radius:8px;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.ip-min:hover{background:rgba(255,255,255,.18)}
.ip-body{color:#cdd6f4}
.ip-body .ip-keys,.ip-keys{margin-top:8px;font-size:12.5px;opacity:.85}
.ip-pill{cursor:pointer;width:38px;height:38px;border-radius:50%;background:rgba(18,22,34,.82);
  border:1px solid rgba(255,255,255,.14);color:var(--ip-accent,#ffd24a);font-weight:800;font-size:17px;
  display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.4);
  backdrop-filter:blur(8px);transition:opacity .18s ease,transform .18s ease}
.ip-pill:hover{transform:scale(1.08)}
.ip-pill.ip-hide{opacity:0;transform:scale(.4);pointer-events:none}`;
    document.head.appendChild(st);
  }

  const cmap = { 'top-left': 'tl', 'top-right': 'tr', 'bottom-left': 'bl', 'bottom-right': 'br' };
  const cls = cmap[corner] || 'tl';
  const origin = cls === 'tr' ? 'top right' : cls === 'bl' ? 'bottom left' : cls === 'br' ? 'bottom right' : 'top left';

  const root = document.createElement('div');
  root.className = 'ip-root ' + cls;

  const card = document.createElement('div');
  card.className = 'ip-card';
  card.style.setProperty('--ip-origin', origin);
  card.style.setProperty('--ip-accent', accent);
  card.style.width = width + 'px';
  card.innerHTML =
    `<div class="ip-head"><div class="ip-title">${title}</div>` +
    `<button class="ip-min" title="Minimize" aria-label="Minimize">&#8211;</button></div>` +
    `<div class="ip-body">${html}</div>`;

  const pill = document.createElement('button');
  pill.className = 'ip-pill ip-hide';
  pill.title = 'Show info';
  pill.setAttribute('aria-label', 'Show info');
  pill.textContent = icon;
  pill.style.setProperty('--ip-accent', accent);

  root.appendChild(card);
  root.appendChild(pill);
  (document.body || document.documentElement).appendChild(root);

  let timer = null;
  function expand() {
    card.classList.remove('ip-hide');
    pill.classList.add('ip-hide');
  }
  function collapse() {
    card.classList.add('ip-hide');
    pill.classList.remove('ip-hide');
    if (timer) { clearTimeout(timer); timer = null; }
  }
  function toggle() { (card.classList.contains('ip-hide') ? expand : collapse)(); }

  card.querySelector('.ip-min').addEventListener('click', collapse);
  pill.addEventListener('click', expand);

  if (collapsed) collapse();
  else if (autoCollapseMs > 0) timer = setTimeout(collapse, autoCollapseMs);

  return {
    el: root,
    expand, collapse, toggle,
    destroy() { if (timer) clearTimeout(timer); root.remove(); },
  };
}

// END mChatAI Web Component: ui.info-panel
