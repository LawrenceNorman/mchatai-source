// VectorSprites — high-fidelity canvas-path renderers for hero entities.
//
// Use these instead of small pixel grids when you want a recognizable, polished
// silhouette. Each function takes (ctx, x, y, options) and draws a sprite
// centered at (x, y). Options: { scale, flipX, alpha, palette }.
//
// Why canvas paths instead of pixel grids: a 16x16 pixel grid can't render a
// recognizable dragon — the user's feedback on the H2 release. Canvas paths
// scale crisply, support curves, and can encode much more visual detail in
// roughly the same lines of code.
//
// Recommended scale: 1.0 = ~64px tall. Pass scale: 0.6 for tile-sized rendering.

function withTransform(ctx, x, y, options, fn) {
  const scale = options.scale ?? 1;
  const flipX = options.flipX === true;
  const alpha = typeof options.alpha === "number" ? options.alpha : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX ? -scale : scale, scale);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  fn();
  ctx.restore();
}

// ===========================================================================
// DRAGON — winged, scaled, snarling. Faces left by default; pass flipX:true
// for right-facing.
// ===========================================================================
export function drawDragon(ctx, x, y, options = {}) {
  const palette = options.palette || {};
  const body = palette.body || "#16a34a";
  const belly = palette.belly || "#facc15";
  const wing = palette.wing || "#7a1f1f";
  const wingInner = palette.wingInner || "#dc2626";
  const eye = palette.eye || "#fde047";
  const claw = palette.claw || "#1c0a0a";
  const spike = palette.spike || "#7a1f1f";

  withTransform(ctx, x, y, options, () => {
    // Tail (curved)
    ctx.fillStyle = body;
    ctx.strokeStyle = "#0d3d18";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, -2);
    ctx.quadraticCurveTo(38, -10, 42, 6);
    ctx.quadraticCurveTo(38, 4, 30, 8);
    ctx.quadraticCurveTo(24, 6, 20, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wings — back wing first (slightly faded)
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(8, -8);
    ctx.lineTo(-2, -28);
    ctx.lineTo(20, -22);
    ctx.lineTo(28, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Front wing (bigger, in front of body)
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-14, -32);
    ctx.lineTo(8, -26);
    ctx.lineTo(20, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wing inner highlight
    ctx.fillStyle = wingInner;
    ctx.beginPath();
    ctx.moveTo(2, -10);
    ctx.lineTo(-8, -26);
    ctx.lineTo(10, -22);
    ctx.lineTo(16, -12);
    ctx.closePath();
    ctx.fill();

    // Body
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(8, 4, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly highlight
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(8, 10, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Spikes along the spine
    ctx.fillStyle = spike;
    for (let i = 0; i < 4; i += 1) {
      const sx = -6 + i * 7;
      ctx.beginPath();
      ctx.moveTo(sx, -6);
      ctx.lineTo(sx + 3, -12);
      ctx.lineTo(sx + 6, -6);
      ctx.closePath();
      ctx.fill();
    }

    // Front legs
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(-6, 14, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(18, 14, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Claws
    ctx.fillStyle = claw;
    ctx.beginPath(); ctx.arc(-6, 19, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(18, 19, 2, 0, Math.PI * 2); ctx.fill();

    // Head
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(-14, -2, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Snout
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-26, -2);
    ctx.lineTo(-26, 4);
    ctx.lineTo(-20, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horns
    ctx.fillStyle = claw;
    ctx.beginPath();
    ctx.moveTo(-16, -8);
    ctx.lineTo(-10, -16);
    ctx.lineTo(-12, -7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(-6, -14);
    ctx.lineTo(-8, -6);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = eye;
    ctx.beginPath();
    ctx.arc(-12, -3, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-12, -3, 1.1, 0, Math.PI * 2);
    ctx.fill();

    // Teeth
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.moveTo(-25, 1);
    ctx.lineTo(-23, 4);
    ctx.lineTo(-22, 1);
    ctx.closePath();
    ctx.fill();
  });
}

// ===========================================================================
// KNIGHT — armored, with sword and shield. Faces forward.
// ===========================================================================
export function drawKnight(ctx, x, y, options = {}) {
  const palette = options.palette || {};
  const armor = palette.armor || "#cbd5e1";
  const armorDark = palette.armorDark || "#64748b";
  const accent = palette.accent || "#dc2626";
  const sword = palette.sword || "#e2e8f0";
  const swordHilt = palette.swordHilt || "#a16207";
  const shield = palette.shield || "#1e40af";
  const shieldEdge = palette.shieldEdge || "#fbbf24";
  const skin = palette.skin || "#fde68a";
  const plume = palette.plume || "#dc2626";

  withTransform(ctx, x, y, options, () => {
    // Cape (behind everything)
    ctx.fillStyle = "#7f1d1d";
    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.lineTo(-14, 26);
    ctx.lineTo(14, 26);
    ctx.lineTo(10, -2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#1c0606";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Legs
    ctx.fillStyle = armorDark;
    ctx.fillRect(-7, 18, 5, 12);
    ctx.fillRect(2, 18, 5, 12);
    ctx.strokeRect(-7, 18, 5, 12);
    ctx.strokeRect(2, 18, 5, 12);
    // Boots
    ctx.fillStyle = "#1c0a0a";
    ctx.fillRect(-8, 28, 7, 4);
    ctx.fillRect(1, 28, 7, 4);

    // Torso (armor plate)
    ctx.fillStyle = armor;
    ctx.beginPath();
    ctx.moveTo(-9, -2);
    ctx.lineTo(-11, 18);
    ctx.lineTo(11, 18);
    ctx.lineTo(9, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Chest plate seam
    ctx.beginPath();
    ctx.moveTo(0, -2); ctx.lineTo(0, 18);
    ctx.strokeStyle = armorDark;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Cross emblem on chest
    ctx.fillStyle = accent;
    ctx.fillRect(-1, 4, 2, 8);
    ctx.fillRect(-3, 7, 6, 2);

    // Belt
    ctx.fillStyle = swordHilt;
    ctx.fillRect(-10, 16, 20, 3);

    // Shield (left arm)
    ctx.fillStyle = shieldEdge;
    ctx.beginPath();
    ctx.ellipse(-14, 8, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shield;
    ctx.beginPath();
    ctx.ellipse(-14, 8, 5.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Shield emblem
    ctx.fillStyle = shieldEdge;
    ctx.fillRect(-15, 5, 2, 6);
    ctx.fillRect(-17, 7, 6, 2);

    // Sword (right arm) — held vertical
    ctx.fillStyle = swordHilt;
    ctx.fillRect(11, 4, 3, 4); // grip
    ctx.fillRect(8, 8, 9, 2); // guard
    ctx.fillStyle = sword;
    ctx.beginPath();
    ctx.moveTo(12, -16);
    ctx.lineTo(14, 8);
    ctx.lineTo(11, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Helmet
    ctx.fillStyle = armor;
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.lineTo(-8, -14);
    ctx.quadraticCurveTo(0, -22, 8, -14);
    ctx.lineTo(8, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Visor slit
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(-6, -10, 12, 2);
    ctx.fillRect(-2, -8, 4, 1);

    // Plume
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.quadraticCurveTo(6, -28, 4, -22);
    ctx.quadraticCurveTo(8, -24, 6, -16);
    ctx.quadraticCurveTo(2, -18, 0, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Helmet crown rim
    ctx.fillStyle = swordHilt;
    ctx.fillRect(-8, -5, 16, 1.5);
  });
}

// ===========================================================================
// TREASURE — open chest with gold spilling out
// ===========================================================================
export function drawTreasure(ctx, x, y, options = {}) {
  const palette = options.palette || {};
  const wood = palette.wood || "#7c3a14";
  const woodDark = palette.woodDark || "#3b1c08";
  const band = palette.band || "#a16207";
  const gold = palette.gold || "#fbbf24";
  const goldHi = palette.goldHi || "#fef3c7";
  const ruby = palette.ruby || "#dc2626";

  withTransform(ctx, x, y, options, () => {
    // Lower box body
    ctx.fillStyle = wood;
    ctx.strokeStyle = woodDark;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-14, 0, 28, 16);
    ctx.strokeRect(-14, 0, 28, 16);
    // Bands
    ctx.fillStyle = band;
    ctx.fillRect(-14, 3, 28, 2);
    ctx.fillRect(-14, 13, 28, 2);
    // Lock
    ctx.fillStyle = woodDark;
    ctx.fillRect(-2, 6, 4, 6);
    ctx.fillStyle = band;
    ctx.fillRect(-1, 8, 2, 2);

    // Lid (open, tilted back)
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(12, -10);
    ctx.lineTo(14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = band;
    ctx.fillRect(-13, -4, 26, 2);

    // Gold pile inside (spilling forward)
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.lineTo(-8, -2);
    ctx.lineTo(-4, 2);
    ctx.lineTo(0, -3);
    ctx.lineTo(4, 1);
    ctx.lineTo(8, -2);
    ctx.lineTo(12, 4);
    ctx.closePath();
    ctx.fill();
    // Highlights
    ctx.fillStyle = goldHi;
    ctx.beginPath();
    ctx.arc(-6, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2, -1, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7, 1, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Ruby
    ctx.fillStyle = ruby;
    ctx.beginPath();
    ctx.moveTo(-1, -2);
    ctx.lineTo(2, 0);
    ctx.lineTo(0, 2);
    ctx.lineTo(-3, 0);
    ctx.closePath();
    ctx.fill();
  });
}

// ===========================================================================
// KEY — skeleton key with detailed bow and bit
// ===========================================================================
export function drawKey(ctx, x, y, options = {}) {
  const palette = options.palette || {};
  const gold = palette.gold || "#fbbf24";
  const goldDark = palette.goldDark || "#a16207";

  withTransform(ctx, x, y, options, () => {
    ctx.fillStyle = gold;
    ctx.strokeStyle = goldDark;
    ctx.lineWidth = 1.2;
    // Bow (round head with hole)
    ctx.beginPath();
    ctx.arc(-10, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1c1206";
    ctx.beginPath();
    ctx.arc(-10, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Shaft
    ctx.fillStyle = gold;
    ctx.fillRect(-4, -1.5, 14, 3);
    ctx.strokeRect(-4, -1.5, 14, 3);
    // Bit teeth
    ctx.fillRect(8, 1.5, 2, 3);
    ctx.fillRect(5, 1.5, 2, 4);
    ctx.strokeRect(8, 1.5, 2, 3);
    ctx.strokeRect(5, 1.5, 2, 4);
  });
}

// ===========================================================================
// GATE — castle archway with iron portcullis
// ===========================================================================
export function drawGate(ctx, x, y, options = {}) {
  const palette = options.palette || {};
  const stone = palette.stone || "#78716c";
  const stoneDark = palette.stoneDark || "#1c1917";
  const iron = palette.iron || "#1f2937";
  const ironHi = palette.ironHi || "#475569";
  const lit = palette.lit || "#facc15";

  withTransform(ctx, x, y, options, () => {
    // Stone arch
    ctx.fillStyle = stone;
    ctx.strokeStyle = stoneDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-22, 30);
    ctx.lineTo(-22, -10);
    ctx.quadraticCurveTo(-22, -28, 0, -28);
    ctx.quadraticCurveTo(22, -28, 22, -10);
    ctx.lineTo(22, 30);
    ctx.lineTo(-22, 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Stone block lines
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const yLine = -16 + i * 10;
      ctx.moveTo(-22, yLine); ctx.lineTo(22, yLine);
    }
    ctx.moveTo(-12, -22); ctx.lineTo(-12, -8);
    ctx.moveTo(12, -22); ctx.lineTo(12, -8);
    ctx.moveTo(0, -8); ctx.lineTo(0, 30);
    ctx.strokeStyle = stoneDark;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Doorway opening
    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    ctx.moveTo(-14, 28);
    ctx.lineTo(-14, -8);
    ctx.quadraticCurveTo(-14, -22, 0, -22);
    ctx.quadraticCurveTo(14, -22, 14, -8);
    ctx.lineTo(14, 28);
    ctx.closePath();
    ctx.fill();

    // Iron portcullis bars
    ctx.strokeStyle = iron;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      const xBar = -12 + i * 6;
      ctx.beginPath();
      ctx.moveTo(xBar, 28);
      ctx.lineTo(xBar, -18);
      ctx.stroke();
    }
    // Cross bars
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, -8); ctx.lineTo(13, -8);
    ctx.moveTo(-13, 8); ctx.lineTo(13, 8);
    ctx.moveTo(-13, 22); ctx.lineTo(13, 22);
    ctx.stroke();

    // Glowing keyhole if `lit` palette set
    if (options.unlocked) {
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.arc(0, 5, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// ===========================================================================
// REGISTRY
// ===========================================================================
export const VECTOR_SPRITES = {
  dragon: drawDragon,
  knight: drawKnight,
  treasure: drawTreasure,
  key: drawKey,
  gate: drawGate
};

export function drawVectorSprite(ctx, name, x, y, options = {}) {
  const fn = VECTOR_SPRITES[name];
  if (!fn) return;
  fn(ctx, x, y, options);
}
