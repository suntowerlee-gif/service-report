// Verifies the new signature-quality guard: a single tap/click (no real movement) must be
// rejected on both the engineer and customer signing pages, while a small-but-real scrawl
// (e.g. quick initials) must still be accepted.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // 后台静默同步会尝试请求真实的Cloudflare Worker地址，
    // 在这个开发/测试沙箱里出口网络策略会挡掉这个域名，属于沙箱环境限制，
    // 不代表产品本身有问题（真实手机联网环境下能正常连通），测试里忽略这类噪音。
    // The background sync tries to reach the real Cloudflare Worker URL, which this
    // dev/test sandbox's egress policy blocks — a sandbox limitation, not a product bug
    // (a real phone with normal internet access reaches it fine). Ignore that noise here.
    if (/ERR_TUNNEL_CONNECTION_FAILED|workers\.dev/.test(msg.text())) return;
    errors.push('console.error: ' + msg.text());
  });
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await page.goto('http://localhost:8765/index.html', { waitUntil: 'load' });

  await page.selectOption('#companyId', 'STD');
  await page.check('input[name="engineer"][value="尹文宣"]');
  await page.fill('#customer', '签字质量测试客户');
  await page.fill('#operator', '赵工');
  await page.fill('#model', 'UV-1800');
  await page.fill('#issue', '灯源老化');
  await page.fill('#actionTaken', '更换氘灯');
  await page.fill('#orderReceivedDate', '2026-09-24T08:00');
  await page.fill('#startTravelDate', '2026-09-24T09:00');
  await page.fill('#onSiteDate', '2026-09-24T11:00');
  await page.fill('#workStart', '2026-09-24T11:30');
  await page.fill('#workEnd', '2026-09-24T14:30');
  await page.fill('#results', '恢复正常');

  await page.click('#proceedToSignBtn');
  await page.waitForSelector('#sign-engineer-view.active');
  await page.waitForTimeout(300);

  async function tapOnly(canvasSelector) {
    const box = await page.locator(canvasSelector).boundingBox();
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.up();
  }

  async function tinyRealScrawl(canvasSelector) {
    const box = await page.locator(canvasSelector).boundingBox();
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 45, box.y + 20, { steps: 4 });
    await page.mouse.move(box.x + 55, box.y + 35, { steps: 4 });
    await page.mouse.up();
  }

  // === Test 1: engineer taps only -> must be rejected, stay on engineer view ===
  await tapOnly('#engineerSignaturePad');
  const dialogCountBefore = dialogs.length;
  await page.click('#engineerNextBtn');
  await page.waitForTimeout(300);
  const stillOnEngineerAfterTap = await page.$eval('#sign-engineer-view', (el) => el.classList.contains('active'));
  console.log('Still on engineer view after tap-only click Next (expected true):', stillOnEngineerAfterTap);
  if (!stillOnEngineerAfterTap) errors.push('A tap-only mark on the engineer pad should be rejected, but the app advanced to the next view');
  if (dialogs.length <= dialogCountBefore) errors.push('Expected a rejection alert dialog after tap-only engineer signature');
  else console.log('Rejection dialog shown:', dialogs[dialogs.length - 1]);

  // clear and provide a real (tiny but real) scrawl -> should be accepted
  await page.click('[data-clear="engineerSignaturePad"]');
  await page.waitForTimeout(150);
  await tinyRealScrawl('#engineerSignaturePad');
  await page.click('#engineerNextBtn');
  await page.waitForSelector('#sign-customer-view.active', { timeout: 5000 });
  console.log('Tiny real scrawl accepted for engineer signature: true');

  // === Test 2: customer taps only -> must be rejected, stay on customer view / not complete ===
  await page.waitForTimeout(300);
  await tapOnly('#customerSignaturePad');
  const dialogCountBefore2 = dialogs.length;
  await page.click('#completeSignBtn');
  await page.waitForTimeout(300);
  const stillOnCustomerAfterTap = await page.$eval('#sign-customer-view', (el) => el.classList.contains('active'));
  console.log('Still on customer view after tap-only click Complete (expected true):', stillOnCustomerAfterTap);
  if (!stillOnCustomerAfterTap) errors.push('A tap-only mark on the customer pad should be rejected, but the report was completed');
  if (dialogs.length <= dialogCountBefore2) errors.push('Expected a rejection alert dialog after tap-only customer signature');
  else console.log('Rejection dialog shown:', dialogs[dialogs.length - 1]);

  // clear and provide a real (tiny but real) scrawl -> should complete successfully
  await page.click('[data-clear="customerSignaturePad"]');
  await page.waitForTimeout(150);
  await tinyRealScrawl('#customerSignaturePad');
  await page.click('#completeSignBtn');
  await page.waitForSelector('#preview-view.active', { timeout: 5000 });
  console.log('Tiny real scrawl accepted for customer signature, report completed: true');

  await browser.close();

  if (errors.length) {
    console.error('TEST FAILURES:\n' + errors.join('\n'));
    process.exit(1);
  } else {
    console.log('ALL SIGNATURE-QUALITY TESTS PASSED');
  }
})();
