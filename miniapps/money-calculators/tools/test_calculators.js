// Money - Calculators in headless Chromium: the handbook's worked figures, a prefilled link, the chapter links (shown only where
// the app can open one chapter, for an account with the book), and no sideways scroll on a phone.
//   NODE_PATH=<a node_modules with playwright> node tools/test_calculators.js [index.html]
const path = require('path');
const { chromium } = require('playwright');

const page_file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));

async function open(browser, { bridge, query = '', width = 390 }) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
  await context.addInitScript(({ bridge }) => {
    window.__calls = [];
    if (bridge) {
      window.mChatAI = {
        pack: { info: async () => ({ features: bridge.features, library: bridge.library }) },
        library: { open: async (a) => { window.__calls.push(a); return { opened: true }; } },
      };
    }
  }, { bridge });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file://' + page_file + query);
  return { page, errors, context };
}

(async () => {
  const browser = await chromium.launch();
  const failures = [];
  const expect = (ok, what) => { if (!ok) failures.push(what); };
  const text = (page, id) => page.textContent('#' + id);

  // A. The defaults are the handbook's own examples (chapters 5 and 7), and a card worked out a month at a time.
  {
    const { page, errors, context } = await open(browser, {});
    const g = await text(page, 'g-out');
    expect(/\$1,000 grows to \$4,321\.94 after 30 years/.test(g) && /simple interest it would be \$2,500\.00/.test(g), 'A growth: ' + g);
    await page.click('#t-monthly');
    const m = await text(page, 'm-out');
    expect(/builds \$83,226 after 30 years: \$36,000 deposited and \$47,226 grown/.test(m), 'A monthly: ' + m);
    await page.click('#t-card');
    const c = await text(page, 'c-out');
    expect(/paid off in 2 years and 2 months, with about \$514\.29 paid in interest/.test(c), 'A card: ' + c);
    await page.fill('#c-pay', '30');
    const never = await text(page, 'c-out');
    expect(/adds about \$36\.67 of interest a month, so \$30 a month never pays it off/.test(never), 'A never: ' + never);
    await page.click('#t-fee');
    const f = await text(page, 'f-out');
    expect(/worth about \$43,219 after 30 years with a yearly fee of 1%, against \$57,435 with no fee: the fee costs \$14,215/.test(f), 'A fee: ' + f);
    await page.fill('#f-fee', '0.25');
    expect(/\$53,507 after 30 years/.test(await text(page, 'f-out')), 'A fee 0.25%');
    // Chapter 5's ten-year figure and his iPhone's question (11-18): $500 at 5% for 10 and 15 years.
    await page.click('#t-growth');
    await page.fill('#g-years', '10');
    expect(/\$1,628\.89 after 10 years/.test(await text(page, 'g-out')), 'A ten years');
    expect(!(await page.isVisible('.read')), 'A: chapter links without the app');
    expect(errors.length === 0, 'A errors ' + errors);
    await context.close();
  }
  // B. A prefilled link opens one calculator with those numbers.
  {
    const { page, errors, context } = await open(browser, { query: '?calc=growth&amount=500&rate=5&years=15' });
    expect(/\$500 grows to \$1,039\.46 after 15 years/.test(await text(page, 'g-out')), 'B prefill');
    expect(errors.length === 0, 'B errors ' + errors);
    await context.close();
  }
  // C. In the app, for an account with the book: "Read chapter N" opens that chapter over the page.
  {
    const { page, errors, context } = await open(browser, { bridge: { features: ['library', 'libraryChapter'], library: ['money-plainly-handbook-en'] } });
    await page.waitForSelector('#growth .read:not([hidden])', { timeout: 5000 });
    await page.click('#growth .read');
    await page.click('#t-card');
    await page.click('#card .read');
    const calls = await page.evaluate(() => window.__calls);
    expect(JSON.stringify(calls) === JSON.stringify([{ item: 'money-plainly-handbook-en', chapter: 5 }, { item: 'money-plainly-handbook-en', chapter: 4 }]),
      'C calls ' + JSON.stringify(calls));
    expect(errors.length === 0, 'C errors ' + errors);
    await context.close();
  }
  // D. An older app (no libraryChapter) or an account without the book: no chapter link, nothing named.
  for (const bridge of [{ features: ['library'], library: ['money-plainly-handbook-en'] }, { features: ['library', 'libraryChapter'], library: [] }]) {
    const { page, context } = await open(browser, { bridge });
    await page.waitForTimeout(300);
    expect(!(await page.isVisible('.read')), 'D link shown for ' + JSON.stringify(bridge));
    await context.close();
  }
  // E. No sideways scroll on a small phone, with large text.
  {
    const { page, context } = await open(browser, { width: 320 });
    await page.addStyleTag({ content: 'html { font-size: 150%; }' });
    for (const tab of ['growth', 'monthly', 'card', 'fee']) {
      await page.click('#t-' + tab);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(wide <= 320, 'E ' + tab + ' scrolls sideways: ' + wide);
    }
    await context.close();
  }
  await browser.close();
  console.log(failures.length ? 'FAIL\n' + failures.join('\n') : 'money calculators: PASS (handbook figures, prefill, chapter links, phone width)');
  process.exit(failures.length ? 1 : 0);
})();
