import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(process.env.TEMP, 'menfess-browser-audit/node_modules/playwright/index.mjs')).href);
const baseURL = process.env.AUDIT_URL || 'http://127.0.0.1:5173';
const outputDir = path.resolve('artifacts/visual-audit/flows');
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
const requests = [];
const context = await browser.newContext({ viewport: { width: 412, height: 929 }, permissions: ['clipboard-read', 'clipboard-write'] });
// Browser-only configuration fixture. Neither disk source nor environment files are modified.
await context.route('**/src/lib/supabase.js*', async route => {
  const response = await route.fetch();
  let body = await response.text();
  body = body.replace('const url = env.VITE_SUPABASE_URL?.trim();', 'const url = "https://audit.invalid";')
    .replace('const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();', 'const publishable = "sb_publishable_browser_audit_fixture";')
    .replace('const legacy = env.VITE_SUPABASE_ANON_KEY?.trim();', 'const legacy = undefined;');
  await route.fulfill({ response, body });
});
let mode = 'success';
await context.route('https://audit.invalid/functions/v1/**', async route => {
  const endpoint = new URL(route.request().url()).pathname.split('/').pop();
  const payload = route.request().postDataJSON();
  requests.push({ endpoint, payload });
  const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (mode === 'error') return route.fulfill({ status: 404, headers, body: JSON.stringify({ error: { code: 'NOT_FOUND' } }) });
  const result = endpoint === 'submit-menfess'
    ? { status: 'queued', tracking_code: 'SPT-AUDIT-1234', message: 'Pesan audit diterima untuk antrean publikasi.' }
    : { status: 'published', tracking_code: 'SPT-AUDIT-1234', message: 'Pesan audit telah diterbitkan.', published_at: '2026-10-21T12:00:00Z', ig_permalink: 'https://www.instagram.com/p/audit-fixture/' };
  await route.fulfill({ status: 200, headers, body: JSON.stringify(result) });
});
const page = await context.newPage();
const assert = (condition, name) => { if (!condition) throw new Error(name); checks.push({ name, passed: true }); };
const captureState = async name => { for (const width of [320, 375, 412, 768, 1440]) { await page.setViewportSize({ width, height: 929 }); await page.screenshot({ path: path.join(outputDir, `${width}-${name}.png`), fullPage: true }); await page.screenshot({ path: path.join(outputDir, `${width}-${name}-viewport.png`), fullPage: false }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} has no overflow at ${width}`); } await page.setViewportSize({ width: 412, height: 929 }); };
try {
  await page.goto(`${baseURL}/review`);
  assert(await page.getByRole('link', { name: /Tulis pesan/i }).count() > 0, 'Empty review links to writing');
  await page.goto(`${baseURL}/write`);
  await page.getByRole('button', { name: /Periksa pesan/i }).click();
  assert(await page.getByRole('alert').count() > 0, 'Empty message rejected');
  await page.getByLabel('Isi pesan', { exact: true }).fill('Ini pesan audit browser untuk komunitas Spenthree.');
  await page.getByRole('button', { name: /Periksa pesan/i }).click();
  assert((await page.getByRole('alert').textContent()).includes('Setujui'), 'Rules agreement required');
  await page.getByRole('checkbox').check();
  await page.locator('#recipient').fill('Warga Spenthree');
  await page.getByRole('button', { name: /Periksa pesan/i }).click();
  await page.waitForURL('**/review');
  assert((await page.locator('body').textContent()).includes('Ini pesan audit browser'), 'Draft survives preview navigation');
  const iconDiagnostics = await page.locator('button img').evaluateAll(images => images.map(img => ({ src: img.getAttribute('src'), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, display: getComputedStyle(img).display, opacity: getComputedStyle(img).opacity, rect: (() => { const r = img.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() })));
  await writeFile(path.join(outputDir, 'review-icons.json'), JSON.stringify(iconDiagnostics, null, 2));
  await captureState('review-with-draft');
  await page.getByRole('button', { name: /Ubah pesan/i }).click();
  await page.waitForURL('**/write');
  assert((await page.getByLabel('Isi pesan', { exact: true }).inputValue()).includes('Ini pesan audit browser'), 'Edit returns preserved draft');
  await page.getByRole('button', { name: /Periksa pesan/i }).click();
  await page.getByRole('button', { name: /Kirim/i }).click();
  await page.waitForURL('**/status');
  await page.getByText('SPT-AUDIT-1234', { exact: true }).waitFor();
  assert(await page.evaluate(() => sessionStorage.getItem('menfess-spenthree-draft')) === null, 'Successful mocked submission clears draft');
  assert(requests[0]?.payload.request_id?.length > 0, 'Submission includes request_id');
  await page.getByRole('button', { name: 'Salin kode', exact: true }).click();
  assert(await page.getByRole('button', { name: 'Tersalin', exact: true }).count() > 0, 'Tracking code clipboard interaction');
  await page.screenshot({ path: path.join(outputDir, 'submitted-status.png'), fullPage: true });
  await page.locator('#tracking').fill(' SPT-AUDIT-1234 ');
  await page.getByRole('button', { name: 'Periksa status', exact: true }).click();
  await page.getByRole('link', { name: 'Buka Instagram' }).waitFor();
  assert(requests.at(-1).payload.tracking_code === 'SPT-AUDIT-1234', 'Tracking code trimmed before API request');
  assert(!page.url().includes('SPT-'), 'Tracking code absent from URL');
  await page.getByRole('button', { name: 'Periksa status', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('form button')?.disabled);
  await captureState('published-status');
  mode = 'error';
  await page.getByRole('button', { name: 'Periksa status', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert((await page.getByRole('alert').textContent()).includes('tidak ditemukan'), 'Mocked NOT_FOUND displays friendly error');
  await page.screenshot({ path: path.join(outputDir, 'not-found-status.png'), fullPage: true });
} catch (error) {
  checks.push({ name: error.message, passed: false });
  await page.screenshot({ path: path.join(outputDir, 'failure.png'), fullPage: true });
  process.exitCode = 1;
} finally {
  await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ baseURL, mocking: 'Browser-only API mocks for submit-menfess and track-menfess. Browser-only public config fixture https://audit.invalid and fake publishable key injected into served module response; no source or environment edits. No live backend validation.', checks, requests }, null, 2));
  await browser.close();
}
console.log(JSON.stringify(checks, null, 2));
