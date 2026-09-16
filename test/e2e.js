const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });
  page.on('dialog', async (dialog) => { console.log('DIALOG:', dialog.message()); await dialog.dismiss(); });

  await page.goto('http://localhost:8765/index.html', { waitUntil: 'load' });

  // fill company + engineer
  await page.selectOption('#companyId', 'STD');
  await page.check('input[name="engineer"][value="尹文宣"]');

  // required fields (email / waitingHours now optional and left blank on purpose)
  await page.fill('#customer', '测试客户有限公司');
  await page.fill('#operator', '张经理');
  await page.fill('#model', 'FTIR-2000');
  await page.fill('#issue', '仪器基线漂移');
  await page.fill('#actionTaken', '更换光源并重新校准');
  await page.fill('#orderReceivedDate', '2026-09-16T08:00');
  await page.fill('#startTravelDate', '2026-09-16T09:00');
  await page.fill('#onSiteDate', '2026-09-16T11:00');
  await page.fill('#workStart', '2026-09-16T11:30');
  await page.fill('#workEnd', '2026-09-16T14:30');
  await page.fill('#results', '设备恢复正常，基线稳定');

  // computed time fields
  const travelTime = await page.inputValue('#travelTime');
  const totalWorkingHours = await page.inputValue('#totalWorkingHours');
  console.log('Auto travelTime:', travelTime, 'Auto totalWorkingHours:', totalWorkingHours);
  if (travelTime !== '2.00') errors.push('travelTime auto-calc wrong: ' + travelTime);
  if (totalWorkingHours !== '3.00') errors.push('totalWorkingHours auto-calc wrong: ' + totalWorkingHours);

  // fax field should no longer exist
  const faxExists = await page.$('#fax');
  if (faxExists) errors.push('#fax field should have been removed');

  // parts: type multiple characters including Chinese, verify no focus loss / truncation
  const nameInput = page.locator('.part-row input[data-field="name"]').first();
  await nameInput.click();
  await nameInput.type('氘灯光源模块A1', { delay: 30 });
  const qtyInput = page.locator('.part-row input[data-field="qty"]').first();
  await qtyInput.click();
  await qtyInput.type('12', { delay: 30 });
  const priceInput = page.locator('.part-row input[data-field="price"]').first();
  await priceInput.click();
  await priceInput.type('125.5', { delay: 30 });

  const nameVal = await nameInput.inputValue();
  const qtyVal = await qtyInput.inputValue();
  const priceVal = await priceInput.inputValue();
  console.log('Parts row values after typing:', nameVal, qtyVal, priceVal);
  if (nameVal !== '氘灯光源模块A1') errors.push('Part name typing broken, got: ' + nameVal);
  if (qtyVal !== '12') errors.push('Part qty typing broken, got: ' + qtyVal);
  if (priceVal !== '125.5') errors.push('Part price typing broken, got: ' + priceVal);

  // check placeholders visible on qty/price when empty (add a fresh row)
  await page.click('#addPartRow');
  const secondRowQtyPlaceholder = await page.locator('.part-row input[data-field="qty"]').nth(1).getAttribute('placeholder');
  const secondRowPricePlaceholder = await page.locator('.part-row input[data-field="price"]').nth(1).getAttribute('placeholder');
  console.log('2nd row placeholders:', secondRowQtyPlaceholder, secondRowPricePlaceholder);
  if (!secondRowQtyPlaceholder || !secondRowPricePlaceholder) errors.push('Qty/Price placeholders missing on empty row');

  // fees
  await page.fill('#laborHours', '3');
  await page.fill('#laborRate', '200');
  await page.fill('#basicPrice', '300');
  await page.selectOption('#taxRate', '0.13');

  const grand = await page.textContent('#grandTotal');
  console.log('Grand total displayed:', grand);
  // parts: 12*125.5=1506, labor 3*200=600, basic 300 => (1506+600+300)*1.13=2712*1.13... compute exactly
  const expected = ((12 * 125.5) + 600 + 300) * 1.13;
  if (!grand.includes(expected.toFixed(2))) errors.push('Fee calc mismatch, got ' + grand + ' expected ' + expected.toFixed(2));

  // photo upload
  const fileInput = await page.$('#photoInput');
  await fileInput.setInputFiles('/tmp/test-photo.jpg');
  await page.waitForTimeout(300);
  const thumbCount = await page.$$eval('.photo-thumb', (els) => els.length);
  if (thumbCount !== 1) errors.push('Photo upload failed, thumbCount=' + thumbCount);

  // proceed to sign (engineer first)
  await page.click('#proceedToSignBtn');
  await page.waitForSelector('#sign-engineer-view.active');
  await page.waitForTimeout(300);

  const reportNo = await page.inputValue('#reportNo');
  console.log('Report No generated:', reportNo);
  if (!/^STD\d{8}\d{2}YWX$/.test(reportNo)) errors.push('Report number format unexpected: ' + reportNo);

  async function drawSignature(canvasSelector) {
    const box = await page.locator(canvasSelector).boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 60, { steps: 5 });
    await page.mouse.move(box.x + 140, box.y + 30, { steps: 5 });
    await page.mouse.up();
  }

  // try clicking next without signing engineer -> should alert and stay
  await page.click('#engineerNextBtn');
  await page.waitForTimeout(200);
  const stillEngineerView = await page.$eval('#sign-engineer-view', (el) => el.classList.contains('active'));
  if (!stillEngineerView) errors.push('Should stay on engineer sign view when signature empty');

  await drawSignature('#engineerSignaturePad');
  await page.click('#engineerNextBtn');
  await page.waitForSelector('#sign-customer-view.active');
  await page.waitForTimeout(300);

  await drawSignature('#customerSignaturePad');
  await page.waitForTimeout(200);

  await page.click('#completeSignBtn');
  await page.waitForSelector('#preview-view.active', { timeout: 5000 });

  const docHtml = await page.textContent('#printRoot');
  if (!docHtml.includes('测试客户有限公司')) errors.push('Preview missing customer name');
  if (!docHtml.includes('氘灯光源模块A1')) errors.push('Preview missing part name (possible truncation bug)');
  console.log('Preview rendered OK.');

  // logo present in header
  const logoSrc = await page.$eval('.report-doc .company-logo', (img) => img.getAttribute('src')).catch(() => null);
  console.log('Logo src in report:', logoSrc);
  if (!logoSrc || !logoSrc.includes('logo-STD')) errors.push('Company logo missing/incorrect in report header');

  // history check
  await page.click('.tab-btn[data-view="history-view"]');
  await page.waitForTimeout(300);
  const historyText = await page.textContent('#historyList');
  if (!historyText.includes(reportNo)) errors.push('History list missing report: ' + reportNo);
  else console.log('History list contains report:', reportNo);

  // offline reload test
  await context.setOffline(true);
  await page.waitForTimeout(500);
  try {
    await page.reload({ waitUntil: 'load', timeout: 8000 });
    const title = await page.title();
    console.log('Offline reload title:', title);
  } catch (e) {
    errors.push('Offline reload failed: ' + e.message);
  }
  await context.setOffline(false);

  await browser.close();

  if (errors.length) {
    console.error('TEST FAILURES:\n' + errors.join('\n'));
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED');
  }
})();
