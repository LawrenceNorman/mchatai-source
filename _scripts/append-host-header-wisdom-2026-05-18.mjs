// Add a universal wisdom rule reserving the top-right viewport corner for
// the platform's injected chrome (Hub / Trophy / Feedback / Sign-in pills).
// ASCII-only.
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'wisdom/packs/universal.json';
const pack = JSON.parse(readFileSync(path, 'utf-8'));
pack.guidelines = pack.guidelines || [];
const existing = new Set(pack.guidelines.map(g => g.id));

const NEW = {
  id: 'u-host-header-keep-corner-clear',
  rule: 'Reserve the TOP-RIGHT corner of the viewport (approximately 200x60 CSS pixels) as EMPTY space. The mchatai.com serve layer (serveUserProject) auto-injects four chrome pills there after publish: Hub (right:8px), Trophy (right:46px), Feedback (right:84px), Sign-in (right:122px) at top:8px. If the generated artifact places a HUD title, hand counter, phase indicator, score badge, or any other persistent element in that area, it will be overlapped by injected chrome. Do NOT use `position:fixed` or `position:absolute` with `top:0; right:0` for any critical UI. If a HUD spans the full top, use a 3-column grid (`grid-template-columns:1fr auto 1fr`) with content on left + center and an empty right column, OR add `padding-right: 200px` to leave room.',
  why: 'Every published hub mini-app gets the same top-right pill strip injected at serve time. Artifacts that place their own UI in this corner end up with overlapping chrome that obscures both the artifact and the platform controls. User reported 2026-05-18 after a Hearts build where the Phase indicator landed in the top-right and collided with the (would-be) Trophy pill area.',
  severity: 'high',
  appliesTo: 'all',
  examples: [
    'HUD using `display:flex; justify-content:space-between` with 2 children pushes the second child to the top-right corner — instead use `display:grid; grid-template-columns:1fr auto 1fr` to keep content centered with empty right column.',
    'BAD: <div style="position:fixed; top:10px; right:10px">Score: 42</div>',
    'GOOD: <div style="position:fixed; top:10px; left:50%; transform:translateX(-50%)">Score: 42</div>'
  ]
};

if (existing.has(NEW.id)) {
  console.log('SKIP — rule already exists.');
  process.exit(0);
}
pack.guidelines.push(NEW);
pack.version = (pack.version || 0) + 1;
writeFileSync(path, JSON.stringify(pack, null, 2) + '\n');
console.log(`ADD universal ${NEW.id} (now v${pack.version}, ${pack.guidelines.length} rules)`);
