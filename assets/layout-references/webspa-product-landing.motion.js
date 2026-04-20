// VERBATIM: motion wiring for webspa-product-landing.
// Phase DF — implements wisdom rule fs-008 (2–3 intentional motions).
//
// Two motions live in this file (plain JS — works without Framer Motion):
//   1. sticky-nav-compact  — adds .compact to .nav after 40px of scroll
//   2. hero-fade-up        — handled entirely in CSS @keyframes fadeUp (no JS)
//
// The third motion (hover-cta-lift) is pure CSS (see .btn-primary:hover).
// Do NOT add more motions. fs-008 budget is 2–3 total, not per-file.
//
// In a Framer Motion / React codebase, replace this module with the
// equivalent Framer Motion snippets from `snippets/motion-recipes.json`.

(function initLandingMotion() {
  const nav = document.querySelector('.nav[data-motion="sticky-nav-compact"]');
  if (!nav) return;

  const onScroll = () => {
    const compact = window.scrollY > 40;
    nav.classList.toggle('compact', compact);
  };

  // Initial state + listener. Passive listener — never blocks scroll.
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();
