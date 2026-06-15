// BEGIN mChatAI Web Component: core.three-scene-rig
//
// ThreeSceneRig - builds the scene / camera / WebGLRenderer trio that every
// web-components-3d game shares, plus a sane default lighting recipe and a
// draw-call monitor hook reading renderer.info.
//
// Conventions enforced here so individual games never have to remember them:
//   - WebGL2 only: THREE.WebGLRenderer (NEVER WebGPURenderer). file:// is not a
//     secure context, so WebGPU is silently unavailable; WebGL2 is the target.
//   - Color management: renderer.outputColorSpace = SRGBColorSpace and
//     ACESFilmicToneMapping for a film-grade look without per-game tweaking.
//   - Lighting recipe: exactly ONE DirectionalLight (the "sun", shadow-capable)
//     plus ONE HemisphereLight (sky/ground fill) - keeps mobile under the
//     <=3-active-lights budget from the three-js-games wisdom pack.
//   - DPR clamp lives in core.three-game-loop (the loop owns resize); this rig
//     only sets an initial pixel ratio so the very first frame is not blurry.
//   - renderer.info draw-call monitor hook: sample() returns the live counts so
//     a HUD or the dev probe can watch for the <100 draw-call target.
//
// Offline-safe under file://. No CDN, no network, ASCII only.

import * as THREE from 'three';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, lo, hi) {
  return value < lo ? lo : (value > hi ? hi : value);
}

const DEFAULT_MAX_DPR = 2;

