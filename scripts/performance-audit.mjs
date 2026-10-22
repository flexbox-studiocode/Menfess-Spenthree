import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(process.env.TEMP, 'menfess-browser-audit/node_modules/playwright/index.mjs')).href);
const phase = process.argv[2] || 'current';
const baseURL = process.argv[3] || 'http://127.0.0.1:5175';
const targets = process.argv[4] ? [['baseline', baseURL], ['optimized', process.argv[4]]] : [[phase, baseURL]];
const runs = Number(process.env.PERF_RUNS || 3);
assert(Number.isInteger(runs) && runs > 0 && runs <= 5);
const output = path.resolve('artifacts/performance-audit', phase);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const samples = [];
try {
  for (let run = 0; run < runs; run++) {
    for (const device of ['mobile', 'desktop']) {
      for (const [version, url] of targets) {
      const context = await browser.newContext({ viewport: { width: device === 'mobile' ? 412 : 1440, height: 929 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: device === 'mobile' ? 150 : 40, downloadThroughput: (device === 'mobile' ? 1.6 : 10) * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: device === 'mobile' ? 4 : 1 });
      await page.addInitScript(() => {
        window.perfAudit = { lcp: 0, cls: 0, blocking: 0 };
        new PerformanceObserver(list => list.getEntries().forEach(entry => { window.perfAudit.lcp = entry.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver(list => list.getEntries().forEach(entry => { if (!entry.hadRecentInput) window.perfAudit.cls += entry.value; })).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver(list => list.getEntries().forEach(entry => { window.perfAudit.blocking += Math.max(0, entry.duration - 50); })).observe({ type: 'longtask', buffered: true });
      });
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const sample = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource');
        const size = test => resources.filter(test).reduce((sum, resource) => sum + resource.decodedBodySize, 0);
        return { ...window.perfAudit, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime, jsBytes: size(resource => /\.js(?:\?|$)/.test(resource.name)), fontBytes: size(resource => /\.(?:ttf|woff2)(?:\?|$)/.test(resource.name)), totalBytes: size(() => true), fonts: resources.filter(resource => /\.(?:ttf|woff2)(?:\?|$)/.test(resource.name)).map(resource => new URL(resource.name).pathname), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.deepEqual(errors, []);
      assert(!sample.overflow && sample.fcp > 0 && sample.lcp > 0);
      samples.push({ run: run + 1, version, device, ...sample });
      if (run === 0) await page.screenshot({ path: path.join(output, version + '-' + device + '.png'), fullPage: true });
      console.log(JSON.stringify(samples.at(-1)));
      await context.close();
      }
    }
  }
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ targets, conditions: 'Cold cache; mobile 412px/4x CPU/1.6 Mbps/150ms RTT; desktop 1440px/1x CPU/10 Mbps/40ms RTT. Local production build, no live backend writes. Timing is lab data, not physical-device or field INP.', samples }, null, 2));
  await browser.close();
}
