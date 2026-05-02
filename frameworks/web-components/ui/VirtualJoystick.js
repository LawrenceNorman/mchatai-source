function resolveTarget(target) {
  if (!target || typeof document === "undefined") {
    return null;
  }
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class VirtualJoystick {
  constructor(options = {}) {
    this.radius = options.radius ?? 56;
    this.deadZone = options.deadZone ?? 0.15;
    this.value = { x: 0, y: 0, active: false };
    this.onChange = typeof options.onChange === "function" ? options.onChange : null;
    this.element = this._createElement(options.className || "mchatai-joystick");
    this.knob = this.element.querySelector("[data-role='knob']");
    this.pointerId = null;
    this.center = { x: 0, y: 0 };
    this._bind();

    const target = resolveTarget(options.target);
    if (target) {
      target.appendChild(this.element);
    }
  }

  attach(target) {
    const resolved = resolveTarget(target);
    if (resolved) {
      resolved.appendChild(this.element);
    }
    return this;
  }

  destroy() {
    this.element.remove();
  }

  _createElement(className) {
    const root = document.createElement("div");
    root.className = className;
    root.style.touchAction = "none";
    root.innerHTML = `<div data-role="knob" class="${className}__knob"></div>`;
    return root;
  }

  _bind() {
    this.element.addEventListener("pointerdown", (event) => {
      this.pointerId = event.pointerId;
      this.element.setPointerCapture(event.pointerId);
      const rect = this.element.getBoundingClientRect();
      this.center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this._updateFromPointer(event);
    });
    this.element.addEventListener("pointermove", (event) => {
      if (event.pointerId === this.pointerId) {
        this._updateFromPointer(event);
      }
    });
    const end = (event) => {
      if (event.pointerId === this.pointerId) {
        this.pointerId = null;
        this.value = { x: 0, y: 0, active: false };
        this._renderKnob(0, 0);
        this._emit();
      }
    };
    this.element.addEventListener("pointerup", end);
    this.element.addEventListener("pointercancel", end);
  }

  _updateFromPointer(event) {
    const dx = event.clientX - this.center.x;
    const dy = event.clientY - this.center.y;
    const mag = Math.min(1, Math.hypot(dx, dy) / this.radius);
    const angle = Math.atan2(dy, dx);
    const raw = { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag };
    const active = mag >= this.deadZone;
    this.value = active ? { ...raw, active } : { x: 0, y: 0, active: false };
    this._renderKnob(raw.x, raw.y);
    this._emit();
  }

  _renderKnob(x, y) {
    if (this.knob) {
      this.knob.style.transform = `translate(${x * this.radius}px, ${y * this.radius}px)`;
    }
  }

  _emit() {
    if (this.onChange) {
      this.onChange(this.value);
    }
  }
}