export class ThreeSceneRig {
  // options:
  //   container        DOM element to append the canvas to (default document.body)
  //   antialias        renderer antialias (default true)
  //   alpha            transparent canvas backdrop (default false)
  //   powerPreference  'high-performance' | 'low-power' | 'default' (default 'high-performance')
  //   clearColor       scene background color, hex number or css string (default 0x0b1020)
  //   fov              perspective vertical FOV in degrees (default 60)
  //   near             camera near plane (default 0.1)
  //   far              camera far plane (default 2000)
  //   cameraPosition   [x, y, z] initial camera position (default [0, 6, 12])
  //   cameraTarget     [x, y, z] initial look-at point (default [0, 0, 0])
  //   maxDpr           clamp for the initial pixel ratio (default 2)
  //   toneMappingExposure (default 1.0)
  //   sun              { color, intensity, position: [x,y,z], castShadow, shadowMapSize }
  //   hemi             { skyColor, groundColor, intensity }
  //   enableShadows    turn on the shadow map (default true; sun.castShadow gates it)
  constructor(options = {}) {
    this.disposed = false;

    this.container = options.container
      || (typeof document !== 'undefined' ? document.body : null);

    const width = (typeof window !== 'undefined' && window.innerWidth) || 1;
    const height = (typeof window !== 'undefined' && window.innerHeight) || 1;

    // ----- renderer (WebGL2 only) ----------------------------------------
    this.renderer = new THREE.WebGLRenderer({
      antialias: options.antialias !== false,
      alpha: options.alpha === true,
      powerPreference: options.powerPreference || 'high-performance',
      stencil: false
    });

    const rawDpr = (typeof window !== 'undefined' && isFiniteNumber(window.devicePixelRatio))
      ? window.devicePixelRatio
      : 1;
    const maxDpr = isFiniteNumber(options.maxDpr) && options.maxDpr >= 1
      ? options.maxDpr
      : DEFAULT_MAX_DPR;
    this.renderer.setPixelRatio(clamp(rawDpr, 1, maxDpr));
    this.renderer.setSize(width, height, true);

    // Film-grade color pipeline, applied once for every game.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = isFiniteNumber(options.toneMappingExposure)
      ? options.toneMappingExposure
      : 1.0;

    const enableShadows = options.enableShadows !== false;
    if (enableShadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.domElement = this.renderer.domElement;
    if (this.container && typeof this.container.appendChild === 'function') {
      this.container.appendChild(this.domElement);
    }

    // ----- scene ---------------------------------------------------------
    this.scene = new THREE.Scene();
    const clearColor = options.clearColor !== undefined ? options.clearColor : 0x0b1020;
    this.scene.background = new THREE.Color(clearColor);

    // ----- camera --------------------------------------------------------
    const fov = isFiniteNumber(options.fov) ? options.fov : 60;
    const near = isFiniteNumber(options.near) ? options.near : 0.1;
    const far = isFiniteNumber(options.far) ? options.far : 2000;
    this.camera = new THREE.PerspectiveCamera(fov, width / Math.max(1, height), near, far);

    const camPos = Array.isArray(options.cameraPosition) ? options.cameraPosition : [0, 6, 12];
    this.camera.position.set(
      isFiniteNumber(camPos[0]) ? camPos[0] : 0,
      isFiniteNumber(camPos[1]) ? camPos[1] : 6,
      isFiniteNumber(camPos[2]) ? camPos[2] : 12
    );
    const camTarget = Array.isArray(options.cameraTarget) ? options.cameraTarget : [0, 0, 0];
    this._target = new THREE.Vector3(
      isFiniteNumber(camTarget[0]) ? camTarget[0] : 0,
      isFiniteNumber(camTarget[1]) ? camTarget[1] : 0,
      isFiniteNumber(camTarget[2]) ? camTarget[2] : 0
    );
    this.camera.lookAt(this._target);

    // ----- lighting recipe: 1 sun + 1 hemisphere fill --------------------
    const sunOpts = options.sun || {};
    this.sun = new THREE.DirectionalLight(
      sunOpts.color !== undefined ? sunOpts.color : 0xfff2e0,
      isFiniteNumber(sunOpts.intensity) ? sunOpts.intensity : 2.4
    );
    const sunPos = Array.isArray(sunOpts.position) ? sunOpts.position : [8, 14, 6];
    this.sun.position.set(
      isFiniteNumber(sunPos[0]) ? sunPos[0] : 8,
      isFiniteNumber(sunPos[1]) ? sunPos[1] : 14,
      isFiniteNumber(sunPos[2]) ? sunPos[2] : 6
    );

    const sunCastsShadow = enableShadows && sunOpts.castShadow !== false;
    this.sun.castShadow = sunCastsShadow;
    if (sunCastsShadow) {
      const mapSize = isFiniteNumber(sunOpts.shadowMapSize) ? sunOpts.shadowMapSize : 1024;
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.camera.near = 0.5;
      this.sun.shadow.camera.far = 60;
      const extent = isFiniteNumber(sunOpts.shadowExtent) ? sunOpts.shadowExtent : 24;
      this.sun.shadow.camera.left = -extent;
      this.sun.shadow.camera.right = extent;
      this.sun.shadow.camera.top = extent;
      this.sun.shadow.camera.bottom = -extent;
      this.sun.shadow.bias = -0.0005;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const hemiOpts = options.hemi || {};
    this.hemi = new THREE.HemisphereLight(
      hemiOpts.skyColor !== undefined ? hemiOpts.skyColor : 0x9fb8ff,
      hemiOpts.groundColor !== undefined ? hemiOpts.groundColor : 0x3a3320,
      isFiniteNumber(hemiOpts.intensity) ? hemiOpts.intensity : 0.9
    );
    this.scene.add(this.hemi);

    // ----- draw-call monitor state ---------------------------------------
    this._drawCallMonitor = null;
    this._lastInfo = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };
  }

  // Point the camera at a world position and remember it (so a resize or an
  // orbit rig can keep the framing).
  lookAt(x, y, z) {
    this._target.set(x, y, z);
    this.camera.lookAt(this._target);
    return this;
  }

  getTarget() {
    return this._target.clone();
  }

  // Register a callback fired with live renderer.info counts. The loop's render
  // hook (or game code) calls sample() once per frame; the monitor invokes the
  // callback only when a count crosses the optional warnThreshold, keeping the
  // console quiet on a healthy frame.
  //   options: { warnThreshold: number, onSample(stats), onWarn(stats) }
  installDrawCallMonitor(options = {}) {
    this._drawCallMonitor = {
      warnThreshold: isFiniteNumber(options.warnThreshold) ? options.warnThreshold : 100,
      onSample: typeof options.onSample === 'function' ? options.onSample : null,
      onWarn: typeof options.onWarn === 'function' ? options.onWarn : null,
      warned: false
    };
    return this;
  }

  // Read the live render.info counters into a plain object. Call once per
  // rendered frame (after renderer.render) to keep the snapshot fresh.
  sample() {
    const render = this.renderer.info.render;
    const memory = this.renderer.info.memory;
    const stats = {
      drawCalls: render ? render.calls : 0,
      triangles: render ? render.triangles : 0,
      geometries: memory ? memory.geometries : 0,
      textures: memory ? memory.textures : 0,
      programs: this.renderer.info.programs ? this.renderer.info.programs.length : 0
    };
    this._lastInfo = stats;

    const monitor = this._drawCallMonitor;
    if (monitor) {
      if (monitor.onSample) {
        monitor.onSample(stats);
      }
      if (stats.drawCalls > monitor.warnThreshold) {
        if (!monitor.warned && monitor.onWarn) {
          monitor.onWarn(stats);
        }
        monitor.warned = true;
      } else {
        monitor.warned = false;
      }
    }
    return stats;
  }

  getLastInfo() {
    return this._lastInfo;
  }

  // ----- teardown --------------------------------------------------------

  // Recursively free a single Object3D subtree's geometries/materials/textures.
  static disposeObject(object) {
    if (!object) {
      return;
    }
    object.traverse((node) => {
      if (node.geometry && typeof node.geometry.dispose === 'function') {
        node.geometry.dispose();
      }
      const material = node.material;
      if (Array.isArray(material)) {
        for (const mat of material) {
          ThreeSceneRig._disposeMaterial(mat);
        }
      } else if (material) {
        ThreeSceneRig._disposeMaterial(material);
      }
    });
  }

  static _disposeMaterial(material) {
    if (!material) {
      return;
    }
    // Free any texture maps referenced by the material before the material.
    for (const key of Object.keys(material)) {
      const value = material[key];
      if (value && value.isTexture && typeof value.dispose === 'function') {
        value.dispose();
      }
    }
    if (typeof material.dispose === 'function') {
      material.dispose();
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    // Free every geometry / material / texture under the scene.
    if (this.scene) {
      ThreeSceneRig.disposeObject(this.scene);
      this.scene.clear();
    }

    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      this.renderer.dispose();
      if (typeof this.renderer.forceContextLoss === 'function') {
        this.renderer.forceContextLoss();
      }
      const dom = this.renderer.domElement;
      if (dom && dom.parentNode) {
        dom.parentNode.removeChild(dom);
      }
    }

    this._drawCallMonitor = null;
    this.sun = null;
    this.hemi = null;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.domElement = null;
    this.container = null;
  }
}

export default ThreeSceneRig;

// END mChatAI Web Component: core.three-scene-rig
