// 主应用逻辑 / Main application logic
(function () {
  "use strict";

  let parts = [];        // 备件行 / spare part rows
  let photos = [];        // 图片base64数组 / photo dataURLs
  let customerPad = null;
  let engineerPad = null;
  let draftReportNo = null; // 生成后暂存，避免重复占用序号 / cache once generated so we don't burn sequence numbers twice
  let currentPreviewId = null;

  const $ = (sel) => document.querySelector(sel);
  const $all = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- 初始化 Init ----------
  function init() {
    populateCompanySelect();
    populateEngineerChecks();
    populateSigningEngineerSelect();
    bindNav();
    bindFormEvents();
    bindPartsTableDelegation();
    bindSignViews();
    bindPreviewView();
    setupSignaturePads();
    bindComputedTimeFields();
    addPartRow();
    recalcFees();
    renderHistory();
    registerServiceWorker();
    // App启动或恢复联网时，尝试把之前离线未同步成功的报告补传
    // On startup or when connectivity returns, retry any reports that failed to sync earlier
    if (window.ReportSync) ReportSync.retryPendingSync().then(() => renderHistory());
  }

  function populateCompanySelect() {
    const sel = $("#companyId");
    COMPANIES.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.nameCn} (${c.id})`;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => { draftReportNo = null; $("#reportNo").value = ""; });
  }

  function populateEngineerChecks() {
    const wrap = $("#engineerChecks");
    ENGINEERS.forEach((e) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" name="engineer" value="${e.name}" /> ${e.name}`;
      wrap.appendChild(label);
    });
    wrap.addEventListener("change", () => {
      draftReportNo = null;
      $("#reportNo").value = "";
      populateSigningEngineerSelect();
    });
  }

  function populateSigningEngineerSelect() {
    const sel = $("#signingEngineer");
    const checked = $all('input[name="engineer"]:checked').map((c) => c.value);
    sel.innerHTML = "";
    const list = checked.length ? checked : ENGINEERS.map((e) => e.name);
    list.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }

  // ---------- 导航 Navigation ----------
  function bindNav() {
    $all(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $all(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        showView(btn.dataset.view);
        if (btn.dataset.view === "history-view") renderHistory();
      });
    });
  }

  function showView(id) {
    $all(".view").forEach((v) => v.classList.remove("active"));
    $("#" + id).classList.add("active");
    // 切换视图后回到顶部，避免残留滚动导致内容被吸顶header遮挡
    // Reset scroll on view switch so leftover scroll doesn't hide content under the sticky header
    window.scrollTo(0, 0);
  }

  function setActiveTabByView(id) {
    $all(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === id));
  }

  // ---------- 备件表 Parts table ----------
  // 注意：为避免每次按键都整体重建DOM导致输入框失焦（中文输入法/多字符连续输入被打断），
  // 这里只在“新增/删除行”结构变化时整体渲染，日常输入通过事件委托直接更新数据和小计文本，不重建输入框。
  // Note: to avoid rebuilding the whole DOM on every keystroke (which breaks focus / Chinese IME
  // composition / multi-character typing), we only fully re-render on add/remove. Normal typing
  // is handled via event delegation that updates the model and the line-total text in place.
  function addPartRow() {
    parts.push({ name: "", qty: "", price: "" });
    renderPartsTable();
  }

  function renderPartsTable() {
    const wrap = $("#partsTable");
    wrap.innerHTML = "";
    parts.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "part-row";
      row.dataset.idx = idx;
      row.innerHTML = `
        <input type="text" placeholder="备件名称 Name" value="${escapeAttr(p.name)}" data-field="name" />
        <input type="number" min="0" step="1" placeholder="数量 Qty" value="${p.qty}" data-field="qty" />
        <input type="number" min="0" step="0.01" placeholder="单价 Price" value="${p.price}" data-field="price" />
        <span class="part-line-total">${fmtMoney((Number(p.qty)||0)*(Number(p.price)||0))}</span>
        <button type="button" class="remove-part">×</button>
      `;
      wrap.appendChild(row);
    });
  }

  // 事件委托：只绑定一次，不随行重建而重复绑定 / Delegated once, survives row structure changes
  function bindPartsTableDelegation() {
    const wrap = $("#partsTable");
    wrap.addEventListener("input", (e) => {
      const field = e.target.dataset.field;
      if (!field) return;
      const row = e.target.closest(".part-row");
      const idx = Number(row.dataset.idx);
      parts[idx][field] = field === "name" ? e.target.value : e.target.value;
      const qty = Number(parts[idx].qty) || 0;
      const price = Number(parts[idx].price) || 0;
      row.querySelector(".part-line-total").textContent = fmtMoney(qty * price);
      recalcFees();
    });
    wrap.addEventListener("click", (e) => {
      if (!e.target.classList.contains("remove-part")) return;
      const row = e.target.closest(".part-row");
      const idx = Number(row.dataset.idx);
      parts.splice(idx, 1);
      renderPartsTable();
      recalcFees();
    });
  }

  function escapeAttr(s) { return String(s || "").replace(/"/g, "&quot;"); }

  // ---------- 费用计算 Fee calculation ----------
  function partsFeeTotal() {
    return parts.reduce((sum, p) => sum + (Number(p.qty) || 0) * (Number(p.price) || 0), 0);
  }

  function recalcFees() {
    const pTotal = partsFeeTotal();
    const laborHours = Number($("#laborHours").value) || 0;
    const laborRate = Number($("#laborRate").value) || 0;
    const laborTotal = laborHours * laborRate;
    const basicPrice = Number($("#basicPrice").value) || 0;
    const taxRate = Number($("#taxRate").value) || 0;
    const grand = (pTotal + laborTotal + basicPrice) * (1 + taxRate);

    $("#partsFeeTotal").textContent = fmtMoney(pTotal);
    $("#laborFeeTotal").textContent = fmtMoney(laborTotal);

    const byContract = $("#byContract").checked;
    $("#grandTotal").textContent = byContract ? "按照合同约定付费 Per contract" : fmtMoney(grand);

    return { pTotal, laborTotal, basicPrice, taxRate, grand };
  }

  // ---------- 图片附件 Photo attachments ----------
  function bindPhotoInput() {
    $("#photoInput").addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          photos.push(reader.result);
          renderPhotoPreview();
        };
        reader.readAsDataURL(file);
      });
      e.target.value = "";
    });
  }

  function renderPhotoPreview() {
    const wrap = $("#photoPreview");
    wrap.innerHTML = "";
    photos.forEach((src, idx) => {
      const div = document.createElement("div");
      div.className = "photo-thumb";
      div.innerHTML = `<img src="${src}" /><button type="button" class="remove-photo" data-idx="${idx}">×</button>`;
      wrap.appendChild(div);
    });
    wrap.querySelectorAll(".remove-photo").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        photos.splice(Number(e.target.dataset.idx), 1);
        renderPhotoPreview();
      });
    });
  }

  // ---------- 时间自动计算 Auto-computed time fields ----------
  // Travel Time 总旅途时间 = On Site Date 到达现场时间 − Start Travel Date 出发时间
  // Total Working Hours 总工作时间 = Working Date(End) 工作结束 − Working Date(Start) 工作开始
  function bindComputedTimeFields() {
    ["startTravelDate", "onSiteDate"].forEach((id) => $("#" + id).addEventListener("change", updateTravelTime));
    ["workStart", "workEnd"].forEach((id) => $("#" + id).addEventListener("change", updateWorkingHours));
  }

  function hoursBetween(startVal, endVal) {
    if (!startVal || !endVal) return "";
    const start = new Date(startVal);
    const end = new Date(endVal);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";
    const diffH = (end.getTime() - start.getTime()) / 3600000;
    if (diffH < 0) return "";
    return diffH.toFixed(2);
  }

  function updateTravelTime() {
    $("#travelTime").value = hoursBetween($("#startTravelDate").value, $("#onSiteDate").value);
  }

  function updateWorkingHours() {
    $("#totalWorkingHours").value = hoursBetween($("#workStart").value, $("#workEnd").value);
  }

  // ---------- 表单事件绑定 Form events ----------
  function bindFormEvents() {
    $("#addPartRow").addEventListener("click", addPartRow);
    ["laborHours", "laborRate", "basicPrice", "taxRate"].forEach((id) => {
      $("#" + id).addEventListener("input", recalcFees);
      $("#" + id).addEventListener("change", recalcFees);
    });
    $("#byContract").addEventListener("change", recalcFees);
    bindPhotoInput();
    $("#proceedToSignBtn").addEventListener("click", onProceedToSign);
  }

  function getRequiredFieldIds() {
    return [
      "customer", "operator", "model", "issue", "actionTaken",
      "orderReceivedDate", "startTravelDate", "onSiteDate",
      "workStart", "workEnd", "results"
    ];
  }

  function validateFormFields() {
    let firstInvalid = null;
    const missing = [];
    getRequiredFieldIds().forEach((id) => {
      const el = $("#" + id);
      if (!el.value || String(el.value).trim() === "") {
        missing.push(id);
        if (!firstInvalid) firstInvalid = el;
      }
    });
    if (!$("#companyId").value) { missing.push("companyId"); firstInvalid = firstInvalid || $("#companyId"); }
    const engineersChecked = $all('input[name="engineer"]:checked');
    if (engineersChecked.length === 0) { missing.push("engineer"); }
    if (missing.length) {
      if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      alert("请填写全部红色必填项 / Please fill in all required (red) fields.\n缺少 Missing: " + missing.join(", "));
      return false;
    }
    return true;
  }

  async function onProceedToSign() {
    if (!validateFormFields()) return;
    const companyId = $("#companyId").value;
    const engineersChecked = $all('input[name="engineer"]:checked').map((c) => c.value);
    if (!draftReportNo) {
      const primary = getEngineerByName(engineersChecked[0]);
      draftReportNo = await generateReportNumber(companyId, primary ? primary.initials : "XX", new Date());
      $("#reportNo").value = draftReportNo;
    }
    populateSigningEngineerSelect();
    showView("sign-engineer-view");
    // 切换到签字视图后画布才可见，此时才能正确获取尺寸并重设，避免0x0画布
    // Canvas is only visible after switching views; resize now to avoid a 0x0 canvas
    requestAnimationFrame(() => resizeSignaturePad($("#engineerSignaturePad"), engineerPad));
  }

  // ---------- 签名 Signature ----------
  function setupSignaturePads() {
    customerPad = new SignaturePad($("#customerSignaturePad"), { backgroundColor: "#ffffff" });
    engineerPad = new SignaturePad($("#engineerSignaturePad"), { backgroundColor: "#ffffff" });
    resizeSignaturePad($("#customerSignaturePad"), customerPad);
    resizeSignaturePad($("#engineerSignaturePad"), engineerPad);
    const resizeActivePad = () => {
      if ($("#sign-engineer-view").classList.contains("active")) resizeSignaturePad($("#engineerSignaturePad"), engineerPad);
      if ($("#sign-customer-view").classList.contains("active")) resizeSignaturePad($("#customerSignaturePad"), customerPad);
    };
    window.addEventListener("resize", resizeActivePad);
    // 横竖屏切换时部分移动浏览器需要延迟一帧才能拿到新尺寸 / some mobile browsers report new size a frame late on rotation
    window.addEventListener("orientationchange", () => setTimeout(resizeActivePad, 300));
  }

  function resizeSignaturePad(canvas, pad) {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const data = pad.toData ? pad.toData() : null;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    pad.clear();
    if (data && data.length) pad.fromData(data);
  }

  function bindSignViews() {
    $all('[data-clear]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.clear;
        (id === "customerSignaturePad" ? customerPad : engineerPad).clear();
      });
    });
    $("#backToFormBtn").addEventListener("click", () => showView("form-view"));
    $("#engineerNextBtn").addEventListener("click", onEngineerSignNext);
    $("#backToEngineerSignBtn").addEventListener("click", () => {
      showView("sign-engineer-view");
      requestAnimationFrame(() => resizeSignaturePad($("#engineerSignaturePad"), engineerPad));
    });
    $("#completeSignBtn").addEventListener("click", onCompleteSign);
  }

  function onEngineerSignNext() {
    if (engineerPad.isEmpty()) {
      alert("请工程师完成签字 / Engineer signature is required.");
      return;
    }
    showView("sign-customer-view");
    requestAnimationFrame(() => resizeSignaturePad($("#customerSignaturePad"), customerPad));
  }

  // 采集表单当前内容，供“最终生成报告”和“签字前预览草稿”共用，避免两处重复维护字段列表
  // Collects the current form content, shared by both "final generate" and "pre-sign draft preview" so the field list is only maintained in one place
  function collectReportFields() {
    const fees = recalcFees();
    const companyId = $("#companyId").value;
    const engineersChecked = $all('input[name="engineer"]:checked').map((c) => c.value);
    return {
      companyId,
      engineers: engineersChecked,
      signingEngineer: $("#signingEngineer").value,
      customer: $("#customer").value,
      deptAdd: $("#deptAdd").value,
      operator: $("#operator").value,
      mobile: $("#mobile").value,
      email: $("#email").value,
      province: $("#province").value,
      model: $("#model").value,
      serialNo: $("#serialNo").value,
      computer: $("#computer").value,
      servTag: $("#servTag").value,
      software: $("#software").value,
      os: $("#os").value,
      contractNo: $("#contractNo").value,
      notification: $("#notification").value,
      serviceType: $all('input[name="serviceType"]:checked').map((c) => c.value),
      issue: $("#issue").value,
      actionTaken: $("#actionTaken").value,
      orderReceivedDate: $("#orderReceivedDate").value,
      startTravelDate: $("#startTravelDate").value,
      onSiteDate: $("#onSiteDate").value,
      travelTime: $("#travelTime").value,
      workStart: $("#workStart").value,
      workEnd: $("#workEnd").value,
      totalWorkingHours: $("#totalWorkingHours").value,
      totalSupportHours: $("#totalSupportHours").value,
      waitingHours: $("#waitingHours").value,
      results: $("#results").value,
      engineerAdvice: $("#engineerAdvice").value,
      parts: parts.filter((p) => p.name || p.qty || p.price),
      partsFeeTotal: fees.pTotal,
      laborHours: $("#laborHours").value,
      laborRate: $("#laborRate").value,
      laborFeeTotal: fees.laborTotal,
      basicPrice: fees.basicPrice,
      taxRate: fees.taxRate,
      byContract: $("#byContract").checked,
      grandTotal: fees.grand,
      photos: photos.slice()
    };
  }

  // 客户签字前的预览草稿：不要求签字齐全，不落库，仅供内容核对
  // Pre-sign draft preview: doesn't require signatures, isn't saved, just for content review
  function onPreviewReport() {
    const now = new Date().toISOString();
    const draft = Object.assign({}, collectReportFields(), {
      id: draftReportNo || "DRAFT",
      reportNo: draftReportNo || "（未生成 / not yet generated）",
      customerSignature: "", // 客户此时还未签字 / customer hasn't signed yet at this point
      customerSignedAt: "",
      engineerSignature: engineerPad.isEmpty() ? "" : engineerPad.toDataURL("image/png"),
      engineerSignedAt: engineerPad.isEmpty() ? "" : now,
      locked: false
    });
    renderPreview(draft);
    setPreviewMode("draft");
    showView("preview-view");
  }

  function setPreviewMode(mode) {
    $(".draft-toolbar").style.display = mode === "draft" ? "flex" : "none";
    $(".final-toolbar").style.display = mode === "draft" ? "none" : "flex";
  }

  async function onCompleteSign() {
    if (customerPad.isEmpty()) {
      alert("请客户完成签字 / Customer signature is required.");
      return;
    }
    if (engineerPad.isEmpty()) {
      alert("工程师签字缺失，请返回上一步重新签字 / Engineer signature missing, please go back.");
      return;
    }
    const now = new Date().toISOString();

    const report = Object.assign({}, collectReportFields(), {
      id: draftReportNo,
      reportNo: draftReportNo,
      customerSignature: customerPad.toDataURL("image/png"),
      customerSignedAt: now,
      engineerSignature: engineerPad.toDataURL("image/png"),
      engineerSignedAt: now,
      locked: true,
      synced: false,
      createdAt: now
    });

    await saveReport(report);
    resetForm();
    currentPreviewId = report.id;
    renderPreview(report);
    setPreviewMode("final");
    showView("preview-view");
    setActiveTabByView("history-view");

    // 后台静默同步，不阻塞、不打断用户；失败也不提示，留待自动重试
    // Silent background sync — never blocks the UI or alerts on failure; retried automatically later
    if (window.ReportSync && ReportSync.syncEnabled()) {
      ReportSync.trySync(report).then(() => {
        if ($("#history-view").classList.contains("active")) renderHistory();
      });
    }
  }

  function resetForm() {
    $("#report-form").reset();
    parts = [];
    photos = [];
    draftReportNo = null;
    $("#reportNo").value = "";
    renderPartsTable();
    renderPhotoPreview();
    addPartRow();
    recalcFees();
    customerPad.clear();
    engineerPad.clear();
  }

  // ---------- 预览/导出 Preview & Export ----------
  function bindPreviewView() {
    $("#backToHistoryBtn").addEventListener("click", () => {
      showView("history-view");
      setActiveTabByView("history-view");
      renderHistory();
    });
    $("#exportPdfBtn").addEventListener("click", exportPdf);
    $("#exportImgBtn").addEventListener("click", exportImage);
    $("#shareBtn").addEventListener("click", shareReport);

    $("#previewReportBtn").addEventListener("click", onPreviewReport);
    $("#draftBackToSignBtn").addEventListener("click", () => {
      showView("sign-customer-view");
      requestAnimationFrame(() => resizeSignaturePad($("#customerSignaturePad"), customerPad));
    });
    $("#draftReturnToEditBtn").addEventListener("click", () => {
      const ok = confirm(
        "退回重新填写后，工程师和客户已经签署的内容需要重新签字才能生效，确定要退回吗？\n" +
        "Returning to edit will require both signatures to be redone. Continue?"
      );
      if (!ok) return;
      engineerPad.clear();
      customerPad.clear();
      showView("form-view");
      setActiveTabByView("form-view");
    });
  }

  function renderPreview(report) {
    $("#printRoot").innerHTML = renderReportDoc(report);
  }

  async function exportPdf() {
    const node = $("#printRoot .report-doc");
    if (!node) return;
    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgW = pageWidth;
    const imgH = (canvas.height * imgW) / canvas.width;
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageHeight;
    }
    pdf.save(`${currentPreviewId || "service-report"}.pdf`);
  }

  async function exportImage() {
    const node = $("#printRoot .report-doc");
    if (!node) return;
    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const link = document.createElement("a");
    link.download = `${currentPreviewId || "service-report"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function shareReport() {
    const node = $("#printRoot .report-doc");
    if (!node) return;
    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    canvas.toBlob(async (blob) => {
      const file = new File([blob], `${currentPreviewId || "service-report"}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "售后服务报告 Service Report" });
        } catch (e) { /* 用户取消 user cancelled */ }
      } else {
        alert("当前浏览器不支持系统分享，请使用导出按钮下载后手动分享 / Share API not supported here; please export and share manually.");
      }
    }, "image/png");
  }

  // ---------- 历史 History ----------
  async function renderHistory() {
    const list = await getAllReports();
    const wrap = $("#historyList");
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-state">暂无报告 No reports yet</div>';
      return;
    }
    wrap.innerHTML = "";
    const syncOn = window.ReportSync && ReportSync.syncEnabled();
    list.forEach((r) => {
      const c = getCompanyById(r.companyId);
      const div = document.createElement("div");
      div.className = "history-item";
      const syncBadge = syncOn
        ? (r.synced ? '<span class="sync-badge synced">☁ 已同步</span>' : '<span class="sync-badge pending">⏳ 待同步</span>')
        : "";
      div.innerHTML = `
        <div>
          <div class="hi-main">${escapeAttr(r.reportNo)} ${syncBadge}</div>
          <div class="hi-sub">${escapeAttr(r.customer || "")} · ${c ? escapeAttr(c.nameCn) : ""} · ${fmtDateTime(r.createdAt)}</div>
        </div>
        <button type="button" data-id="${r.id}">查看 View</button>
      `;
      wrap.appendChild(div);
    });
    wrap.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const r = await getReport(btn.dataset.id);
        if (!r) return;
        currentPreviewId = r.id;
        renderPreview(r);
        setPreviewMode("final");
        showView("preview-view");
      });
    });
  }

  // ---------- PWA Service Worker ----------
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
