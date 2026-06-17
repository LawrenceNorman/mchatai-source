// BEGIN mChatAI Web Component: effects.postfx-bloom-3d
//
// One-call selective bloom postprocessing over the vendored EffectComposer +
// RenderPass + UnrealBloomPass + OutputPass (all on disk under
// resources/three/addons/postprocessing/, resolved by the importmap's
// 'three/addons/' prefix). Hand-wiring the composer with cross-imported addons
// is a common file:// failure point, so this wraps it: build, render(dt),
// setSize(). WebGL2 capability check + graceful degrade to plain
// renderer.render if the composer cannot build. Frees render targets on dispose
// (tjs-008).
//
// Bloom adds passes; keep DPR clamped (tjs-005) and verify frame rate on mobile.
//
// Offline-safe: addons imported via the canonical 'three/addons/' specifier.
//
// Usage:
//   import { BloomComposer } from './effects/postfx-bloom-3d.js';
//   const bloom = new BloomComposer({ renderer, scene, camera, strength: 0.8 });
//   // in the render loop, INSTEAD of renderer.render(scene, camera):
//   bloom.render(dt);
//   // on resize:
//   bloom.setSize(w, h);
//   // teardown:
//   bloom.dispose();

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

export class BloomComposer {
  // opts:
  //   renderer  (required) the WebGLRenderer.
  //   scene     (required) THREE.Scene.
  //   camera    (required) the camera.
  //   strength  bloom intensity. Default 0.7.
  //   radius    bloom spread. Default 0.4.
  //   threshold luminance threshold (only brighter pixels bloom). Default 0.85.
  constructor(opts = {}) {
    this.renderer = opts.renderer || null;
    this.scene = opts.scene || null;
    this.camera = opts.camera || null;
    this._ok = false;
    this._disposed = false;
    this.composer = null;
    this.bloomPass = null;

    if (!this.renderer || !this.scene || !this.camera) {
      return; // degrade: render() falls back to plain renderer.render
    }

    // Composer needs WebGL2-ish float render targets; if anything throws, fall
    // back rather than ship a black screen.
    try {
      const size = new THREE.Vector2();
      this.renderer.getSize(size);
      const w = Math.max(1, size.x);
      const h = Math.max(1, size.y);

      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      const strength = isFiniteNumber(opts.strength) ? opts.strength : 0.7;
      const radius = isFiniteNumber(opts.radius) ? opts.radius : 0.4;
      const threshold = isFiniteNumber(opts.threshold) ? opts.threshold : 0.85;
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), strength, radius, threshold);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());

      this.composer.setSize(w, h);
      this._ok = true;
    } catch (e) {
      this._ok = false;
      this.composer = null;
    }
  }

  setStrength(v) { if (this.bloomPass) this.bloomPass.strength = v; return this; }
  setThreshold(v) { if (this.bloomPass) this.bloomPass.threshold = v; return this; }
  setRadius(v) { if (this.bloomPass) this.bloomPass.radius = v; return this; }

  setSize(w, h) {
    if (this._ok && this.composer) {
      this.composer.setSize(Math.max(1, w), Math.max(1, h));
    }
    return this;
  }

  // Render the scene with bloom. Falls back to plain render if unavailable.
  render(dt) {
    if (this._disposed) return;
    if (this._ok && this.composer) {
      this.composer.render(dt || 0);
    } else if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  get active() { return this._ok; }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this.composer) {
      // EffectComposer holds render targets; dispose frees their GPU memory.
      if (typeof this.composer.dispose === 'function') {
        try { this.composer.dispose(); } catch (e) { /* ignore */ }
      }
      if (this.bloomPass && typeof this.bloomPass.dispose === 'function') {
        try { this.bloomPass.dispose(); } catch (e) { /* ignore */ }
      }
    }
    this.composer = null;
    this.bloomPass = null;
  }
}

// END mChatAI Web Component: effects.postfx-bloom-3d
