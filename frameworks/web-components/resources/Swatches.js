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
      shadow: "rgba(34, 211, 238, 0.24)"
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
      shadow: "rgba(148, 163, 184, 0.2)"
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
      shadow: "rgba(249, 115, 22, 0.24)"
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
    element.style.setProperty(`${prefix}-${token}`, String(value));
  });
}
