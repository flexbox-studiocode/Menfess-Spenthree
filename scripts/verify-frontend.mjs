import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const { chromium } = await import(pathToFileURL(path.join(process.env.TEMP, 'menfess-browser-audit/node_modules/playwright/index.mjs')).href);
const baseURL = process.env.AUDIT_URL || 'http://127.0.0.1:5174';
const output = path.resolve('artifacts/visual-audit/verified');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-lcd-text'] });
const draft = { category: 'menfess', recipient: '', content: 'Hai ganteng kenalin aku Rainer salam kenal yah', rules_accepted: true };
const tracking = 'SPT-0123456789ABCDEF0123456789ABCDEF';
const reports = { mode: 'Isolated browser fixtures; Supabase network is intercepted, no live backend writes.', responsive: [], reference: [], flows: [] };
const failures = [];
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.on('pageerror', error => failures.push(error.message));
page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === baseURL) failures.push(response.status() + ' ' + response.url()); });
let submitCalls = [];
let failSubmission = true;
let trackMode = 'published';
await context.route('https://sagara-ui-test.supabase.co/**', async route => {
  const request = route.request();
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (request.url().endsWith('/submit-menfess')) {
    assert.equal(request.method(), 'POST');
    submitCalls.push(request.postDataJSON());
    if (failSubmission) return route.fulfill({ status: 503, headers, body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }) });
    return route.fulfill({ status: 202, headers, body: JSON.stringify({ accepted: true, status: 'queued', tracking_code: tracking, message: 'Menfess diterima dan sedang diproses.' }) });
  }
  assert(request.url().endsWith('/track-menfess'), 'Unexpected backend call');
  assert.equal(request.method(), 'POST');
  assert.deepEqual(request.postDataJSON(), { tracking_code: tracking });
  if (trackMode === 'error') return route.fulfill({ status: 404, headers, body: JSON.stringify({ error: { code: 'NOT_FOUND' } }) });
  if (trackMode === 'slow') await new Promise(resolve => setTimeout(resolve, 250));
  return route.fulfill({ status: 200, headers, body: JSON.stringify({ status: 'published', message: 'Pesan berhasil dipublikasikan.', published_at: '2026-10-21T10:00:00Z', ig_permalink: 'https://www.instagram.com/p/example/' }) });
});

