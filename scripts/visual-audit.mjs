import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const playwrightPath = process.env.PLAYWRIGHT_MODULE || path.join(process.env.TEMP, 'menfess-browser-audit/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const phase = process.argv[2] || 'baseline';
const baseURL = process.env.AUDIT_URL || 'http://127.0.0.1:5173';
const widths = ['baseline', 'current'].includes(phase) ? [412] : [320, 375, 412, 768, 1440];
const routes = process.env.AUDIT_ROUTES ? process.env.AUDIT_ROUTES.split(',') : ['/', '/write', '/review', '/status', '/guide', '/menfess/example'];
const outputDir = path.resolve('artifacts/visual-audit', phase);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 929 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const route of routes) {
      const errors = [];
      const onError = error => errors.push(error.message);
      page.on('pageerror', onError);
      await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const screenshotName = `${width}-${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}`;
      await page.screenshot({ path: path.join(outputDir, `${screenshotName}.png`), fullPage: true });
      await page.screenshot({ path: path.join(outputDir, `${screenshotName}-viewport.png`), fullPage: false });
      const layout = await page.evaluate(() => ({ viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth, title: document.title, heading: document.querySelector('h1')?.textContent || null, fontFamily: getComputedStyle(document.body).fontFamily, geometry: Object.fromEntries(['header', 'nav', '#category', '#recipient', '#content'].map(selector => { const node = document.querySelector(selector); if (!node) return [selector, null]; const rect = node.getBoundingClientRect(); return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }]; })) }));
      results.push({ route, width, ...layout, overflow: layout.scrollWidth > width, errors });
      page.off('pageerror', onError);
    }
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ phase, baseURL, mocking: 'No mocks applied. Screenshots capture actual local frontend route state.', results }, null, 2));
console.log(JSON.stringify({ phase, baseURL, outputDir, results }, null, 2));
if (results.some(result => result.overflow || result.errors.length)) process.exitCode = 1;
