// 静默同步到GitHub私有仓库（通过 cloudflare-worker/worker.js 中转）
// Silent sync to a private GitHub repo (relayed through cloudflare-worker/worker.js)
//
// 设计原则 / Design:
//  - 手机端不持有任何GitHub密钥，只知道一个中转服务的网址和一个普通口令。
//  - 签字生成报告后，若当前在线，后台静默尝试同步；不打断、不提示用户操作。
//  - 若离线或同步失败，报告仍完整保存在本机（IndexedDB），标记为“待同步”，
//    下次App启动或设备重新联网时自动重试，直到成功。
//  - 未配置 SYNC_CONFIG.endpoint 时，本模块所有操作直接静默跳过，不影响其余功能。
(function () {
  "use strict";

  function syncEnabled() {
    return !!(typeof SYNC_CONFIG !== "undefined" && SYNC_CONFIG.endpoint);
  }

  // 防止同一份报告被并发重复同步（例如短时间内多次触发online事件）
  // Guards against the same report being synced concurrently more than once
  // (e.g. multiple 'online' events firing in quick succession)
  const inFlight = new Set();

  function b64EncodeUnicode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  // 在屏幕外临时渲染报告并截图生成PDF（不影响用户当前正在看的界面）
  // Render the report off-screen to generate a PDF, without disturbing whatever the user is looking at
  async function captureReportToPdfBase64(report) {
    const hidden = document.createElement("div");
    hidden.style.position = "fixed";
    hidden.style.left = "-99999px";
    hidden.style.top = "0";
    hidden.innerHTML = renderReportDoc(report);
    document.body.appendChild(hidden);
    try {
      const node = hidden.querySelector(".report-doc");
      const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
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
      return pdf.output("datauristring").split(",")[1];
    } finally {
      document.body.removeChild(hidden);
    }
  }

  async function trySync(report) {
    if (!syncEnabled()) return false;
    if (!navigator.onLine) return false;
    if (report.synced) return true;
    if (inFlight.has(report.id)) return false;
    inFlight.add(report.id);
    try {
      const pdfBase64 = await captureReportToPdfBase64(report);
      const jsonBase64 = b64EncodeUnicode(JSON.stringify(report));
      const resp = await fetch(SYNC_CONFIG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Token": SYNC_CONFIG.appToken },
        body: JSON.stringify({
          reportNo: report.reportNo,
          files: [
            { path: `reports/${report.id}.json`, contentBase64: jsonBase64 },
            { path: `reports/${report.id}.pdf`, contentBase64: pdfBase64 }
          ]
        })
      });
      let data = null;
      try { data = await resp.json(); } catch (e) { /* ignore */ }
      if (resp.ok && data && data.ok) {
        report.synced = true;
        report.syncedAt = new Date().toISOString();
        await saveReport(report);
        return true;
      }
      return false;
    } catch (e) {
      // 静默失败：网络异常、Worker未部署等情况都不打扰用户，本地副本已保留
      // Silent failure: network issues, Worker not deployed yet, etc. Local copy is safe regardless.
      return false;
    } finally {
      inFlight.delete(report.id);
    }
  }

  async function retryPendingSync() {
    if (!syncEnabled() || !navigator.onLine) return;
    let list = [];
    try { list = await getAllReports(); } catch (e) { return; }
    for (const r of list) {
      if (!r.synced) {
        await trySync(r);
      }
    }
  }

  window.addEventListener("online", () => retryPendingSync());

  // 暴露给 app.js 使用 / expose for app.js
  window.ReportSync = { trySync, retryPendingSync, syncEnabled };
})();
