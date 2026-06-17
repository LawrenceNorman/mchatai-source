// BEGIN mChatAI Web Component: effects.blob-shadow
//
// Cheap fake contact shadows. A real shadow-casting light costs a full extra
// render pass per light and tanks mobile GPUs, so the wisdom budget (tjs-010)
// is exactly ONE shadow-casting light -- the DirectionalLight sun -- and every
// other entity gets a "blob shadow": a soft dark disc laid flat on the ground
// directly under it. It reads as grounded contact without any shadow map.
//
// Two flavours:
//   BlobShadow      -- one disc you attach to one entity. Use for the player or
//                      a handful of important objects.
//   BlobShadowPool  -- many discs backed by a single InstancedMesh (one draw
//                      call) for crowds of enemies / props. Slots are claimed
//                      and released like a free-list.
//
// The disc texture is generated on a 2D canvas at runtime (a radial gradient),
// so there are zero image files and it works offline under file://.
//
// Offline-safe: imports only the canonical bare 'three' specifier.
//
// Usage (single):
//   import { BlobShadow } from './effects/blob-shadow.js';
//   const shadow = new BlobShadow({ scene, radius: 0.6 });
//   // each frame, after the entity moves:
//   shadow.followGround(playerMesh, groundY);   // groundY defaults to 0
//   // on teardown:
//   shadow.dispose();
//
// Usage (pool):
//   const shadows = new BlobShadowPool({ scene, capacity: 128, radius: 0.5 });
//   const id = shadows.claim();                 // -> slot index, or -1 if full
//   shadows.place(id, enemyMesh, groundY);      // each frame
//   shadows.release(id);                        // when the enemy dies
//   shadows.dispose();

