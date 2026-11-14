// BEGIN mchatai-web-components: ui.quiz-block (ui/learning/QuizBlock.js)
//
// <quiz-block>: the "Check yourself" quiz under a chapter (Phase QL.4,
// mchatai_macOS/docs/QUIZNECT_LEARNING_LAYER_PLAN.md §5 item 1). It plays one quiz set v2
// (mchatai-source/learning/schemas/quiz-set.v2.schema.json).
//
// A WEB CUSTOM ELEMENT, unlike the plain-class blocks beside it: load this one script (classic or
// module) and write the tag. No framework, no dependencies, no trackers.
//
// Usage, three ways to give it the set:
//   <script src="QuizBlock.js"></script>
//   <quiz-block>
//     <script type="application/json">{ "schema": "quiz-set.v2", "id": "…", "questions": [ … ] }</script>
//   </quiz-block>
//   <quiz-block src="quiz/11.json"></quiz-block>      the set, or the service's whole reply ({ set })
//   el.quizSet = set;                                 from code (the book site does this)
//
// Attributes:
//   src             a URL to fetch the set from
//   api-base        the learning API (default: web-api on Cloud Run, below)
//   token-provider  a global function's path, e.g. "myAuth.getIdToken": returns a Firebase ID token
//                   (or a Promise of one) of a real, non-anonymous account, or null
//   limit           show at most this many questions
//   no-shuffle      keep the set's option order (by default options are shuffled, stably per question)
// Properties: quizSet, tokenProvider (a function, as token-provider).
// Without either, window.mchataiAuth?.getIdToken?.() is asked. With no token:
//   - multiple choice and true/false work fully, offline;
//   - short and essay answers show the rubric points and the model answer, with "Sign in to have your
//     answer graded". It never makes up a grade;
//   - attempts are kept on this device (window.mChatAI.storage inside the app, else localStorage).
// With a token: POST /v1/learn/grade grades a written answer, and POST /v1/learn/attempts saves the
// answers to the learner's account (EDUCATION_CLOUD_SERVICES.md). Those are its only network calls,
// besides `src`.
//
// Events (bubble, composed): "quiz-answer" { questionId, type, correct, score }
//                            "quiz-complete" { right, scored, ungraded, missed: [concept], saved }
//
// Theming: CSS custom properties on the element or any ancestor. All optional.
//   --quiz-accent  --quiz-bg  --quiz-text  --quiz-radius  --quiz-font
//   --quiz-muted  --quiz-line  --quiz-ok  --quiz-ok-soft  --quiz-bad  --quiz-bad-soft  --quiz-on-accent
// Defaults follow prefers-color-scheme. Parts for deeper styling: ::part(container), ::part(option),
// ::part(button), ::part(results).

