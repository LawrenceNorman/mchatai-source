// SvgShapes — distinct silhouettes for tokens (candies, gems, mahjong tiles,
// color-pop blobs, any tile-based game where N colors share the board).
//
// Why this exists: when a match-3 / color-puzzle / mahjong game uses ONLY color
// to distinguish tiles, the board reads as a color grid and is hard to scan
// for colorblind/low-contrast players. Giving each token a distinct SHAPE +
// distinct color makes the board read as variety. Wisdom rule
// `vq-shape-per-color` (visual-quality.json) governs this.
//
// Source-of-truth shapes were extracted 2026-05-06 from the deployed gold
// candy-match (mchatai.com/hub/candy-match → examples/candy-match/REFERENCE_GOLD.html).
//
// Usage:
//   import { SvgShapes } from "../../ui/SvgShapes.js";
//   const html = SvgShapes.render({ shape: "star", fill: "#ffd83a", shine: "#fff0a3" });
//   tile.innerHTML = html;
//
// Or pass a token object (id+shape+fill+shine):
//   SvgShapes.renderToken(token);
//
// Or generate a default 6-token palette:
//   const tokens = SvgShapes.defaultTokens(); // [{id, name, shape, fill, shine}, ...]

const STROKE = "#1a0833";
const STROKE_WIDTH = 1.6;

const RENDERERS = {
  // Round lozenge — wrapped candy / red ruby
  lozenge(fill, shine) {
    return `<ellipse cx="20" cy="20" rx="15" ry="12" fill="${fill}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}"/>
            <ellipse cx="14" cy="14" rx="5" ry="3" fill="${shine}" opacity="0.65"/>`;
  },
  // Hexagon — orange fizzer / nut / honey-crisp
  hexagon(fill, shine) {
    return `<polygon points="20,4 34,12 34,28 20,36 6,28 6,12" fill="${fill}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}"/>
            <ellipse cx="14" cy="13" rx="5" ry="3" fill="${shine}" opacity="0.65"/>`;
  },
  // 5-point star — yellow lemon-burst / treasure / power-up vibe
  star(fill, shine) {
    return `<polygon points="20,3 25,15 38,16 28,24 31,37 20,30 9,37 12,24 2,16 15,15" fill="${fill}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/>
            <circle cx="16" cy="14" r="3" fill="${shine}" opacity="0.7"/>`;
  },
  // Soft chiclet square — green mint / kid-friendly cube
  chiclet(fill, shine) {
    return `<rect x="5" y="5" width="30" height="30" rx="8" ry="8" fill="${fill}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}"/>
            <ellipse cx="14" cy="13" rx="5" ry="3" fill="${shine}" opacity="0.65"/>`;
  },
  // Circle gem — blueberry / classic match-3 ball
  circle(fill, shine) {
    return `<circle cx="20" cy="20" r="15" fill="${fill}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}"/>
            <circle cx="14" cy="13" r="3" fill="${shine}" opacity="0.7"/>`;
  },
  // Diamond — plum / jewel
  diamond(fill, shine) {
    return `<polygon points="20,4 36,20 20,36 4,20" fill="${fill}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}"/>
            <ellipse cx="14" cy="14" rx="4" ry="3" fill="${shine}" opacity="0.65"/>`;
  },
  // Heart — bonus/love token
  heart(fill, shine) {
    return `<path d="M20 35 C 4 24 4 12 12 8 C 16 8 19 11 20 14 C 21 11 24 8 28 8 C 36 12 36 24 20 35 Z" fill="${fill}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/>
            <ellipse cx="14" cy="14" rx="4" ry="3" fill="${shine}" opacity="0.6"/>`;
  },
  // Triangle — angular / arcade token
  triangle(fill, shine) {
    return `<polygon points="20,4 36,33 4,33" fill="${fill}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/>
            <ellipse cx="14" cy="22" rx="4" ry="2" fill="${shine}" opacity="0.6"/>`;
  }
};

export const SvgShapes = {
  /**
   * Available shape names. Use one of these as the `shape` arg to render().
   */
  shapes: Object.keys(RENDERERS),

  /**
   * Render a single token's SVG markup string.
   * @param {{shape: string, fill: string, shine?: string, ariaLabel?: string, extraClass?: string}} opts
   * @returns {string} HTML string with a <svg class="candy ..."> root
   */
  render({ shape, fill, shine, ariaLabel, extraClass = "" }) {
    const draw = RENDERERS[shape];
    if (!draw) return "";
    const lighten = shine || _lighten(fill);
    const aria = ariaLabel ? ` aria-label="${ariaLabel}"` : ` aria-hidden="true"`;
    const cls = ("candy " + extraClass).trim();
    return `<svg class="${cls}" viewBox="0 0 40 40"${aria}>${draw(fill, lighten)}</svg>`;
  },

  /**
   * Convenience: render from a token object {shape, fill, shine, name}.
   */
  renderToken(token) {
    return this.render({ shape: token.shape, fill: token.fill, shine: token.shine, ariaLabel: token.name });
  },

  /**
   * Default 6-token palette tuned for match-3 (matches REFERENCE_GOLD).
   * Use `.slice(0, n)` to pick fewer colors for smaller palettes.
   */
  defaultTokens() {
    return [
      { id: 0, name: "ruby",      shape: "lozenge",  fill: "#ff5b6e", shine: "#ffc8cf" },
      { id: 1, name: "orange",    shape: "hexagon",  fill: "#ff9c2e", shine: "#ffd9a3" },
      { id: 2, name: "lemon",     shape: "star",     fill: "#ffd83a", shine: "#fff0a3" },
      { id: 3, name: "mint",      shape: "chiclet",  fill: "#5fd24c", shine: "#bdf0b3" },
      { id: 4, name: "blueberry", shape: "circle",   fill: "#3aa9ff", shine: "#bcdfff" },
      { id: 5, name: "plum",      shape: "diamond",  fill: "#c084fc", shine: "#e9d2ff" }
    ];
  }
};

// Quick lighten approximation for shine when not provided. Naive: toward white.
function _lighten(hex) {
  if (!hex || !hex.startsWith("#") || hex.length !== 7) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c) => Math.min(255, Math.round(c + (255 - c) * 0.55));
  return `#${[r, g, b].map(mix).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
