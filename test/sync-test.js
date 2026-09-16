const { chromium } = require('playwright');
const mock = require('./mock-worker.js');

const TEST_SYNC_CONFIG_JS = `
const SYNC_CONFIG = {
  endpoint: "http://localhost:8766/",
  appToken: "${mock.APP_TOKEN}"
};
`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', async (d) => { await d.dismiss(); });

  // 用测试配置替换真实的 sync-config.js，指向本地mock服务
  // Serve a test sync-config.js pointing at the local mock server instead of the real (blank) one
  await page.route('**/js/sync-config.js', (route) => {
    route.fulfill({ contentType: 'application/javascript', body: TEST_SYNC_CONFIG_JS });
  });

  await page.goto('http://localhost:8765/index.html', { waitUntil: 'load' });

  async function fillAndSignReport(companyId, engineer) {
    await page.selectOption('#companyId', companyId);
    await page.check(`input[name="engineer"][value="${engineer}"]`);
    await page.fill('#customer', '同步测试客户');
    await page.fill('#operator', 'x');
    await page.fill('#model', 'x');
    await page.fill('#issue', 'x');
    await page.fill('#actionTaken', 'x');
    await page.fill('#orderReceivedDate', '2026-09-16T08:00');
    await page.fill('#startTravelDate', '2026-09-16T09:00');
    await page.fill('#onSiteDate', '2026-09-16T10:00');
    await page.fill('#workStart', '2026-09-16T10:30');
    await page.fill('#workEnd', '2026-09-16T12:00');
    await page.fill('#results', 'x');
    await page.locator('.part-row input[data-field="name"]').first().fill('x');
    await page.click('#proceedToSignBtn');
    await page.waitForSelector('#sign-engineer-view.active');
    await page.waitForTimeout(150);
    async function draw(sel) {
      const box = await page.locator(sel).boundingBox();
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 90, box.y + 60, { steps: 6 });
      await page.mouse.up();
    }
    await draw('#engineerSignaturePad');
    await page.click('#engineerNextBtn');
    await page.waitForSelector('#sign-customer-view.active');
    await page.waitForTimeout(150);
    await draw('#customerSignaturePad');
    await page.click('#completeSignBtn');
    await page.waitForSelector('#preview-view.active', { timeout: 5000 });
    const reportNo = await page.evaluate(() => document.querySelector('.report-doc')?.textContent.match(/[A-Z]+\d{10}[A-Z]+/)?.[0]);
    return reportNo;
  }

  // ---- 场景1：在线签字，应立即静默同步成功 ----
  // Scenario 1: sign while online, should silently sync right away
  const reportNo1 = await fillAndSignReport('STD', '罗天');
  await page.waitForTimeout(1500); // 等待后台同步请求完成 / wait for background sync request
  console.log('Report 1:', reportNo1, 'mock received count:', mock.received.length);
  if (mock.received.length !== 1) errors.push('Expected 1 sync call after online signing, got ' + mock.received.length);
  else {
    const payload = mock.received[0];
    if (payload.reportNo !== reportNo1) errors.push('Synced reportNo mismatch');
    const paths = payload.files.map((f) => f.path);
    if (!paths.includes(`reports/${reportNo1}.json`) || !paths.includes(`reports/${reportNo1}.pdf`)) {
      errors.push('Synced files missing expected paths: ' + paths.join(','));
    }
    const jsonFile = payload.files.find((f) => f.path.endsWith('.json'));
    const decoded = JSON.parse(Buffer.from(jsonFile.contentBase64, 'base64').toString('utf8'));
    if (decoded.customer !== '同步测试客户') errors.push('Decoded synced JSON content mismatch');
    console.log('Payload paths OK, decoded customer:', decoded.customer);
  }

  // check history badge shows synced
  await page.click('.tab-btn[data-view="history-view"]');
  await page.waitForTimeout(300);
  let historyHtml = await page.innerHTML('#historyList');
  if (!historyHtml.includes('已同步')) errors.push('History should show synced badge for report 1');
  else console.log('History shows 已同步 badge for report 1.');

  // ---- 场景2：离线签字，应标记待同步；恢复在线后自动补传 ----
  // Scenario 2: sign while offline, should mark pending; auto-retry once back online
  await page.click('.tab-btn[data-view="form-view"]');
  await context.setOffline(true);
  const reportNo2 = await fillAndSignReport('ZKPY', '何键');
  await page.waitForTimeout(800);
  console.log('Report 2 (offline):', reportNo2, 'mock received count so far:', mock.received.length);
  if (mock.received.length !== 1) errors.push('Offline signing should NOT have synced yet, mock count=' + mock.received.length);

  await page.click('.tab-btn[data-view="history-view"]');
  await page.waitForTimeout(300);
  historyHtml = await page.innerHTML('#historyList');
  if (!historyHtml.includes('待同步')) errors.push('History should show pending badge for report 2 while offline');
  else console.log('History shows 待同步 badge for report 2.');

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1500);
  console.log('After going back online, mock received count:', mock.received.length);
  if (mock.received.length !== 2) errors.push('Expected retry to sync report 2 after going online, mock count=' + mock.received.length);

  await page.click('.tab-btn[data-view="history-view"]');
  await page.waitForTimeout(300);
  historyHtml = await page.innerHTML('#historyList');
  const pendingCount = (historyHtml.match(/待同步/g) || []).length;
  if (pendingCount !== 0) errors.push('Expected 0 pending after retry, found ' + pendingCount);
  else console.log('All reports synced after retry, no pending badges left.');

  await browser.close();
  mock.server.close();

  if (errors.length) {
    console.error('SYNC TEST FAILURES:\n' + errors.join('\n'));
    process.exit(1);
  } else {
    console.log('ALL SYNC TESTS PASSED');
  }
})();
