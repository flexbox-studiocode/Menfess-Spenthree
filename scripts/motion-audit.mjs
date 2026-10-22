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
const backendLoaded = page => page.evaluate(() => performance.getEntriesByType('resource').some(resource => /\/supabase(?:-[^/]+)?\.js$/.test(new URL(resource.name).pathname)));

try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ reducedMotion, viewport: { width: 412, height: 929 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await context.addInitScript(() => {
      window.motionAudit = { transitions: [], reveals: [] };
      if (document.startViewTransition) {
        const start = document.startViewTransition.bind(document);
        document.startViewTransition = update => {
          const record = { direction: document.documentElement.dataset.messageDirection };
          window.motionAudit.transitions.push(record);
          const transition = start(update);
          transition.ready.then(() => {
            record.enter = getComputedStyle(document.documentElement, '::view-transition-new(sagara-page)').animationName;
            record.shared = getComputedStyle(document.documentElement, '::view-transition-group(sagara-message)').animationName;
            record.ready = true;
          }, error => { record.error = error.message; record.ready = true; });
          return transition;
        };
      }
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = animate.apply(this, args);
        if (location.pathname === '/guide' && this.matches('ol > li')) {
          window.motionAudit.reveals.push({ index: [...this.parentElement.children].indexOf(this), animation });
          if (window.pauseReveal) animation.pause();
        }
        return animation;
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    let failSubmit = true;
    let submitGate = Promise.resolve();
    let trackGate = Promise.resolve();
    const code = 'SPT-0123456789ABCDEF0123456789ABCDEF';
    await context.route('**/src/lib/supabaseConfig.js*', async route => {
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
      const endpoint = new URL(request.url()).pathname.split('/').pop();
      if (endpoint === 'public-feed' && request.method() === 'GET') return route.fulfill({ status: 200, headers, body: JSON.stringify({ data: [], next_cursor: null }) });
      if (endpoint === 'public-menfess' && request.method() === 'GET') return route.fulfill({ status: 404, headers, body: JSON.stringify({ error: { code: 'NOT_FOUND' } }) });
      assert.equal(request.method(), 'POST');
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
    check(!await backendLoaded(page), reducedMotion + ': home does not download the backend SDK');
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    await nav.getByRole('link', { name: 'Tulis', exact: true }).click();
    const enters = await page.evaluate(() => document.getAnimations().map(animation => animation.animationName));
    check(reducedMotion === 'reduce' ? enters.length === 0 : enters.includes('sagara-enter'), reducedMotion + ': route entry respects motion preference');
    await finishMotion(page);
    check(await page.evaluate(() => document.activeElement.id === 'main'), reducedMotion + ': route focus is preserved');
    await page.setViewportSize({ width: 412, height: 600 });
    await page.getByLabel('Untuk (opsional)').fill('a'.repeat(81));
    await page.getByRole('button', { name: 'Periksa pesan' }).click();
    await page.waitForFunction(() => {
      const field = document.querySelector('#recipient');
      const rect = field.getBoundingClientRect();
      return document.activeElement === field && rect.top >= 64 && rect.bottom < innerHeight - 67;
    });
    check(await page.getByLabel('Untuk (opsional)').getAttribute('aria-invalid') === 'true', reducedMotion + ': invalid recipient is focused, highlighted and scrolled above navigation');
    await page.getByLabel('Untuk (opsional)').fill('');
    await page.getByRole('button', { name: 'Periksa pesan' }).click();
    check(await page.evaluate(() => document.activeElement.id === 'content'), reducedMotion + ': invalid content receives focus');
    await page.getByLabel('Isi pesan', { exact: true }).fill('Pesan pengujian animasi tanpa publikasi produksi.');
    await page.getByRole('button', { name: 'Periksa pesan' }).click();
    check(await page.evaluate(() => document.activeElement.id === 'rules'), reducedMotion + ': missing consent receives focus');
    await page.getByRole('checkbox').check();
    await page.setViewportSize({ width: 412, height: 929 });
    await page.getByRole('button', { name: 'Periksa pesan' }).click();
    await page.waitForURL('**/review');
    if (reducedMotion === 'no-preference') {
      await page.waitForFunction(() => window.motionAudit.transitions[0]?.ready);
      const transition = await page.evaluate(() => window.motionAudit.transitions[0]);
      check(!transition.error && transition.enter === 'sagara-forward' && transition.shared.includes('sagara-message'), 'Native forward transition snapshots both message and page');
      await page.evaluate(() => document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 120; }));
      await page.screenshot({ path: path.join(output, 'message-transition.png') });
    } else {
      check(await page.evaluate(() => window.motionAudit.transitions.length) === 0, 'Reduced motion skips native snapshots entirely');
    }
    const progress = await page.locator('[data-step="review"]').evaluate(element => getComputedStyle(element.children[2], '::after').animationName);
    check(reducedMotion === 'reduce' ? progress === 'none' : progress === 'sagara-progress', reducedMotion + ': review progress uses shared motion');
    await finishMotion(page);
    await page.waitForFunction(() => !document.documentElement.dataset.messageDirection);
    check(await page.evaluate(() => document.activeElement.id === 'main'), reducedMotion + ': message transition preserves route focus');
    if (reducedMotion === 'no-preference') {
      check(await page.locator('section[data-message-transition]').evaluate(element => getComputedStyle(element).animationName) === 'none', 'Native transition does not replay a second page entry after completion');
    }
    await page.getByRole('button', { name: 'Ubah Pesan' }).click();
    await page.waitForURL('**/write');
    if (reducedMotion === 'no-preference') {
      await page.waitForFunction(() => window.motionAudit.transitions[1]?.ready);
      check(await page.evaluate(() => window.motionAudit.transitions[1].enter) === 'sagara-backward', 'Edit reverses the native page direction');
    }
    check(await page.getByLabel('Isi pesan', { exact: true }).inputValue() === 'Pesan pengujian animasi tanpa publikasi produksi.', reducedMotion + ': editing retains the original message');
    await finishMotion(page);
    await page.evaluate(() => { window.savedTransition = document.startViewTransition; document.startViewTransition = undefined; });
    await page.getByRole('button', { name: 'Periksa pesan' }).click();
    await page.waitForURL('**/review');
    check(await page.locator('[data-message-direction="forward"]').evaluate(element => getComputedStyle(element).animationName) === (reducedMotion === 'reduce' ? 'none' : 'sagara-forward'), reducedMotion + ': unsupported browsers retain directional fallback and draft flow');
    await finishMotion(page);
    await page.getByRole('link', { name: 'Ubah pesan', exact: true }).click();
    await page.waitForURL('**/write');
    check(await page.getByRole('checkbox').isChecked(), reducedMotion + ': back link preserves agreement');
    await page.evaluate(() => { document.startViewTransition = window.savedTransition; });
    await page.getByRole('button', { name: 'Periksa pesan' }).click();
    await page.waitForURL('**/review');
    await finishMotion(page);

    const send = page.getByRole('button', { name: 'Kirim Menfess' });
    const idleWidth = (await send.boundingBox()).width;
    let releaseSubmit;
    submitGate = new Promise(resolve => { releaseSubmit = resolve; });
    await send.click();
    await page.locator('.motion-spinner').waitFor();
    const sending = page.getByRole('button', { name: 'Mengirim pesan...' });
    check(await sending.isDisabled() && await sending.getAttribute('aria-busy') === 'true', reducedMotion + ': pending submit is disabled and busy');
    check((await sending.boundingBox()).width === idleWidth, reducedMotion + ': loading keeps button width');
    const spinner = await page.locator('.motion-spinner').evaluate(element => getComputedStyle(element).animationName);
    check(reducedMotion === 'reduce' ? spinner === 'none' : spinner === 'sagara-spin', reducedMotion + ': loading motion respects preference');
    check(await page.getByText('Menfess berhasil dikirim').count() === 0, reducedMotion + ': no premature success');
    releaseSubmit();
    await page.getByRole('alert').waitFor();
    check(await backendLoaded(page), reducedMotion + ': submit loads the backend SDK on demand');
    const retained = await page.evaluate(() => JSON.parse(sessionStorage.getItem('menfess-spenthree-draft')));
    check(Boolean(retained.request_id), reducedMotion + ': failed submit retains draft and request ID');
    failSubmit = false;
    await page.getByRole('button', { name: 'Kirim Menfess' }).click();
    await page.waitForURL('**/status');
    await page.getByText('Menfess berhasil dikirim').waitFor();
    const receiptMotion = await page.locator('.motion-receipt').evaluate(element => ({
      envelope: getComputedStyle(element.querySelector('.motion-envelope')).display,
      flap: getComputedStyle(element.querySelector('.motion-envelope-flap')).animationName,
      check: getComputedStyle(element.querySelector('.motion-receipt-check')).animationName,
      ring: getComputedStyle(element.parentElement.querySelector('li'), '::after').animationName,
    }));
    check(reducedMotion === 'reduce' ? receiptMotion.envelope === 'none' && receiptMotion.check === 'none' && receiptMotion.ring === 'none' : receiptMotion.flap === 'sagara-envelope-close' && receiptMotion.check === 'sagara-receipt-check' && receiptMotion.ring === 'sagara-status-ring', reducedMotion + ': envelope/check and one-shot status ring follow actual success');
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
    const help = page.getByRole('link', { name: 'Lihat panduan menfess dan kode pelacakan' });
    await page.getByRole('button', { name: 'Periksa status' }).focus();
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => getComputedStyle(document.activeElement).backgroundSize === '100% 1px');
    check(await help.evaluate(element => element.matches(':focus-visible')), reducedMotion + ': underline also responds to keyboard focus');

    await page.setViewportSize({ width: 412, height: 600 });
    await nav.getByRole('link', { name: 'Panduan', exact: true }).click();
    await page.waitForURL('**/guide');
    if (reducedMotion === 'no-preference') {
      for (let index = 0; index < 4; index++) {
        await page.locator('main ol > li').nth(index).evaluate(element => element.scrollIntoView({ block: 'center' }));
        await page.waitForFunction(index => window.motionAudit.reveals.some(record => record.index === index), index);
      }
      await finishMotion(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('heading', { name: /Boleh cerita, tapi jaga perasaan/ }).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(120);
      check(await page.evaluate(() => window.motionAudit.reveals.length) === 4, 'Guide reveals each rule once when scrolled into view');
      await nav.getByRole('link', { name: 'Status', exact: true }).click();
      await page.evaluate(() => { window.pauseReveal = true; });
      await nav.getByRole('link', { name: 'Panduan', exact: true }).click();
      await page.waitForFunction(() => window.motionAudit.reveals.length > 4);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.getAnimations().length === 0);
      check(await page.evaluate(() => window.motionAudit.reveals.slice(4).every(({ animation }) => animation.playState === 'idle')), 'Changing preference to reduce cancels active guide reveals');
      await page.emulateMedia({ reducedMotion });
    } else {
      check(await page.evaluate(() => window.motionAudit.reveals.length) === 0, 'Reduced motion leaves guide content visible without reveal animations');
    }
    await page.setViewportSize({ width: 412, height: 929 });

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
