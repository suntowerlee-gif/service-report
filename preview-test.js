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
    // Accept confirm() dialogs (return to edit), dismiss plain alerts
    if (dialog.type() === 'confirm') await dialog.accept();
    else await dialog.dismiss();
  });

  await page.goto('http://localhost:8765/index.html', { waitUntil: 'load' });

  await page.selectOption('#companyId', 'STD');
  await page.check('input[name="engineer"][value="尹文宣"]');
  await page.fill('#customer', '预览测试客户');
  await page.fill('#operator', '王工');
  await page.fill('#model', 'GC-3000');
  await page.fill('#issue', '色谱峰异常');
  await page.fill('#actionTaken', '更换进样口隔垫并重新老化');
  await page.fill('#orderReceivedDate', '2026-09-16T08:00');
  await page.fill('#startTravelDate', '2026-09-16T09:00');
  await page.fill('#onSiteDate', '2026-09-16T11:00');
  await page.fill('#workStart', '2026-09-16T11:30');
  await page.fill('#workEnd', '2026-09-16T14:30');
  await page.fill('#results', '设备恢复正常');

  await page.click('#proceedToSignBtn');
  await page.waitForSelector('#sign-engineer-view.active');
  await page.waitForTimeout(300);

  async function drawSignature(canvasSelector) {
    const box = await page.locator(canvasSelector).boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 60, { steps: 5 });
    await page.mouse.move(box.x + 140, box.y + 30, { steps: 5 });
    await page.mouse.up();
  }

  await drawSignature('#engineerSignaturePad');
  await page.click('#engineerNextBtn');
  await page.waitForSelector('#sign-customer-view.active');
  await page.waitForTimeout(300);

  // === Test 1: preview before customer signs ===
  const previewBtn = await page.$('#previewReportBtn');
  if (!previewBtn) errors.push('#previewReportBtn missing on sign-customer-view');
  await page.click('#previewReportBtn');
  await page.waitForSelector('#preview-view.active', { timeout: 5000 });
  await page.waitForTimeout(200);

  const draftToolbarVisible = await page.$eval('.draft-toolbar', (el) => getComputedStyle(el).display !== 'none');
  const finalToolbarVisible = await page.$eval('.final-toolbar', (el) => getComputedStyle(el).display !== 'none');
  console.log('draftToolbarVisible:', draftToolbarVisible, 'finalToolbarVisible:', finalToolbarVisible);
  if (!draftToolbarVisible) errors.push('Draft toolbar should be visible in draft preview mode');
  if (finalToolbarVisible) errors.push('Final toolbar should be hidden in draft preview mode');

  const previewHtml = await page.textContent('#printRoot');
  if (!previewHtml.includes('预览测试客户')) errors.push('Draft preview missing customer name');
  console.log('Draft preview content check OK.');

  // engineer signature should be present, customer signature area blank
  const engSigPresent = await page.$eval('#printRoot .sign-block', (el) => el.innerHTML.includes('data:image')).catch(() => false);
  console.log('Engineer signature image present in draft preview:', engSigPresent);
  if (!engSigPresent) errors.push('Engineer signature should already appear in draft preview');

  // report should NOT be persisted to IndexedDB yet
  const reportsBeforeSave = await page.evaluate(() => window.indexedDB.databases ? window.indexedDB.databases().then(() => null) : null);
  const draftPersisted = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open('service_report_db');
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('reports', 'readonly');
          const store = tx.objectStore('reports');
          const getAll = store.getAll();
          getAll.onsuccess = () => resolve(getAll.result.length);
          getAll.onerror = () => resolve(-1);
        } catch (e) { resolve(-1); }
      };
      req.onerror = () => resolve(-1);
    });
  });
  console.log('Reports in IndexedDB after draft preview (should be 0):', draftPersisted);
  if (draftPersisted !== 0) errors.push('Draft preview should not persist a report to IndexedDB, found: ' + draftPersisted);

  // === Test 2: draftBackToSignBtn returns to customer sign view with working pad ===
  await page.click('#draftBackToSignBtn');
  await page.waitForSelector('#sign-customer-view.active', { timeout: 5000 });
  await page.waitForTimeout(300);
  await drawSignature('#customerSignaturePad');
  await page.waitForTimeout(150);
  const custPadEmpty = await page.evaluate(() => {
    const canvas = document.querySelector('#customerSignaturePad');
    // crude check: canvas should have non-white pixels after drawing
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 0 && !(data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255)) return false;
    }
    return true;
  });
  console.log('Customer pad empty after redraw (should be false):', custPadEmpty);
  if (custPadEmpty) errors.push('Customer signature pad did not accept drawing after returning from draft preview');

  // === Test 3: previewReportBtn again, then draftReturnToEditBtn (return to edit) ===
  await page.click('#previewReportBtn');
  await page.waitForSelector('#preview-view.active', { timeout: 5000 });
  await page.waitForTimeout(200);
  await page.click('#draftReturnToEditBtn');
  await page.waitForTimeout(300);

  if (!dialogs.some((d) => d.includes('退回'))) errors.push('Expected confirm dialog on Return to Edit click');

  const backOnForm = await page.$eval('#form-view', (el) => el.classList.contains('active'));
  console.log('Back on form-view after Return to Edit:', backOnForm);
  if (!backOnForm) errors.push('Should return to form-view after confirming Return to Edit');

  const customerValStillThere = await page.inputValue('#customer');
  console.log('Customer field retained after return to edit:', customerValStillThere);
  if (customerValStillThere !== '预览测试客户') errors.push('Form data should be retained after Return to Edit, got: ' + customerValStillThere);

  // === Test 4: full normal completion flow still works (final toolbar after real completeSign) ===
  await page.click('#proceedToSignBtn');
  await page.waitForSelector('#sign-engineer-view.active');
  await page.waitForTimeout(300);
  await drawSignature('#engineerSignaturePad');
  await page.click('#engineerNextBtn');
  await page.waitForSelector('#sign-customer-view.active');
  await page.waitForTimeout(300);
  await drawSignature('#customerSignaturePad');
  await page.waitForTimeout(150);
  await page.click('#completeSignBtn');
  await page.waitForSelector('#preview-view.active', { timeout: 5000 });
  await page.waitForTimeout(200);

  const finalToolbarVisible2 = await page.$eval('.final-toolbar', (el) => getComputedStyle(el).display !== 'none');
  const draftToolbarVisible2 = await page.$eval('.draft-toolbar', (el) => getComputedStyle(el).display !== 'none');
  console.log('After real completeSign -> finalToolbarVisible:', finalToolbarVisible2, 'draftToolbarVisible:', draftToolbarVisible2);
  if (!finalToolbarVisible2) errors.push('Final toolbar should be visible after real signing completion');
  if (draftToolbarVisible2) errors.push('Draft toolbar should be hidden after real signing completion');

  const persistedCount = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open('service_report_db');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('reports', 'readonly');
        const store = tx.objectStore('reports');
        const getAll = store.getAll();
        getAll.onsuccess = () => resolve(getAll.result.length);
        getAll.onerror = () => resolve(-1);
      };
      req.onerror = () => resolve(-1);
    });
  });
  console.log('Reports persisted after real sign completion:', persistedCount);
  if (persistedCount !== 1) errors.push('Expected exactly 1 persisted report after real completion, got: ' + persistedCount);

  await browser.close();

  if (errors.length) {
    console.error('TEST FAILURES:\n' + errors.join('\n'));
    process.exit(1);
  } else {
    console.log('ALL PREVIEW-FLOW TESTS PASSED');
  }
})();