(function () {
  "use strict";
  if (typeof window === "undefined" || !window.customElements || window.customElements.get("quiz-block")) return;

  const API_BASE = "https://web-api-1099075912386.us-central1.run.app";
  const STORE_KEY = "mchatai.quiz.attempts.v1";
  const STORE_MAX = 500;
  const POST_MAX = 100;                       // the attempts route takes at most 100 at a time
  const PASS = 70;                            // a written answer scoring 70 or more counts as right (the API's rule)
  const TYPES = new Set(["mc", "tf", "short", "essay"]);
  const SET_ID = /^[A-Za-z0-9-]{1,80}$/;
  const QUESTION_ID = /^[A-Za-z0-9-]{1,40}$/;

  const CSS = `
:host{display:block;
  --_accent:var(--quiz-accent,#0b6e8c);--_bg:var(--quiz-bg,#fffdf8);--_text:var(--quiz-text,#1c2227);
  --_muted:var(--quiz-muted,#5d6970);--_line:var(--quiz-line,#e3ddd0);
  --_ok:var(--quiz-ok,#2f7a4f);--_ok-soft:var(--quiz-ok-soft,#dcefe3);
  --_bad:var(--quiz-bad,#a3402e);--_bad-soft:var(--quiz-bad-soft,#f6ddd6);
  --_on-accent:var(--quiz-on-accent,#ffffff);--_radius:var(--quiz-radius,12px);
  font:var(--quiz-font,inherit);color:var(--_text)}
@media (prefers-color-scheme:dark){:host{
  --_accent:var(--quiz-accent,#5cb8d6);--_bg:var(--quiz-bg,#181d22);--_text:var(--quiz-text,#e7e5df);
  --_muted:var(--quiz-muted,#9aa5ac);--_line:var(--quiz-line,#2a3239);
  --_ok:var(--quiz-ok,#7cc79c);--_ok-soft:var(--quiz-ok-soft,#17301f);
  --_bad:var(--quiz-bad,#ec8b78);--_bad-soft:var(--quiz-bad-soft,#3a1d17);--_on-accent:var(--quiz-on-accent,#0e161c)}}
:host([hidden]){display:none}
*{box-sizing:border-box}
.wrap{background:var(--_bg);color:var(--_text);border:1px solid var(--_line);border-radius:var(--_radius);padding:14px 16px}
@media (min-width:520px){.wrap{padding:18px 22px}}
.head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:2px 12px;padding-bottom:10px;border-bottom:1px solid var(--_line)}
.head p{margin:0}
.count{font-weight:600}
.score{color:var(--_muted);font-size:.875em;font-variant-numeric:tabular-nums}
ol.qs{list-style:none;margin:0;padding:0}
.q{padding:16px 0;border-bottom:1px solid var(--_line)}
.kick{margin:0 0 4px;font-size:.75em;letter-spacing:.06em;text-transform:uppercase;color:var(--_muted)}
.stem{margin:0 0 12px;font-weight:600;font-size:1.0625em;line-height:1.4;outline-offset:4px}
.opts{display:grid;gap:8px}
button,textarea{font:inherit;color:inherit}
.opt{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;width:100%;min-height:44px;margin:0;
  padding:10px 14px;text-align:left;line-height:1.4;border:1px solid var(--_line);border-radius:max(4px,calc(var(--_radius) - 4px));
  background:transparent;cursor:pointer}
.opt:hover:not([aria-disabled="true"]){border-color:var(--_accent)}
.opt[aria-disabled="true"]{cursor:default}
.opt.key{border-color:var(--_ok);background:var(--_ok-soft)}
.opt.wrong{border-color:var(--_bad);background:var(--_bad-soft)}
.opt .tag{flex:none;font-size:.8125em;font-weight:700;white-space:nowrap}
.opt.key .tag{color:var(--_ok)}
.opt.wrong .tag{color:var(--_bad)}
label{display:block;margin:0 0 6px;font-size:.875em;color:var(--_muted)}
textarea{display:block;width:100%;min-height:6.5em;padding:10px 12px;line-height:1.45;border:1px solid var(--_line);
  border-radius:max(4px,calc(var(--_radius) - 4px));background:transparent;resize:vertical}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.btn{min-height:44px;padding:9px 16px;border-radius:999px;border:1px solid var(--_accent);background:transparent;
  color:var(--_accent);font-weight:600;cursor:pointer;line-height:1.2}
.btn.primary{background:var(--_accent);color:var(--_on-accent)}
.btn.quiet{border-color:var(--_line);color:var(--_muted)}
.btn[disabled]{opacity:.6;cursor:progress}
:focus{outline:none}
:focus-visible{outline:3px solid var(--_accent);outline-offset:2px}
.fb{margin-top:12px;line-height:1.5}
.fb:empty{display:none}
.fb p{margin:0 0 8px}
.verdict{font-weight:700}
.ok{color:var(--_ok)}
.bad{color:var(--_bad)}
.quote{margin:8px 0 0;padding:6px 0 6px 12px;border-left:3px solid var(--_line);color:var(--_muted);font-size:.9375em}
.quote b{font-weight:600}
.sub{margin:10px 0 4px;font-weight:600}
ul.points{margin:0 0 8px;padding:0 0 0 1.2em}
ul.points li{margin:2px 0}
ul.points .st{font-weight:700}
.note{color:var(--_muted);font-size:.875em}
.results{padding-top:16px}
.results h3{margin:0 0 6px;font-size:1.125em;outline-offset:4px}
.big{margin:0 0 8px;font-size:1.25em;font-weight:700}
.results ul{margin:4px 0 10px;padding:0 0 0 1.2em}
.results li{margin:6px 0}
.link{padding:0;border:0;background:none;color:var(--_accent);text-decoration:underline;text-underline-offset:2px;cursor:pointer;text-align:left;font-weight:600}
.foot{display:flex;justify-content:flex-end;margin-top:12px}
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
`;

  // ── small helpers ──────────────────────────────────────────────────────────

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  // DOM replaceChildren writes null as the text "null": optional pieces go through this.
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  const cssEscape = (s) => (window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"));

  // Options shuffled the same way every time for a question (FNV-1a seed, mulberry32), so a
  // reload or a second device shows the same order. The service often stores the key first.
  function seedOf(s) {
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); }
    return x >>> 0;
  }
  function shuffled(list, seedText) {
    let a = seedOf(seedText) || 1;
    const rnd = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }

  // A tolerant reader: a question it cannot play is skipped, never the whole set (QL plan §4).
  function readSet(raw) {
    const set = raw && typeof raw === "object" && raw.set && Array.isArray(raw.set.questions) ? raw.set : raw;
    if (!set || typeof set !== "object" || !Array.isArray(set.questions)) return null;
    const id = SET_ID.test(String(set.id || "")) ? String(set.id) : null;
    const questions = [];
    set.questions.forEach((q, i) => {
      if (!q || typeof q !== "object" || !str(q.question)) return;
      const type = q.type === "spoken" ? "short" : q.type;     // a spoken prompt is answered in writing here
      if (!TYPES.has(type)) return;                           // order, or a type this block does not know
      const qid = QUESTION_ID.test(String(q.id || "")) ? String(q.id) : `q${i + 1}`;
      const src = q.source && typeof q.source === "object" ? q.source : {};
      const item = {
        id: qid, type, question: str(q.question), explanation: str(q.explanation), concept: str(q.concept),
        quote: str(src.quote), options: [], key: "",
        rubric: (Array.isArray(q.rubric) ? q.rubric : []).filter((r) => r && str(r.point))
          .map((r) => ({ point: str(r.point), quote: str(r.quote) })),
        modelAnswer: str(q.modelAnswer),
      };
      if (type === "mc" || type === "tf") {
        let opts = (Array.isArray(q.options) ? q.options : []).filter((o) => typeof o === "string" && o.trim()).map((o) => o.trim());
        let key = q.correctAnswer;
        if (type === "tf") {
          if (opts.length < 2) opts = ["True", "False"];
          if (typeof key === "boolean") key = key ? "True" : "False";
        }
        const hit = opts.find((o) => norm(o) === norm(key));
        if (!hit || new Set(opts.map(norm)).size !== opts.length) return;   // no single keyed option: not playable
        item.options = opts;
        item.key = hit;
      } else if (!item.rubric.length && !item.modelAnswer) {
        return;                                                // nothing to grade against or compare with
      }
      questions.push(item);
    });
    return { id, title: str(set.title), work: str(set.work), chapter: set.chapter == null ? null : set.chapter, questions };
  }

  // Where unsaved attempts wait: the app's storage inside mChatAI, else this browser's localStorage.
  const store = {
    bridge() {
      const s = window.mChatAI && window.mChatAI.storage;
      return s && typeof s.get === "function" && typeof s.set === "function" ? s : null;
    },
    async read() {
      try {
        const b = this.bridge();
        if (b) {
          const v = await b.get(STORE_KEY);
          const list = typeof v === "string" ? JSON.parse(v) : v;
          return Array.isArray(list) ? list : [];
        }
      } catch (_) { /* fall through to localStorage */ }
      try {
        const list = JSON.parse(window.localStorage.getItem(STORE_KEY) || "[]");
        return Array.isArray(list) ? list : [];
      } catch (_) { return []; }
    },
    async write(list) {
      const keep = list.slice(-STORE_MAX);
      try {
        const b = this.bridge();
        if (b) { await b.set(STORE_KEY, keep); return "app"; }
      } catch (_) { /* fall through */ }
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(keep)); return "browser"; } catch (_) { return null; }
    },
  };

  async function postJSON(url, body, token, ms) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
    try {
      const r = await fetch(url, {
        method: "POST", mode: "cors", credentials: "omit", signal: ctl ? ctl.signal : undefined,
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      let json = null;
      try { json = await r.json(); } catch (_) { json = null; }
      return { status: r.status, ok: r.ok, json: json || {} };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ── the element ────────────────────────────────────────────────────────────

  class QuizBlock extends HTMLElement {
    static get observedAttributes() { return ["src"]; }

    constructor() {
      super();
      this._root = this.attachShadow({ mode: "open" });
      this._raw = undefined;
      this._set = null;
      this._tokenFn = null;
      this._seq = 0;
    }

    get quizSet() { return this._raw; }
    set quizSet(v) { this._raw = v; if (this.isConnected) this._show(readSet(v)); }
    get tokenProvider() { return this._tokenFn; }
    set tokenProvider(fn) { this._tokenFn = typeof fn === "function" ? fn : null; }

    connectedCallback() {
      // A property set before this script ran sits on the instance: take it over.
      for (const p of ["quizSet", "tokenProvider"]) {
        if (Object.prototype.hasOwnProperty.call(this, p)) { const v = this[p]; delete this[p]; this[p] = v; }
      }
      if (this._started) return;
      this._started = true;
      this._load();
    }

    attributeChangedCallback(name, was, now) {
      if (name === "src" && this._started && was !== now && this._raw === undefined) this._load();
    }

    _load() {
      if (this._raw !== undefined) return this._show(readSet(this._raw));
      const inline = this.querySelector('script[type="application/json"]');
      if (inline) {
        let raw = null;
        try { raw = JSON.parse(inline.textContent || "null"); } catch (_) { raw = null; }
        return this._show(readSet(raw));
      }
      const src = this.getAttribute("src");
      if (!src) return this._show(null);
      const seq = ++this._seq;
      this._message("Loading the quiz…");
      fetch(src, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((raw) => { if (seq === this._seq) this._show(readSet(raw)); })
        .catch(() => { if (seq === this._seq) this._message("The quiz could not be loaded."); });
    }

    _message(text) {
      fill(this._root, h("style", { text: CSS }), h("div", { class: "wrap", part: "container" }, h("p", { class: "note", text })));
    }

    _apiBase() {
      const a = str(this.getAttribute("api-base"));
      return (/^https:\/\//.test(a) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(a) ? a : API_BASE).replace(/\/+$/, "");
    }

    // The learner's Firebase ID token, or null: this element's provider, the token-provider attribute's
    // function, then window.mchataiAuth. A provider that throws or returns nothing means "signed out".
    async _token() {
      const calls = [];
      if (this._tokenFn) calls.push(() => this._tokenFn());
      const path = str(this.getAttribute("token-provider"));
      if (path) {
        const keys = path.replace(/^window\./, "").split(".");
        const last = keys.pop();
        const owner = keys.reduce((o, k) => (o == null ? undefined : o[k]), window);
        if (owner && typeof owner[last] === "function") calls.push(() => owner[last]());
      }
      const auth = window.mchataiAuth;
      if (auth && typeof auth.getIdToken === "function") calls.push(() => auth.getIdToken());
      for (const call of calls) {
        try {
          const t = await call();
          if (typeof t === "string" && t.length > 20) return t;
        } catch (_) { /* try the next */ }
      }
      return null;
    }

    _show(set) {
      this._set = set;
      if (!set || !set.questions.length) {
        this._message(set ? "This quiz has no questions this page can show." : "No quiz to show.");
        return;
      }
      const limit = parseInt(this.getAttribute("limit"), 10);
      this._qs = limit > 0 ? set.questions.slice(0, limit) : set.questions.slice();
      this._state = new Map(this._qs.map((q) => [q.id, { done: false, correct: null, score: null, graded: false, started: 0 }]));
      this._began = Date.now();
      this._lastAt = this._began;
      this._pending = [];
      this._savedText = "";
      this._render();
    }

    _render() {
      const n = this._qs.length;
      this._scoreEl = h("p", { class: "score" });
      this._announce = h("p", { class: "sr", role: "status", "aria-live": "polite" });
      this._list = h("ol", { class: "qs" }, this._qs.map((q, i) => this._question(q, i, n)));
      this._results = h("section", { class: "results", part: "results", hidden: true, "aria-labelledby": "qb-results" });
      const wrap = h("div", { class: "wrap", part: "container" },
        h("div", { class: "head" }, h("p", { class: "count", text: `${n} question${n === 1 ? "" : "s"}` }), this._scoreEl),
        this._list,
        this._results,
        h("div", { class: "foot" },
          this._announce,
          h("button", { type: "button", class: "btn quiet", part: "button", onclick: () => this._show(this._set) }, "Start over")));
      fill(this._root, h("style", { text: CSS }), wrap);
      this._updateScore();
    }

    _question(q, i, n) {
      const stemId = `qb-stem-${i}`;
      const fb = h("div", { class: "fb", role: "status", "aria-live": "polite" });
      const li = h("li", { class: "q", "data-qid": q.id, "data-type": q.type },
        h("p", { class: "kick", text: `Question ${i + 1} of ${n}${q.type === "tf" ? " · true or false" : q.type === "short" ? " · short answer" : q.type === "essay" ? " · explain it" : ""}` }),
        h("p", { class: "stem", id: stemId, tabindex: "-1", text: q.question }));
      li.addEventListener("focusin", () => { const st = this._state.get(q.id); if (st && !st.started) st.started = Date.now(); });
      if (q.type === "mc" || q.type === "tf") {
        const order = q.type === "tf" || this.hasAttribute("no-shuffle") ? q.options : shuffled(q.options, `${this._set.id || ""}/${q.id}`);
        const group = h("div", { class: "opts", role: "group", "aria-labelledby": stemId });
        for (const opt of order) {
          const b = h("button", { type: "button", class: "opt", part: "option", "data-option": opt }, h("span", { class: "txt", text: opt }));
          b.addEventListener("click", () => this._choose(q, opt, group, fb));
          group.append(b);
        }
        li.append(group, fb);
      } else {
        const taId = `qb-answer-${i}`;
        const ta = h("textarea", { id: taId, rows: "4", spellcheck: "true" });
        const grade = h("button", { type: "button", class: "btn primary", part: "button", "data-act": "grade" }, "Grade my answer");
        const reveal = h("button", { type: "button", class: "btn", part: "button", "data-act": "reveal" }, "Show the model answer");
        grade.addEventListener("click", () => this._grade(q, ta, grade, fb));
        reveal.addEventListener("click", () => this._reveal(q, fb, null));
        li.append(h("label", { for: taId, text: "Your answer" }), ta, h("div", { class: "acts" }, grade, reveal), fb);
      }
      return li;
    }

    _seconds(st) {
      const now = Date.now();
      const from = st.started || this._lastAt || this._began;
      this._lastAt = now;
      return Math.max(0, Math.min(3600, Math.round((now - from) / 1000)));
    }

    _fromText(quote) {
      return quote ? h("p", { class: "quote" }, h("b", { text: "From the text: " }), `“${quote}”`) : null;
    }

    _choose(q, opt, group, fb) {
      const st = this._state.get(q.id);
      if (!st || st.done) return;
      const right = opt === q.key;
      Object.assign(st, { done: true, correct: right, graded: true, seconds: this._seconds(st), mode: "tap" });
      for (const b of group.querySelectorAll("button.opt")) {
        const o = b.getAttribute("data-option");
        b.setAttribute("aria-disabled", "true");
        if (o === q.key) {
          b.classList.add("key");
          b.append(h("span", { class: "tag", text: o === opt ? "✓ Your answer" : "✓ Correct answer" }));
        } else if (o === opt) {
          b.classList.add("wrong");
          b.append(h("span", { class: "tag", text: "✗ Your answer" }));
        }
        if (o === opt) b.setAttribute("aria-pressed", "true");
      }
      fill(fb,
        h("p", {}, h("span", { class: `verdict ${right ? "ok" : "bad"}`, text: right ? "Right. " : "Not quite. " }),
          right ? "" : `The answer is “${q.key}”. `, q.explanation),
        this._fromText(q.quote));
      this._answered(q, st);
    }

    _rubricBlock(q, heading) {
      const out = [];
      if (q.rubric.length) {
        out.push(h("p", { class: "sub", text: heading || "A good answer makes these points:" }),
          h("ul", { class: "points" }, q.rubric.map((r) => h("li", { text: r.point }))));
      }
      if (q.modelAnswer) out.push(h("p", { class: "sub", text: "Model answer:" }), h("p", { text: q.modelAnswer }));
      out.push(this._fromText(q.quote));
      return out;
    }

    // The model answer without a grade: the learner compares for themselves (the LLM-SOFT fallback).
    _reveal(q, fb, why) {
      const st = this._state.get(q.id);
      if (!st || (st.graded && !why)) return;          // a real grade already shows the model answer
      fill(fb, ...(why ? [h("p", { class: "note", text: why })] : []), ...this._rubricBlock(q));
      if (!st.done) {
        Object.assign(st, { done: true, graded: false });
        this._answered(q, st);
      }
    }

    async _grade(q, ta, button, fb) {
      const st = this._state.get(q.id);
      const answer = ta.value.trim();
      if (!st || st.busy) return;
      if (!answer) {
        fill(fb, h("p", { class: "note", text: "Write your answer first, then grade it." }));
        ta.focus();
        return;
      }
      const token = await this._token();
      if (!token) return this._reveal(q, fb, "Sign in to have your answer graded. Meanwhile, compare yours with these.");
      if (!q.rubric.length) return this._reveal(q, fb, "This question has no rubric to grade against. Compare yours with the model answer.");
      st.busy = true;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      const label = button.textContent;
      button.textContent = "Grading…";
      fill(fb, h("p", { class: "note", text: "Grading your answer…" }));
      let res = null;
      try {
        res = await postJSON(`${this._apiBase()}/v1/learn/grade`, {
          question: { question: q.question, type: q.type === "essay" ? "essay" : "short", rubric: q.rubric, modelAnswer: q.modelAnswer },
          answer, mode: "typed",
        }, token, 90000);
      } catch (_) {
        res = null;
      } finally {
        st.busy = false;
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = label;
      }
      const j = (res && res.json) || {};
      if (!res) return this._reveal(q, fb, "Grading could not be reached just now. Compare yours with these.");
      if (res.ok && j.graded === true && Number.isFinite(j.score)) return this._graded(q, st, j, fb);
      const why = res.ok ? "The grader could not grade this one. Compare yours with these."
        : res.status === 401 ? (j.code === "sign_in_required" ? "Sign in to have your answer graded." : "Your sign-in has expired. Sign in again to have your answer graded.")
        : res.status === 402 ? "Grading uses compute tokens, and this account has none left. Compare yours with these."
        : res.status === 413 ? "That answer is too long to grade. Shorten it and try again, or compare it with these."
        : res.status === 429 ? "Too many grading requests just now. Try again in a minute, or compare yours with these."
        : `Grading failed (HTTP ${res.status}). Compare yours with these.`;
      return this._reveal(q, fb, why);
    }

    _graded(q, st, j, fb) {
      const score = Math.max(0, Math.min(100, Math.round(j.score)));
      const words = { hit: "Made", partial: "Partly", missed: "Missed" };
      const points = Array.isArray(j.points) ? j.points.filter((p) => p && str(p.point)) : [];
      const errors = Array.isArray(j.errors) ? j.errors.map(str).filter(Boolean) : [];
      const right = score >= PASS;
      fill(fb,
        h("p", {}, h("span", { class: `verdict ${right ? "ok" : "bad"}`, text: `Graded: ${score} out of 100. ` }), str(j.feedback)),
        points.length ? h("ul", { class: "points" }, points.map((p) => h("li", {},
          h("span", { class: `st ${p.status === "hit" ? "ok" : p.status === "partial" ? "" : "bad"}`, text: `${words[p.status] || "Missed"}: ` }), str(p.point)))) : null,
        errors.length ? h("p", { class: "sub", text: "Not right in your answer:" }) : null,
        errors.length ? h("ul", { class: "points" }, errors.map((e) => h("li", { text: e }))) : null,
        str(j.modelAnswer || q.modelAnswer) ? h("p", { class: "sub", text: "Model answer:" }) : null,
        str(j.modelAnswer || q.modelAnswer) ? h("p", { text: str(j.modelAnswer || q.modelAnswer) }) : null,
        str(j.followUp) ? h("p", {}, h("b", { text: "Try next: " }), str(j.followUp)) : null,
        this._fromText(q.quote));
      Object.assign(st, { done: true, graded: true, correct: right, score, seconds: this._seconds(st), mode: q.type === "essay" ? "essay" : "typed" });
      this._answered(q, st);
    }

    // Every scored answer is one attempt, waiting until the quiz is complete; after that each new grade
    // (a written answer graded again) is saved at once.
    _answered(q, st) {
      if (st.graded && this._set.id) {
        const a = { setId: this._set.id, questionId: q.id, concept: (q.concept || "").slice(0, 80), mode: st.mode || "tap",
                    seconds: st.seconds, at: new Date().toISOString() };
        if (st.score !== null && st.score !== undefined) a.score = st.score; else a.correct = !!st.correct;
        this._pending.push(a);
      }
      this.dispatchEvent(new CustomEvent("quiz-answer", { bubbles: true, composed: true,
        detail: { questionId: q.id, type: q.type, correct: st.graded ? st.correct : null, score: st.score } }));
      this._updateScore();
      if (this._complete()) this._finish();
    }

    _complete() { return this._qs.every((q) => this._state.get(q.id).done); }

    _tally() {
      let right = 0, scored = 0, done = 0, ungraded = 0;
      const missed = [];
      for (const q of this._qs) {
        const st = this._state.get(q.id);
        if (st.done) done++;
        if (st.done && st.graded) {
          scored++;
          if (st.correct) right++;
          else if (!missed.some((m) => norm(m.concept) === norm(q.concept || q.question))) missed.push({ concept: q.concept || q.question, q });
        } else if (st.done) ungraded++;
      }
      return { right, scored, done, ungraded, missed };
    }

    _updateScore() {
      const t = this._tally();
      const left = this._qs.length - t.done;
      this._scoreEl.textContent = !t.done ? "Not started" : t.scored
        ? `Score: ${t.right} of ${t.scored}${left ? ` · ${left} to go` : " · done"}` : `${left ? `${left} to go` : "Done"}`;
    }

    _finish() {
      const t = this._tally();
      const box = this._results;
      const ul = t.missed.length ? h("ul", {}, t.missed.map((m) => h("li", {},
        h("button", { type: "button", class: "link", onclick: () => this._goTo(m.q) }, m.concept),
        this._fromText(m.q.quote)))) : null;
      this._saveLine = h("p", { class: "note", role: "status", "aria-live": "polite", text: this._savedText || "" });
      fill(box,
        h("h3", { id: "qb-results", tabindex: "-1", text: "Your results" }),
        h("p", { class: "big", text: t.scored ? `${t.right} of ${t.scored} right` : "Nothing scored yet" }),
        t.ungraded ? h("p", { class: "note", text: `${t.ungraded} written answer${t.ungraded === 1 ? " was" : "s were"} not graded. Sign in to have ${t.ungraded === 1 ? "it" : "them"} graded.` }) : null,
        t.missed.length ? h("p", { class: "sub", text: "Review these:" }) : null,
        ul,
        !t.missed.length && t.scored ? h("p", { text: "Nothing to review: every scored answer was right." }) : null,
        this._saveLine);
      box.hidden = false;
      this._announce.textContent = `Quiz complete. ${t.scored ? `${t.right} of ${t.scored} right.` : ""}${t.missed.length ? ` ${t.missed.length} to review.` : ""}`;
      this._save(t);
    }

    _goTo(q) {
      const li = this._list.querySelector(`li[data-qid="${cssEscape(q.id)}"]`);
      const stem = li && li.querySelector(".stem");
      if (!stem) return;
      stem.scrollIntoView({ block: "center", behavior: "smooth" });
      stem.focus({ preventScroll: true });
    }

    // To the account when signed in (with anything kept on this device before), else on this device.
    async _save(t) {
      const fresh = this._pending.splice(0);
      const detail = { right: t.right, scored: t.scored, ungraded: t.ungraded, missed: t.missed.map((m) => m.concept), saved: null };
      const say = (text, where) => {
        this._savedText = text;
        if (this._saveLine) this._saveLine.textContent = text;
        detail.saved = where;
        this.dispatchEvent(new CustomEvent("quiz-complete", { bubbles: true, composed: true, detail }));
      };
      if (!this._set.id) return say("This quiz has no id, so its answers are not saved.", null);
      if (!fresh.length) return say(this._savedText || "", null);
      if (this._saveLine) this._saveLine.textContent = "Saving your answers…";
      const kept = await store.read();
      const token = await this._token();
      if (token) {
        const batch = kept.filter((a) => a && a.setId && a.questionId).concat(fresh).slice(-POST_MAX);
        let res = null;
        try {
          res = await postJSON(`${this._apiBase()}/v1/learn/attempts`, {
            attempts: batch.map(({ setId, questionId, concept, correct, score, mode, seconds }) =>
              Object.assign({ setId, questionId, concept, mode, seconds }, score !== undefined ? { score } : { correct })),
          }, token, 20000);
        } catch (_) { res = null; }
        if (res && res.ok && res.json && res.json.ok) {
          const sent = new Set(batch);
          await store.write(kept.filter((a) => !sent.has(a)));
          return say("Saved to your mchatai.com account.", "account");
        }
        await store.write(kept.concat(fresh));
        return say(`Saved on this device: your account could not be reached${res ? ` (HTTP ${res.status})` : " just now"}.`, "device");
      }
      const where = await store.write(kept.concat(fresh));
      return where ? say("Saved on this device. Sign in to keep your progress across devices.", "device")
        : say("Your answers could not be saved on this device.", null);
    }
  }

  window.customElements.define("quiz-block", QuizBlock);
  window.QuizBlock = QuizBlock;
})();
// END mchatai-web-components: ui.quiz-block
