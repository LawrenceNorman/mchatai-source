// SpriteRig — multi-part composite sprite framework with attack-animation helpers.
//
// Wisdom rules: ag-016 (named-game canaries must use multi-part composite sprites,
// not solid-color rectangles), ag-017 (attack animations require visible arm
// extension + hit-flash + optional "POW!" pop), ag-018 (off-screen lane spawning).
//
// A SpriteRig is a tree of named parts. Each part has a `draw(ctx)` function and
// a `transform` ({ dx, dy, rotation, scale, alpha }) that animations mutate. The
// rig tracks elapsed time and resolves animations on update().
//
// Usage:
//   import { SpriteRig, attackAnimations } from "../../resources/SpriteRig.js";
//   import { drawZombie } from "../../resources/VectorSprites.js";
//
//   // Convert a monolithic vector sprite into a rig with animatable parts:
//   const rig = new SpriteRig({
//     parts: [
//       { name: "torso", draw: (ctx) => drawZombie(ctx, 0, 0, { scale: 1 }) },
//       { name: "arm-left", draw: (ctx) => { ctx.fillStyle = "#6b8e3a"; ctx.fillRect(-10, -2, 8, 4); } },
//       { name: "arm-right", draw: (ctx) => { ctx.fillStyle = "#6b8e3a"; ctx.fillRect(2, -2, 8, 4); } }
//     ]
//   });
//   // In game loop:
//   rig.update(dt);
//   rig.draw(ctx, x, y, { scale: 2 });
//   // To trigger an attack animation:
//   rig.play(attackAnimations.extendArm("arm-right", 12, 120));
//   rig.play(attackAnimations.whiteFlash(80));
//   rig.play(attackAnimations.popText("POW!", 400));

function defaultTransform() {
  return { dx: 0, dy: 0, rotation: 0, scale: 1, alpha: 1 };
}

function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

/**
 * A single timed animation acting on the rig. Each tick gets a 0..1 progress
 * value and applies a delta (transform mutation, fillStyle override, popup, etc.).
 *
 *   { duration: ms, target: "part-name" | "rig", apply: (rig, partTransform, t) => void }
 */
export class SpriteAnimationStep {
  constructor(options = {}) {
    this.duration = typeof options.duration === "number" ? options.duration : 200;
    this.target = options.target || "rig";
    this.apply = typeof options.apply === "function" ? options.apply : () => {};
    this.onComplete = typeof options.onComplete === "function" ? options.onComplete : null;
    this.elapsed = 0;
    this.done = false;
  }

  reset() { this.elapsed = 0; this.done = false; }

  tick(dtMs, rig) {
    if (this.done) return;
    this.elapsed += dtMs;
    const t = Math.max(0, Math.min(1, this.elapsed / this.duration));
    const partTransform = (this.target === "rig") ? rig.rootTransform : rig.partTransforms.get(this.target);
    if (partTransform) this.apply(rig, partTransform, t);
    if (t >= 1) {
      this.done = true;
      if (this.onComplete) {
        try { this.onComplete(rig); } catch (_) {}
      }
    }
  }
}

export class SpriteRig {
  constructor(options = {}) {
    this.parts = (options.parts || []).map((p) => ({
      name: p.name,
      draw: typeof p.draw === "function" ? p.draw : () => {},
      anchor: p.anchor || { x: 0, y: 0 },
      zOrder: typeof p.zOrder === "number" ? p.zOrder : 0
    }));
    // Transforms keyed by part name. Reset on each draw — animations re-apply per frame.
    this.partTransforms = new Map();
    this.parts.forEach((p) => this.partTransforms.set(p.name, defaultTransform()));
    this.rootTransform = defaultTransform();
    this.activeSteps = [];
    // Visual flags — animations toggle these:
    this.flashAlpha = 0;          // white-flash opacity (0..1)
    this.flashColor = "#ffffff";
    this.popups = [];             // [{ text, x, y, t }]
  }

  /**
   * Queue an animation. Returns this for chaining.
   *   rig.play(attackAnimations.extendArm("arm-right", 12, 120)).play(attackAnimations.whiteFlash(80));
   */
  play(stepOrSteps) {
    if (Array.isArray(stepOrSteps)) {
      stepOrSteps.forEach((s) => this.activeSteps.push(s instanceof SpriteAnimationStep ? s : new SpriteAnimationStep(s)));
    } else {
      this.activeSteps.push(stepOrSteps instanceof SpriteAnimationStep ? stepOrSteps : new SpriteAnimationStep(stepOrSteps));
    }
    return this;
  }

  /**
   * Advance animations. dt is in seconds (matches GameManager convention);
   * internally converted to ms.
   */
  update(dt) {
    const dtMs = dt * 1000;
    // Reset transforms each frame; animations re-apply.
    this.partTransforms.forEach((_, name) => this.partTransforms.set(name, defaultTransform()));
    this.rootTransform = defaultTransform();
    this.flashAlpha = 0;
    // Tick popups.
    this.popups = this.popups.filter((p) => {
      p.t += dtMs;
      return p.t < p.duration;
    });
    // Tick animation steps.
    for (const step of this.activeSteps) step.tick(dtMs, this);
    this.activeSteps = this.activeSteps.filter((s) => !s.done);
  }

