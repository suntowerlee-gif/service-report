// Simulates: engineer already has the app open/installed (old SW controlling the page),
// then we deploy a new version (new service-worker.js with a bumped CACHE_NAME).
// Verifies: the in-app "发现新版本 / New version available" banner appears, and clicking
// "立即更新 Update Now" activates the new SW and reloads the page to the new content —
// WITHOUT the reload firing spuriously on a normal first-ever visit.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SW_PATH = path.join(__dirname, '..', 'service-worker.js');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });

  const originalSw = fs.readFileSync(SW_PATH, 'utf8');

  try {
    // --- Step 1: first-ever visit should NOT show the update banner or reload unexpectedly ---
    await page.goto('http://localhost:8765/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500); // let install/activate/claim settle

    const bannerVisibleFirstVisit = await page.$eval('#updateBanner', (el) => getComputedStyle(el).display !== 'none');
    console.log('Banner visible on first-ever visit (should be false):', bannerVisibleFirstVisit);
    if (bannerVisibleFirstVisit) errors.push('Update banner should not show on a fresh first-ever install');

    // fill a field, to prove no spurious reload happened
    await page.fill('#customer', '更新流程测试客户');
    await page.waitForTimeout(500);
    const valAfterSettle = await page.inputValue('#customer');
    if (valAfterSettle !== '更新流程测试客户') errors.push('Unexpected reload wiped form data on first visit (no real update occurred)');

    // --- Step 2: simulate deploying a new version: bump CACHE_NAME in service-worker.js on disk ---
    const bumped = originalSw.replace(/service-report-cache-v(\d+)/, (m, n) => `service-report-cache-v${parseInt(n, 10) + 1}-test`);
    if (bumped === originalSw) throw new Error('Could not bump CACHE_NAME for test (regex mismatch)');
    fs.writeFileSync(SW_PATH, bumped);

    // ask the existing registration to check for updates (mirrors our visibilitychange/focus handler)
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    });

    // wait for the banner to appear (new SW installed, waiting)
    await page.waitForFunction(() => {
      const el = document.getElementById('updateBanner');
      return el && getComputedStyle(el).display !== 'none';
    }, { timeout: 10000 });
    console.log('Update banner appeared after new version deployed: true');

    // form data should still be intact (banner appearing must not itself reload the page)
    const valBeforeClick = await page.inputValue('#customer');
    console.log('Customer field intact right before clicking Update Now:', valBeforeClick);
    if (valBeforeClick !== '更新流程测试客户') errors.push('Form data lost merely from the update banner appearing (should only reload after user clicks Update Now)');

    // --- Step 3: click "Update Now", expect the page to reload and the new SW to take control ---
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 10000 }),
      page.click('#updateNowBtn')
    ]);
    await page.waitForTimeout(500);

    const activeCacheName = await page.evaluate(async () => {
      const keys = await caches.keys();
      return keys.find((k) => k.includes('-test')) || null;
    });
    console.log('New (bumped/test) cache active after update:', activeCacheName);
    if (!activeCacheName) errors.push('Expected the bumped test cache to be active after clicking Update Now');

    const bannerHiddenAfterUpdate = await page.$eval('#updateBanner', (el) => getComputedStyle(el).display === 'none');
    console.log('Banner hidden after update completes:', bannerHiddenAfterUpdate);
    if (!bannerHiddenAfterUpdate) errors.push('Update banner should be hidden again after the update completes');
  } finally {
    // restore original service-worker.js regardless of test outcome
    fs.writeFileSync(SW_PATH, originalSw);
  }

  await browser.close();

  if (errors.length) {
    console.error('TEST FAILURES:\n' + errors.join('\n'));
    process.exit(1);
  } else {
    console.log('ALL UPDATE-FLOW TESTS PASSED');
  }
})();
