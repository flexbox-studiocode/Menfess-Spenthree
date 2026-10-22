import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(process.env.TEMP, 'menfess-browser-audit/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ headless: true });
const checks = [];
await mkdir('artifacts/moderation-browser', { recursive: true });
try {
  for (const width of [360, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 360 ? 'reduce' : 'no-preference' });
    const requests = [], errors = [];
    let mode = 'unsafe';
    await context.route('**/src/lib/supabaseConfig.js*', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace('const url = env.VITE_SUPABASE_URL?.trim();', 'const url = "https://moderation-audit.invalid";').replace('const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();', 'const publishable = "sb_publishable_test";').replace('const legacy = env.VITE_SUPABASE_ANON_KEY?.trim();', 'const legacy = undefined;');
      await route.fulfill({ response, body });
    });
    await context.route('https://moderation-audit.invalid/**', async route => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers });
      if (!route.request().url().includes('submit-menfess')) return route.fulfill({ status: 200, headers, body: '{"data":[],"next_cursor":null}' });
      requests.push(route.request().postDataJSON());
      await new Promise(resolve => setTimeout(resolve, 300));
      const status = mode === 'allow' ? 202 : mode === 'unsafe' ? 422 : 503;
      const body = status === 202 ? { accepted: true, status: 'queued', tracking_code: 'SPT-0123456789ABCDEF0123456789ABCDEF', message: 'Diterima dalam antrean.' } : { error: { code: status === 422 ? 'CONTENT_UNSAFE' : 'MODERATION_UNAVAILABLE' } };
      await route.fulfill({ status, headers, body: JSON.stringify(body) });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5173/write', { waitUntil: 'networkidle' });
    await page.getByLabel('Isi pesan').fill('Tolong tambah tempat sampah di taman sekolah.');
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Periksa pesan', exact: true }).click();
    await page.getByRole('button', { name: 'Kirim Menfess' }).click();
    await page.getByRole('button', { name: 'Memeriksa pesan...' }).waitFor();
    assert(await page.getByRole('button', { name: 'Memeriksa pesan...' }).isDisabled());
    await page.getByRole('alert').filter({ hasText: 'Pesan belum dapat dikirim' }).waitFor();
    const first = requests.at(-1).request_id;
    assert(await page.evaluate(() => !!sessionStorage.getItem('menfess-spenthree-draft')));
    await page.screenshot({ path: 'artifacts/moderation-browser/rejected-' + width + '.png', fullPage: true });
    mode = 'down'; await page.getByRole('button', { name: 'Kirim Menfess' }).click();
    await page.getByRole('alert').filter({ hasText: 'Pesan belum dikirim' }).waitFor();
    assert.equal(requests.at(-1).request_id, first);
    await page.getByRole('button', { name: 'Ubah Pesan' }).click();
    await page.getByLabel('Isi pesan').fill('Terima kasih sudah membantu kerja kelompok hari ini.');
    await page.getByRole('button', { name: 'Periksa pesan', exact: true }).click();
    mode = 'allow'; await page.getByRole('button', { name: 'Kirim Menfess' }).click();
    await page.getByRole('heading', { name: 'Status pesan', exact: true }).waitFor();
    assert.notEqual(requests.at(-1).request_id, first);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('menfess-spenthree-draft')), null);
    assert.equal(await page.getByRole('link', { name: 'Buka Instagram' }).count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    checks.push({ width, busyDisabled: true, rejection: true, providerFailure: true, draftPreserved: true, retrySameId: true, editNewId: true, queuedHonest: true, noOverflow: true, noRuntimeErrors: true });
    await context.close();
  }
  await writeFile('artifacts/moderation-browser/report.json', JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks));
} finally { await browser.close(); }
