import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(process.env.TEMP, 'menfess-browser-audit/node_modules/playwright/index.mjs')).href);
const baseURL = process.env.AUDIT_URL || 'http://127.0.0.1:5173';
const output = path.resolve('artifacts/motion-audit');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-lcd-text'] });
const checks = [];
const errors = [];
const check = (condition, message) => { assert(condition, message); checks.push(message); };
const finishMotion = page => page.evaluate(() => document.getAnimations().forEach(animation => { if (animation.effect.getTiming().iterations !== Infinity) animation.finish(); }));

try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ reducedMotion, viewport: { width: 412, height: 929 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    let failSubmit = true;
    let submitGate = Promise.resolve();
    let trackGate = Promise.resolve();
    const code = 'SPT-0123456789ABCDEF0123456789ABCDEF';
    await context.route('**/src/lib/supabase.js*', async route => {
      const response = await route.fetch();
      const original = await response.text();
      const body = original.replace('const url = env.VITE_SUPABASE_URL?.trim();', 'const url = "https://motion-audit.invalid";')
        .replace('const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();', 'const publishable = "sb_publishable_motion_fixture";')
        .replace('const legacy = env.VITE_SUPABASE_ANON_KEY?.trim();', 'const legacy = undefined;');
      assert(body.includes('https://motion-audit.invalid'), 'Public config fixture applied');
      await route.fulfill({ response, body });
    });
    await context.route('https://motion-audit.invalid/**', async route => {
      const request = route.request();
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers });
      assert.equal(request.method(), 'POST');
      const endpoint = request.url().split('/').pop();
      requests.push({ endpoint, payload: request.postDataJSON() });
      if (endpoint === 'submit-menfess') {
        await submitGate;
        return route.fulfill({ status: failSubmit ? 503 : 202, headers, body: JSON.stringify(failSubmit ? { error: { code: 'SERVICE_UNAVAILABLE' } } : { accepted: true, status: 'queued', tracking_code: code, message: 'Menfess diterima.' }) });
      }
      assert.equal(endpoint, 'track-menfess');
      assert.deepEqual(request.postDataJSON(), { tracking_code: code });
      await trackGate;
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ status: 'published', message: 'Pesan berhasil dipublikasikan.', published_at: '2026-10-22T00:00:00Z', ig_permalink: 'https://www.instagram.com/p/motion-fixture/' }) });
    });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    await nav.getByRole('link', { name: 'Tulis', exact: true }).click();
    const enters = await page.evaluate(() => document.getAnimations().map(animation => animation.animationName));
    check(reducedMotion === 'reduce' ? enters.length === 0 : enters.includes('sagara-enter'), reducedMotion + ': route entry respects motion preference');
    await finishMotion(page);
    check(await page.evaluate(() => document.activeElement.id === 'main'), reducedMotion + ': route focus is preserved');
    await page.getByLabel('Isi pesan', { exact: true }).fill('Pesan pengujian animasi tanpa publikasi produksi.');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Periksa pesan' }).click();
    await page.waitForURL('**/review');
    const progress = await page.locator('[data-step="review"]').evaluate(element => getComputedStyle(element.children[2], '::after').animationName);
    check(reducedMotion === 'reduce' ? progress === 'none' : progress === 'sagara-progress', reducedMotion + ': review progress uses shared motion');
    await finishMotion(page);

    const send = page.getByRole('button', { name: 'Kirim Menfess' });
    const idleWidth = (await send.boundingBox()).width;
    let releaseSubmit;
    submitGate = new Promise(resolve => { releaseSubmit = resolve; });
    await send.click();
    await page.locator('.motion-spinner').waitFor();
    const sending = page.getByRole('button', { name: 'Mengirim...' });
    check(await sending.isDisabled() && await sending.getAttribute('aria-busy') === 'true', reducedMotion + ': pending submit is disabled and busy');
    check((await sending.boundingBox()).width === idleWidth, reducedMotion + ': loading keeps button width');
    const spinner = await page.locator('.motion-spinner').evaluate(element => getComputedStyle(element).animationName);
    check(reducedMotion === 'reduce' ? spinner === 'none' : spinner === 'sagara-spin', reducedMotion + ': loading motion respects preference');
    check(await page.getByText('Menfess berhasil dikirim').count() === 0, reducedMotion + ': no premature success');
    releaseSubmit();
    await page.getByRole('alert').waitFor();
    const retained = await page.evaluate(() => JSON.parse(sessionStorage.getItem('menfess-spenthree-draft')));
    check(Boolean(retained.request_id), reducedMotion + ': failed submit retains draft and request ID');
    failSubmit = false;
    await page.getByRole('button', { name: 'Kirim Menfess' }).click();
    await page.waitForURL('**/status');
    await page.getByText('Menfess berhasil dikirim').waitFor();
    assert.deepEqual(requests[0].payload, requests[1].payload);
    check(await page.evaluate(() => sessionStorage.getItem('menfess-spenthree-draft')) === null, reducedMotion + ': identical retry succeeds and clears draft');
    await page.getByRole('button', { name: 'Salin kode' }).click();
    await page.getByRole('button', { name: 'Tersalin', exact: true }).waitFor();
    check(await page.evaluate(() => navigator.clipboard.readText()) === code, reducedMotion + ': clipboard feedback follows successful copy');
    await finishMotion(page);
    await page.screenshot({ path: path.join(output, reducedMotion + '-receipt.png'), fullPage: true });
    let releaseTrack;
    trackGate = new Promise(resolve => { releaseTrack = resolve; });
    await page.getByLabel('Kode pelacakan').fill(code);
    await page.getByRole('button', { name: 'Periksa status' }).click();
    await page.locator('.motion-spinner').waitFor();
    check(await page.getByRole('button', { name: 'Memeriksa...' }).isDisabled(), reducedMotion + ': tracking shows pending state');
    releaseTrack();
    await page.getByRole('link', { name: 'Buka Instagram' }).waitFor();
    check(await page.getByText('Menfess berhasil dikirim').count() === 0, reducedMotion + ': tracking does not replay submission receipt');
    check(!page.url().includes(code), reducedMotion + ': tracking code remains absent from URL');

    await nav.getByRole('link', { name: 'Beranda', exact: true }).click();
    await finishMotion(page);
    await page.getByRole('button', { name: 'Apresiasi', exact: true }).click();
    await finishMotion(page);
    const categoryGeometry = await page.getByRole('group', { name: 'Kategori linimasa' }).evaluate(element => {
      const style = getComputedStyle(element, '::before');
      return { shift: new DOMMatrixReadOnly(style.transform).m41, width: parseFloat(style.width), container: element.clientWidth };
    });
    check(categoryGeometry.shift > 0 && categoryGeometry.shift + categoryGeometry.width + 5 <= categoryGeometry.container, reducedMotion + ': category indicator reaches selected tab without overflow');
    check(await page.getByRole('button', { name: 'Apresiasi', exact: true }).getAttribute('aria-pressed') === 'true', reducedMotion + ': category remains accessible');
    await page.screenshot({ path: path.join(output, reducedMotion + '-home.png') });
    if (reducedMotion === 'reduce') {
      check(await page.evaluate(() => document.getAnimations().length) === 0, 'Reduced motion disables all page, pseudo-element and transition animations');
    } else {
      const cta = page.getByRole('link', { name: 'Tulis menfess', exact: true }).first();
      await cta.hover();
      await page.mouse.down();
      await page.waitForTimeout(180);
      const pressedScale = await cta.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m11);
      await page.mouse.move(5, 5);
      await page.mouse.up();
      check(Math.abs(pressedScale - .98) < .002, 'Hero entrance does not override button press feedback');
    }
    if (reducedMotion === 'no-preference') {
      for (const width of [320, 375, 412, 768, 1440]) {
        await page.setViewportSize({ width, height: 929 });
        for (const route of ['/', '/write', '/review', '/status', '/guide', '/menfess/example', '/missing']) {
          await page.goto(baseURL + route, { waitUntil: 'networkidle' });
          const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, broken: [...document.images].some(image => !image.complete || !image.naturalWidth) }));
          check(!layout.overflow && !layout.broken, width + route + ': no overflow or broken images');
        }
      }
    }
    await context.close();
  }
  check(errors.length === 0, 'No browser runtime errors');
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ baseURL, mode: 'Browser-only Supabase fixtures; no live backend writes.', checks, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ checks: checks.length, errors, output }, null, 2));
