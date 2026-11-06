const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/ERR_TUNNEL_CONNECTION_FAILED|workers\.dev|sync\.zkpykj\.com/.test(msg.text())) return;
    errors.push('console.error: ' + msg.text());
  });
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    if (dialog.type() === 'confirm') await dialog.accept();
    else await dialog.accept();
  });

  await page.goto('http://localhost:8765/index.html', { waitUntil: 'load' });

  // === Test: new YJC company present in dropdown with correct data ===
  const yjcOption = await page.$eval('#companyId option[value="YJC"]', (el) => el.textContent).catch(() => null);
  console.log('YJC company option text:', yjcOption);
  if (!yjcOption || !yjcOption.includes('源璟诚')) errors.push('YJC company missing from dropdown or label wrong: ' + yjcOption);

  // === Test: fill partial form, save as draft ===
  await page.selectOption('#companyId', 'YJC');
  await page.check('input[name="engineer"][value="罗天"]');
  await page.fill('#customer', '草稿测试客户');
  await page.fill('#model', 'DRAFT-MODEL-1');
  await page.fill('#issue', '草稿阶段问题描述');

  const saveDraftBtn = await page.$('#saveDraftBtn');
  if (!saveDraftBtn) errors.push('#saveDraftBtn missing on form-view');
  await page.click('#saveDraftBtn');
  await page.waitForTimeout(300);
  if (!dialogs.some((d) => d.includes('草稿已保存'))) errors.push('Expected draft-saved confirmation alert');

  // reportNo field should remain empty for a draft (no official number burned)
  const reportNoAfterDraft = await page.inputValue('#reportNo');
  console.log('reportNo after saving draft (should be empty):', JSON.stringify(reportNoAfterDraft));
  if (reportNoAfterDraft !== '') errors.push('Draft should not reserve an official report number, got: ' + reportNoAfterDraft);

  // === Test: draft shows up in History with Resume/Delete buttons ===
  await page.click('.tab-btn[data-view="history-view"]');
  await page.waitForTimeout(300);
  const historyText = await page.textContent('#historyList');
  if (!historyText.includes('草稿测试客户')) errors.push('History list missing saved draft customer name');
  if (!historyText.includes('草稿')) errors.push('History list missing draft badge text');

  const resumeBtn = await page.$('.resume-draft-btn');
  const deleteBtn = await page.$('.delete-draft-btn');
  if (!resumeBtn) errors.push('.resume-draft-btn missing in history for draft');
  if (!deleteBtn) errors.push('.delete-draft-btn missing in history for draft');

  // === Test: resume draft repopulates form fields ===
  await page.click('.resume-draft-btn');
  await page.waitForTimeout(300);
  const formActive = await page.$eval('#form-view', (el) => el.classList.contains('active'));
  if (!formActive) errors.push('Resuming draft should switch to form-view');
  const resumedCustomer = await page.inputValue('#customer');
  const resumedModel = await page.inputValue('#model');
  const resumedCompany = await page.inputValue('#companyId');
  console.log('Resumed fields:', resumedCustomer, resumedModel, resumedCompany);
  if (resumedCustomer !== '草稿测试客户') errors.push('Resumed draft customer field wrong: ' + resumedCustomer);
  if (resumedModel !== 'DRAFT-MODEL-1') errors.push('Resumed draft model field wrong: ' + resumedModel);
  if (resumedCompany !== 'YJC') errors.push('Resumed draft company field wrong: ' + resumedCompany);

  // === Test: complete the resumed draft -> draft is promoted & removed, only final report remains ===
  await page.fill('#operator', '测试负责人');
  await page.fill('#actionTaken', '已处理完成');
  await page.fill('#orderReceivedDate', '2026-11-06T08:00');
  await page.fill('#startTravelDate', '2026-11-06T09:00');
  await page.fill('#onSiteDate', '2026-11-06T11:00');
  await page.fill('#workStart', '2026-11-06T11:30');
  await page.fill('#workEnd', '2026-11-06T14:30');
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
  await drawSignature('#customerSignaturePad');
  await page.waitForTimeout(150);
  await page.click('#completeSignBtn');
  await page.waitForSelector('#preview-view.active', { timeout: 5000 });
  await page.waitForTimeout(200);

  await page.click('.tab-btn[data-view="history-view"]');
  await page.waitForTimeout(300);
  const historyAfterComplete = await page.textContent('#historyList');
  const draftStillThereCount = (historyAfterComplete.match(/草稿测试客户/g) || []).length;
  console.log('Occurrences of draft customer name in history after completion (should be 1, as final report):', draftStillThereCount);
  if (draftStillThereCount !== 1) errors.push('Expected exactly 1 history entry for this customer after draft promotion, found: ' + draftStillThereCount);

  const remainingDraftBadges = await page.$$eval('.resume-draft-btn', (els) => els.length);
  console.log('Remaining draft entries after promotion (should be 0):', remainingDraftBadges);
  if (remainingDraftBadges !== 0) errors.push('Draft should have been deleted after promotion to final report, still found: ' + remainingDraftBadges);

  // === Test: save a second draft, then delete it via the Delete button ===
  await page.click('.tab-btn[data-view="form-view"]');
  await page.waitForTimeout(200);
  await page.selectOption('#companyId', 'STD');
  await page.check('input[name="engineer"][value="何键"]');
  await page.fill('#customer', '待删除草稿客户');
  await page.click('#saveDraftBtn');
  await page.waitForTimeout(300);

  await page.click('.tab-btn[data-view="history-view"]');
  await page.waitForTimeout(300);
  const beforeDelete = await page.textContent('#historyList');
  if (!beforeDelete.includes('待删除草稿客户')) errors.push('Second draft not found in history before delete');

  await page.click('.delete-draft-btn');
  await page.waitForTimeout(300);
  const afterDelete = await page.textContent('#historyList');
  if (afterDelete.includes('待删除草稿客户')) errors.push('Draft still present in history after delete');
  else console.log('Draft successfully deleted from history.');

  await browser.close();

  if (errors.length) {
    console.error('TEST FAILURES:\n' + errors.join('\n'));
    process.exit(1);
  } else {
    console.log('ALL DRAFT-FEATURE TESTS PASSED');
  }
})();
