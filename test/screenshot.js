const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('dialog', async (dialog) => { await dialog.accept(); });

  await page.goto('http://localhost:8765/index.html', { waitUntil: 'load' });

  // 1. Company dropdown open, showing YJC
  await page.selectOption('#companyId', 'YJC');
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/shot-1-company-selected.png' });

  // 2. Save draft button visible
  await page.fill('#customer', '截图示例客户');
  await page.screenshot({ path: '/tmp/shot-2-save-draft-btn.png' });

  await page.click('#saveDraftBtn');
  await page.waitForTimeout(300);

  // 3. History view showing draft badge + resume/delete buttons
  await page.click('.tab-btn[data-view="history-view"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shot-3-history-draft.png' });

  // 4. Full report preview with YJC bank info (no postal/fax/hotline/bankCode lines)
  await page.click('.resume-draft-btn');
  await page.waitForTimeout(300);
  await page.check('input[name="engineer"][value="罗天"]');
  await page.fill('#operator', '张三');
  await page.fill('#model', 'GC-9000');
  await page.fill('#issue', '测试问题');
  await page.fill('#actionTaken', '测试处理');
  await page.fill('#orderReceivedDate', '2026-11-06T08:00');
  await page.fill('#startTravelDate', '2026-11-06T09:00');
  await page.fill('#onSiteDate', '2026-11-06T11:00');
  await page.fill('#workStart', '2026-11-06T11:30');
  await page.fill('#workEnd', '2026-11-06T14:30');
  await page.fill('#results', '设备恢复正常');
  await page.click('#proceedToSignBtn');
  await page.waitForSelector('#sign-engineer-view.active');
  await page.waitForTimeout(200);

  async function drawSignature(sel) {
    const box = await page.locator(sel).boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 60, { steps: 5 });
    await page.mouse.move(box.x + 140, box.y + 30, { steps: 5 });
    await page.mouse.up();
  }
  await drawSignature('#engineerSignaturePad');
  await page.click('#engineerNextBtn');
  await page.waitForSelector('#sign-customer-view.active');
  await page.waitForTimeout(200);
  await drawSignature('#customerSignaturePad');
  await page.waitForTimeout(150);
  await page.click('#completeSignBtn');
  await page.waitForSelector('#preview-view.active', { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shot-4-final-report-yjc.png', fullPage: true });

  await browser.close();
  console.log('Screenshots done.');
})();