async function inspect() {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    brokenImages: [...document.images].filter(img => !img.complete || !img.naturalWidth).map(img => img.src),
    images: [...document.images].map(img => { const rect = img.getBoundingClientRect(); return { src: new URL(img.src).pathname, width: rect.width, height: rect.height, naturalWidth: img.naturalWidth }; }),
    font: getComputedStyle(document.querySelector('h1')).fontFamily,
    heading: document.querySelector('h1').textContent,
    geometry: [...document.querySelectorAll('h1, input:not([type="checkbox"]), select, textarea, [class*="hero_"], [class*="privacy_"], [class*="about_"], [class*="support_"], [class*="categories_"], [class*="steps_"]')].map(element => { const r = element.getBoundingClientRect(); return { element: element.id || element.tagName + '.' + element.className, x: r.x, y: r.y, width: r.width, height: r.height, weight: getComputedStyle(element).fontWeight }; }),
  }));
}
try {
  for (const width of [320, 375, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 929 });
    for (const route of ['/', '/write', '/review', '/status', '/guide', '/menfess/example', '/missing']) {
      await page.goto(baseURL + route, { waitUntil: 'networkidle' });
      const result = await inspect();
      assert.equal(result.overflow, false, width + route + ' overflow');
      assert.deepEqual(result.brokenImages, [], width + route + ' broken image');
      assert.equal(await page.getByRole('navigation', { name: 'Navigasi utama' }).locator('a').count(), 4);
      assert.match(result.font, /Inter/);
      reports.responsive.push({ width, route, ...result });
    }
  }
  reports.flows.push('35 route/viewport combinations: no overflow, broken images, or runtime errors.');

  await page.setViewportSize({ width: 412, height: 929 });
  await page.goto(baseURL + '/write');
  await page.getByRole('button', { name: 'Periksa pesan' }).click();
  assert.match(await page.getByRole('alert').textContent(), /10–500/);
  await page.getByLabel('Isi pesan', { exact: true }).fill(draft.content);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Periksa pesan' }).click();
  await page.waitForURL('**/review');
  await page.getByRole('button', { name: 'Kirim Menfess' }).click();
  await page.getByRole('alert').waitFor();
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('menfess-spenthree-draft')));
  assert(saved.request_id);
  failSubmission = false;
  await page.getByRole('button', { name: 'Kirim Menfess' }).click();
  await page.waitForURL('**/status');
  assert.deepEqual(submitCalls[0], submitCalls[1]);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('menfess-spenthree-draft')), null);
  assert(!page.url().includes(tracking));
  await page.getByRole('button', { name: 'Salin kode' }).click();
  await page.getByRole('button', { name: 'Tersalin' }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), tracking);
  reports.flows.push('Write validation, draft, review, failed submit, retry with identical request_id/payload, receipt, draft clear, clipboard success.');

  await page.getByLabel('Kode pelacakan').fill(tracking);
  trackMode = 'slow';
  await page.getByRole('button', { name: 'Periksa status' }).click();
  assert.equal(await page.getByRole('button', { name: 'Memeriksa...' }).isDisabled(), true);
  await page.getByRole('link', { name: 'Buka Instagram' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Buka Instagram' }).getAttribute('href'), 'https://www.instagram.com/p/example/');
  trackMode = 'error';
  await page.getByRole('button', { name: 'Periksa status' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Buka Instagram' }).count(), 0);
  reports.flows.push('POST tracking, loading/disabled, published timestamp/permalink, not-found error, stale result cleared, tracking absent from URL.');

  await page.goto(baseURL + '/');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Lewati ke konten');
  await page.getByRole('link', { name: 'Tulis', exact: true }).click();
  await page.waitForURL('**/write');
  await page.waitForFunction(() => document.activeElement.id === 'main');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  await page.getByRole('link', { name: 'Panduan', exact: true }).click();
  assert.equal(await page.getByRole('link', { name: 'Panduan', exact: true }).getAttribute('aria-current'), 'page');
  await page.getByRole('link', { name: 'Beranda', exact: true }).last().click();
  await page.getByRole('button', { name: 'Aspirasi', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Aspirasi', exact: true }).getAttribute('aria-pressed'), 'true');
  reports.flows.push('Keyboard skip link, route focus, active navigation, category selection.');

  for (const [name, route, height, populated] of [['home', '/', 1620, false], ['write', '/write', 929, true], ['review', '/review', 862, true], ['status', '/status', 789, false], ['guide', '/guide', 932, false], ['detail', '/menfess/example', 568, false]]) {
    await page.setViewportSize({ width: 412, height });
    await page.evaluate(value => { if (value) sessionStorage.setItem('menfess-spenthree-draft', JSON.stringify(value)); else sessionStorage.removeItem('menfess-spenthree-draft'); }, populated ? draft : null);
    await page.goto(baseURL + route, { waitUntil: 'networkidle' });
    const info = await inspect();
    await page.screenshot({ path: path.join(output, name + '-412.png') });
    reports.reference.push({ name, route, height, ...info });
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page.evaluate(value => sessionStorage.setItem('menfess-spenthree-draft', JSON.stringify(value)), { ...draft, content: 'W'.repeat(500), recipient: 'W'.repeat(80) });
  await page.goto(baseURL + '/review');
  assert.equal((await inspect()).overflow, false);
  await page.getByRole('button', { name: 'Ubah Pesan' }).click();
  assert.equal(await page.getByLabel('Isi pesan', { exact: true }).inputValue(), 'W'.repeat(500));
  reports.flows.push('500-character unbroken content and 80-character recipient: no overflow; editing retains draft.');

  const css = await readFile('src/App.css', 'utf8');
  for (const match of css.matchAll(/url\('([^']+)'\)/g)) assert((await stat('public' + match[1])).size > 0);
  assert.deepEqual(failures, []);
  reports.failures = failures;
  await writeFile(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ responsiveChecks: reports.responsive.length, referenceScreenshots: reports.reference.length, flows: reports.flows, failures }, null, 2));
} finally { await browser.close(); }
