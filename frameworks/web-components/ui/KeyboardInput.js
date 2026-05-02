export class KeyboardInput {
  constructor(options = {}) {
    this.target = options.target ?? window;
    this.bindings = new Map();
    this.onText = options.onText ?? (() => {});
    this.onAction = options.onAction ?? (() => {});
    this.enabled = true;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.target.addEventListener("keydown", this.handleKeyDown);
  }

  bind(key, action) {
    this.bindings.set(String(key).toLowerCase(), action);
    return this;
  }

  bindMany(mapping) {
    for (const [key, action] of Object.entries(mapping)) {
      this.bind(key, action);
    }
    return this;
  }

  handleKeyDown(event) {
    if (!this.enabled) {
      return;
    }
    const key = event.key.toLowerCase();
    if (this.bindings.has(key)) {
      event.preventDefault();
      this.onAction(this.bindings.get(key), event);
      return;
    }
    if (/^[a-z0-9]$/i.test(event.key)) {
      this.onText(event.key, event);
    }
  }

  destroy() {
    this.target.removeEventListener("keydown", this.handleKeyDown);
  }
}
