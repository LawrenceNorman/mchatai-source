const DEFAULT_STRUCTURE_TOKENS = {
  radius: {
    sm: "6px",
    md: "12px",
    lg: "20px",
    pill: "999px"
  },
  space: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "24px",
    6: "32px"
  },
  type: {
    xs: "clamp(11px, 2.6vw, 12px)",
    sm: "clamp(13px, 3vw, 14px)",
    md: "clamp(15px, 3.4vw, 16px)",
    lg: "clamp(18px, 4.2vw, 22px)",
    xl: "clamp(24px, 6vw, 36px)"
  },
  font: {
    ui: "-apple-system, 'Segoe UI', Roboto, sans-serif",
    display: "'Avenir Next', 'Trebuchet MS', sans-serif",
    mono: "'SF Mono', 'Cascadia Mono', monospace"
  }
};

export const ASTEROIDS_SWATCHES = [
  {
    id: "retro-neon",
    displayName: "Retro Neon",
    tokens: {
      background: "#020617",
      surface: "#08111f",
      text: "#f8fafc",
      accent: "#22d3ee",
      accentWarm: "#fb923c",
      stroke: "#e2e8f0",
      shadow: "rgba(34, 211, 238, 0.24)",
      ...DEFAULT_STRUCTURE_TOKENS
    }
  },
  {
    id: "vector-noir",
    displayName: "Vector Noir",
    tokens: {
      background: "#000000",
      surface: "#050505",
      text: "#e5e7eb",
      accent: "#93c5fd",
      accentWarm: "#fda4af",
      stroke: "#f8fafc",
      shadow: "rgba(148, 163, 184, 0.2)",
      ...DEFAULT_STRUCTURE_TOKENS
    }
  },
  {
    id: "sunset-arcade",
    displayName: "Sunset Arcade",
    tokens: {
      background: "#1f1026",
      surface: "#2f1734",
      text: "#fff7ed",
      accent: "#f97316",
      accentWarm: "#facc15",
      stroke: "#fde68a",
      shadow: "rgba(249, 115, 22, 0.24)",
      ...DEFAULT_STRUCTURE_TOKENS
    }
  }
];

export const WEB_COMPONENT_SWATCHES = ASTEROIDS_SWATCHES;

export function getSwatchByID(id, collection = WEB_COMPONENT_SWATCHES) {
  return collection.find((swatch) => swatch.id === id) || collection[0] || null;
}

export function applySwatchVariables(element, swatch, options = {}) {
  if (!element || !swatch?.tokens) {
    return;
  }

  const prefix = options.prefix || "--mchat";
  Object.entries(swatch.tokens).forEach(([token, value]) => {
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, inner]) => {
        element.style.setProperty(`${prefix}-${token}-${key}`, String(inner));
      });
    } else {
      element.style.setProperty(`${prefix}-${token}`, String(value));
    }
  });
}

// Read active swatch tokens from a live CSS root. Returns a palette shaped
// like swatch.tokens — { background, surface, text, accent, accentWarm,
// stroke, shadow, radius:{...}, space:{...}, type:{...}, font:{...} } — but
// reflecting whatever applySwatchVariables most recently set (or the synchronous
// :root fallback block if JS hasn't run yet). Useful for canvas paint code that
// wants to follow the active swatch instead of using hardcoded hex fallbacks.
// If no element is provided, defaults to document.documentElement.
export function getCurrentSwatchPalette(element, prefix = "--mchat") {
  if (typeof window === "undefined" || typeof getComputedStyle === "undefined") return null;
  const root = element || document.documentElement;
  const cs = getComputedStyle(root);
  const palette = {};
  ["background", "surface", "text", "accent", "accentWarm", "stroke", "shadow"].forEach((token) => {
    const v = cs.getPropertyValue(`${prefix}-${token}`).trim();
    if (v) palette[token] = v;
  });
  const groups = {
    radius: ["sm", "md", "lg", "pill"],
    space: ["1", "2", "3", "4", "5", "6"],
    type: ["xs", "sm", "md", "lg", "xl"],
    font: ["ui", "display", "mono"]
  };
  Object.entries(groups).forEach(([group, keys]) => {
    const sub = {};
    let any = false;
    keys.forEach((k) => {
      const v = cs.getPropertyValue(`${prefix}-${group}-${k}`).trim();
      if (v) { sub[k] = v; any = true; }
    });
    if (any) palette[group] = sub;
  });
  return palette;
}

// CSS string for a synchronous :root { --mchat-* } fallback block. CSS paints
// before JS modules execute, so without this block the page renders unstyled
// for one frame (FOUC). Examples include this block verbatim at the top of
// their stylesheet; applySwatchVariables overrides it for the active swatch
// via inline style, which wins on specificity. Wisdom u-030 + marker check
// enforce that any :root { --mchat-* } block in example CSS exactly matches
// the value buildSwatchDefaultsCSS() returns for the named swatch.
export function buildSwatchDefaultsCSS(swatchID = "retro-neon", prefix = "--mchat") {
  const swatch = getSwatchByID(swatchID);
  if (!swatch?.tokens) return "";
  const lines = [":root {"];
  Object.entries(swatch.tokens).forEach(([token, value]) => {
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, inner]) => {
        lines.push(`  ${prefix}-${token}-${key}: ${inner};`);
      });
    } else {
      lines.push(`  ${prefix}-${token}: ${value};`);
    }
  });
  lines.push("}");
  return lines.join("\n");
}
