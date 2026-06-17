// BEGIN mChatAI Web Component: models.gltf-model-player-3d
//
// Thin wrapper over the vendored GLTFLoader + THREE.AnimationMixer so a game can
// load a local .glb (or a base64-embedded GLB module from the built-in model
// library) and play its skeletal animations with one call. The vendored loader
// already sits at resources/three/addons/loaders/GLTFLoader.js and is resolved
// by the importmap's 'three/addons/' prefix.
//
// IMPORTANT: this is the OPT-IN path for real GLB assets. The offline-first
// DEFAULT for creatures/characters is models.procedural-creatures-3d (zero asset
// files, no loader). Reach for GLB only when a prompt asks for detailed/rigged/
// realistic models and a curated CC0 asset is available (tjs-018).
//
// Offline-safe: loads from a local URL or an in-memory ArrayBuffer/base64 module
// via GLTFLoader.parse -- never the network. THREE is passed in.
//
// Usage (local .glb):
//   import { loadGltfModel } from './models/gltf-model-player-3d.js';
//   const m = await loadGltfModel(THREE, { url: './resources/models/knight.glb' });
//   scene.add(m.scene);
//   m.play('Idle');
//   // each frame: m.update(dt);
//   m.crossFade('Idle', 'Run', 0.3);
//
// Usage (base64-embedded GLB module from the built-in library):
//   import { loadSkeletonWarrior } from './models/glb/kaykit-skeleton.glb.js';
//   const m = await loadGltfModel(THREE, { glbModule: loadSkeletonWarrior });

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// loadGltfModel(THREE, opts) -> Promise<{ scene, clips, mixer, play, crossFade,
//   update, dispose }>
//
// opts (one source required):
//   url        local relative path to a .glb / .gltf file.
//   arrayBuffer  a GLB ArrayBuffer (e.g. decoded from base64).
//   glbModule  async fn (THREE, GLTFLoader) -> { scene, animations } from a
//              base64-embedded library module.
//   scale      uniform scale. Default 1.
//   loader     optional pre-made GLTFLoader to reuse.
export async function loadGltfModel(THREE, opts = {}) {
  const loader = opts.loader || new GLTFLoader();

  let scene = null;
  let animations = [];

  if (typeof opts.glbModule === 'function') {
    const res = await opts.glbModule(THREE, GLTFLoader);
    scene = res.scene;
    animations = res.animations || [];
  } else if (opts.arrayBuffer) {
    const gltf = await _parse(loader, opts.arrayBuffer);
    scene = gltf.scene;
    animations = gltf.animations || [];
  } else if (opts.url) {
    const gltf = await _load(loader, opts.url);
    scene = gltf.scene;
    animations = gltf.animations || [];
  } else {
    throw new Error('loadGltfModel: provide one of url, arrayBuffer, or glbModule');
  }

  if (opts.scale != null && scene && scene.scale) {
    scene.scale.setScalar(opts.scale);
  }

  const mixer = new THREE.AnimationMixer(scene);
  const clipsByName = {};
  for (const clip of animations) {
    clipsByName[clip.name] = clip;
  }
  let current = null;

  function play(name, opts2 = {}) {
    const clip = clipsByName[name];
    if (!clip) return null;
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(opts2.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = !!opts2.once;
    action.play();
    if (current && current !== action) current.stop();
    current = action;
    return action;
  }

  function crossFade(fromName, toName, duration = 0.3) {
    const from = clipsByName[fromName] && mixer.clipAction(clipsByName[fromName]);
    const to = clipsByName[toName] && mixer.clipAction(clipsByName[toName]);
    if (!to) return null;
    to.reset();
    to.setLoop(THREE.LoopRepeat, Infinity);
    to.play();
    if (from && from !== to) {
      from.crossFadeTo(to, duration, false);
    }
    current = to;
    return to;
  }

  function update(dt) {
    mixer.update(dt || 0);
  }

  function dispose() {
    if (mixer) mixer.stopAllAction();
    if (scene) {
      scene.traverse((obj) => {
        if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mt of mats) {
            for (const key in mt) {
              const v = mt[key];
              if (v && v.isTexture && v.dispose) v.dispose();
            }
            if (mt.dispose) mt.dispose();
          }
        }
      });
      if (scene.parent) scene.parent.remove(scene);
    }
  }

  return {
    scene,
    clips: animations,
    clipNames: Object.keys(clipsByName),
    mixer,
    play,
    crossFade,
    update,
    dispose
  };
}

function _load(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function _parse(loader, arrayBuffer) {
  return new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });
}

// preloadGltf(THREE, urls) -> Promise<Map<url, model>> for warming a small set.
export async function preloadGltf(THREE, urls = []) {
  const loader = new GLTFLoader();
  const out = new Map();
  for (const url of urls) {
    try {
      out.set(url, await loadGltfModel(THREE, { url, loader }));
    } catch (e) {
      out.set(url, null);
    }
  }
  return out;
}

// GltfAnimationPlayer -- a class wrapper for callers who prefer `new`.
export class GltfAnimationPlayer {
  constructor(model) {
    this.model = model; // the object returned by loadGltfModel
  }
  play(name, opts) { return this.model.play(name, opts); }
  crossFade(a, b, d) { return this.model.crossFade(a, b, d); }
  update(dt) { this.model.update(dt); }
  dispose() { this.model.dispose(); }
  get clipNames() { return this.model.clipNames; }
}

// END mChatAI Web Component: models.gltf-model-player-3d