  /**
   * Draw the rig at (x, y). Options: scale, flipX, alpha.
   */
  draw(ctx, x, y, options = {}) {
    if (!ctx) return;
    const scale = (options.scale ?? 1) * (this.rootTransform.scale || 1);
    const flipX = options.flipX === true;
    ctx.save();
    ctx.translate(x + (this.rootTransform.dx || 0), y + (this.rootTransform.dy || 0));
    if (this.rootTransform.rotation) ctx.rotate(this.rootTransform.rotation);
    ctx.scale(flipX ? -scale : scale, scale);
    ctx.globalAlpha = (options.alpha ?? 1) * (this.rootTransform.alpha || 1);
    // Draw parts in zOrder.
    const ordered = this.parts.slice().sort((a, b) => a.zOrder - b.zOrder);
    for (const part of ordered) {
      const t = this.partTransforms.get(part.name) || defaultTransform();
      ctx.save();
      ctx.translate(t.dx || 0, t.dy || 0);
      if (t.rotation) ctx.rotate(t.rotation);
      if (t.scale && t.scale !== 1) ctx.scale(t.scale, t.scale);
      if (typeof t.alpha === "number" && t.alpha !== 1) ctx.globalAlpha = ctx.globalAlpha * t.alpha;
      try { part.draw(ctx); } catch (err) {
        if (typeof console !== "undefined") console.warn(`[SpriteRig] part "${part.name}" draw threw`, err);
      }
      ctx.restore();
    }
    // White flash overlay across the whole rig.
    if (this.flashAlpha > 0) {
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      // Best-effort: draw a square covering the rig's general bounding area.
      // Callers can tune by overriding part draws to include their own bounds.
      ctx.fillRect(-40, -40, 80, 80);
    }
    ctx.restore();
    // Draw popups in screen space (NOT rig-local) so text stays upright.
    for (const popup of this.popups) {
      const t = popup.t / popup.duration;
      const lift = -20 * t;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = popup.color || "#fde047";
      ctx.strokeStyle = popup.outlineColor || "#1c1206";
      ctx.lineWidth = 3;
      ctx.font = `bold ${popup.fontSize || 18}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const px = x + (popup.dx || 0);
      const py = y + (popup.dy || -20) + lift;
      ctx.strokeText(popup.text, px, py);
      ctx.fillText(popup.text, px, py);
      ctx.restore();
    }
  }
}

// =============================================================================
// Stock attack animations — covers the ag-017 checklist items.
// =============================================================================
export const attackAnimations = {
  /**
   * Extend a named arm/limb forward (positive distance) over `durationMs`,
   * then retract over the same duration. Use for boxing punches, fencing thrusts, etc.
   *   attackAnimations.extendArm("arm-right", 12, 120)  // 12px out + back over 240ms total
   */
  extendArm(partName, distancePx = 10, durationMs = 120) {
    return new SpriteAnimationStep({
      duration: durationMs * 2,
      target: partName,
      apply: (rig, transform, t) => {
        const phase = t < 0.5 ? easeOutQuad(t * 2) : easeOutQuad((1 - t) * 2);
        transform.dx = distancePx * phase;
      }
    });
  },

  /**
   * Flinch a part backward (e.g. head taking a punch). 4-6px is a good default.
   */
  flinchHead(partName = "head", distancePx = 6, durationMs = 120) {
    return new SpriteAnimationStep({
      duration: durationMs * 2,
      target: partName,
      apply: (rig, transform, t) => {
        const phase = t < 0.5 ? easeOutQuad(t * 2) : easeInOutQuad(1 - t * 2);
        transform.dx = -distancePx * phase;
      }
    });
  },

  /**
   * Full-rig white flash for a hit-react. Default 100ms is short enough to read
   * as an impact without blinding the player.
   */
  whiteFlash(durationMs = 100, color = "#ffffff") {
    return new SpriteAnimationStep({
      duration: durationMs,
      target: "rig",
      apply: (rig, _, t) => {
        rig.flashAlpha = (1 - t) * 0.85;
        rig.flashColor = color;
      }
    });
  },

  /**
   * Floating "POW!" / "BAM!" text burst. Drifts upward and fades.
   *   attackAnimations.popText("POW!", 400)
   */
  popText(text, durationMs = 400, options = {}) {
    return new SpriteAnimationStep({
      duration: 1, // start instantly; the popup itself drives its own timing
      target: "rig",
      apply: (rig) => {
        rig.popups.push({
          text,
          duration: durationMs,
          t: 0,
          dx: options.dx ?? 0,
          dy: options.dy ?? -20,
          color: options.color || "#fde047",
          outlineColor: options.outlineColor || "#1c1206",
          fontSize: options.fontSize || 24
        });
      }
    });
  }
};

/**
 * Convenience: build a punch combo (extend + flash + pop) targeting one arm
 * and the rig. Pass to rig.play().
 *
 *   rig.play(attackAnimations.punchCombo("arm-right"));
 */
attackAnimations.punchCombo = function (partName, options = {}) {
  return [
    attackAnimations.extendArm(partName, options.distance ?? 12, options.extendMs ?? 110),
    attackAnimations.whiteFlash(options.flashMs ?? 90),
    attackAnimations.popText(options.popText || "POW!", options.popMs ?? 360, options)
  ];
};