import * as THREE from 'three';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Build a soft radial-gradient disc texture once. Opaque-ish at the center,
// fully transparent at the rim, so the edge melts into the ground.
function makeBlobTexture(softness) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const inner = size * 0.5 * (1 - softness);
  const gradient = ctx.createRadialGradient(cx, cy, Math.max(0, inner), cx, cy, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(0.7, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Shared, ref-counted texture so many shadows do not each allocate a canvas.
let _sharedTexture = null;
let _sharedRefs = 0;
function acquireSharedTexture(softness) {
  if (!_sharedTexture) {
    _sharedTexture = makeBlobTexture(isFiniteNumber(softness) ? softness : 0.25);
  }
  _sharedRefs += 1;
  return _sharedTexture;
}
function releaseSharedTexture() {
  _sharedRefs = Math.max(0, _sharedRefs - 1);
  if (_sharedRefs === 0 && _sharedTexture) {
    _sharedTexture.dispose();
    _sharedTexture = null;
  }
}

// BlobShadow -- a single ground disc.
export class BlobShadow {
  // opts:
  //   scene    (required) THREE.Scene to add the disc to.
  //   radius   disc radius in world units. Default 0.6.
  //   opacity  peak opacity. Default 0.6.
  //   color    tint. Default 0x000000.
  //   softness 0..1 edge softness; larger = softer rim. Default 0.25.
  //   lift     small Y offset to avoid z-fighting with the ground. Default 0.02.
  constructor(opts = {}) {
    this.radius = isFiniteNumber(opts.radius) ? Math.max(0.01, opts.radius) : 0.6;
    this.opacity = isFiniteNumber(opts.opacity) ? Math.max(0, Math.min(1, opts.opacity)) : 0.6;
    this.lift = isFiniteNumber(opts.lift) ? opts.lift : 0.02;
    this._softness = isFiniteNumber(opts.softness) ? opts.softness : 0.25;
    this._scene = opts.scene || null;
    this._texture = acquireSharedTexture(this._softness);
    this._disposed = false;

    const geometry = new THREE.PlaneGeometry(this.radius * 2, this.radius * 2);
    const material = new THREE.MeshBasicMaterial({
      map: this._texture,
      color: opts.color !== undefined ? new THREE.Color(opts.color) : new THREE.Color(0x000000),
      transparent: true,
      opacity: this.opacity,
      depthWrite: false,
      // Sit just above the ground; do not occlude it.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      fog: false
    });
    this._geometry = geometry;
    this._material = material;

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'mchatai-blob-shadow';
    // Lay flat on the XZ plane (planes face +Z by default).
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = -1; // draw before normal opaque so it never hides geometry
    this.mesh.frustumCulled = false;

    if (this._scene) {
      this._scene.add(this.mesh);
    }
  }

  // Position the disc directly under an object (or a Vector3), flat on groundY.
  followGround(objectOrVec3, groundY = 0) {
    if (this._disposed) {
      return this;
    }
    const p = objectOrVec3 && objectOrVec3.position ? objectOrVec3.position : objectOrVec3;
    if (p && isFiniteNumber(p.x)) {
      this.mesh.position.set(p.x, groundY + this.lift, p.z);
    }
    return this;
  }

  // Fade the shadow (e.g. shrink as a jumping entity rises).
  setStrength(scale01) {
    if (this._disposed) {
      return this;
    }
    const s = Math.max(0, Math.min(1, scale01));
    this._material.opacity = this.opacity * s;
    this.mesh.visible = s > 0.001;
    return this;
  }

  setVisible(on) {
    if (!this._disposed) {
      this.mesh.visible = !!on;
    }
    return this;
  }

  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    this._geometry.dispose();
    this._material.dispose();
    releaseSharedTexture();
  }
}

// BlobShadowPool -- many discs in one InstancedMesh (one draw call).
export class BlobShadowPool {
  // opts:
  //   scene    (required) THREE.Scene.
  //   capacity max simultaneous shadows. Default 128.
  //   radius   default disc radius. Default 0.5.
  //   opacity  peak opacity. Default 0.55.
  //   color    tint. Default 0x000000.
  //   softness 0..1 edge softness. Default 0.25.
  //   lift     Y offset above ground. Default 0.02.
  constructor(opts = {}) {
    this.capacity = isFiniteNumber(opts.capacity) ? Math.max(1, Math.floor(opts.capacity)) : 128;
    this.radius = isFiniteNumber(opts.radius) ? Math.max(0.01, opts.radius) : 0.5;
    this.lift = isFiniteNumber(opts.lift) ? opts.lift : 0.02;
    this._softness = isFiniteNumber(opts.softness) ? opts.softness : 0.25;
    this._scene = opts.scene || null;
    this._texture = acquireSharedTexture(this._softness);
    this._disposed = false;

    const geometry = new THREE.PlaneGeometry(this.radius * 2, this.radius * 2);
    geometry.rotateX(-Math.PI / 2); // bake the flat-on-ground orientation in
    const material = new THREE.MeshBasicMaterial({
      map: this._texture,
      color: opts.color !== undefined ? new THREE.Color(opts.color) : new THREE.Color(0x000000),
      transparent: true,
      opacity: isFiniteNumber(opts.opacity) ? Math.max(0, Math.min(1, opts.opacity)) : 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      fog: false
    });
    this._geometry = geometry;
    this._material = material;

    this.object3d = new THREE.InstancedMesh(geometry, material, this.capacity);
    this.object3d.name = 'mchatai-blob-shadow-pool';
    this.object3d.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = -1;
    this.object3d.count = this.capacity;

    // Free-list of slot indices.
    this._free = [];
    for (let i = this.capacity - 1; i >= 0; i--) {
      this._free.push(i);
    }
    this._active = new Set();
    this._m = new THREE.Matrix4();
    this._hidden = new THREE.Matrix4().makeScale(0, 0, 0); // collapsed = invisible

    // Start all slots hidden.
    for (let i = 0; i < this.capacity; i++) {
      this.object3d.setMatrixAt(i, this._hidden);
    }
    this.object3d.instanceMatrix.needsUpdate = true;

    if (this._scene) {
      this._scene.add(this.object3d);
    }
  }

  // Claim a slot. Returns the slot id, or -1 if the pool is full.
  claim() {
    if (this._disposed || this._free.length === 0) {
      return -1;
    }
    const id = this._free.pop();
    this._active.add(id);
    return id;
  }

  // Position a claimed slot under an object (or Vector3) on groundY. Optional
  // per-slot scale (e.g. for differently sized entities).
  place(id, objectOrVec3, groundY = 0, scale = 1) {
    if (this._disposed || !this._active.has(id)) {
      return this;
    }
    const p = objectOrVec3 && objectOrVec3.position ? objectOrVec3.position : objectOrVec3;
    if (!p || !isFiniteNumber(p.x)) {
      return this;
    }
    const s = Math.max(0, scale);
    this._m.makeScale(s, s, s);
    this._m.setPosition(p.x, groundY + this.lift, p.z);
    this.object3d.setMatrixAt(id, this._m);
    this.object3d.instanceMatrix.needsUpdate = true;
    return this;
  }

  // Release a slot back to the pool and collapse its disc.
  release(id) {
    if (this._disposed || !this._active.has(id)) {
      return this;
    }
    this._active.delete(id);
    this._free.push(id);
    this.object3d.setMatrixAt(id, this._hidden);
    this.object3d.instanceMatrix.needsUpdate = true;
    return this;
  }

  get activeCount() {
    return this._active.size;
  }

  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (this.object3d.parent) {
      this.object3d.parent.remove(this.object3d);
    }
    this._geometry.dispose();
    this._material.dispose();
    this.object3d.dispose();
    releaseSharedTexture();
  }
}

// END mChatAI Web Component: effects.blob-shadow
