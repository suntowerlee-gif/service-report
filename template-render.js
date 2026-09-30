// 将报告数据渲染为可打印/导出的HTML模板（紧凑版，尽量单页A4）
// Render report data object into a printable HTML template (compact, single-A4-page oriented)

function esc(s) {
  if (s === undefined || s === null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  return "¥" + v.toFixed(2);
}

function fmtDateTime(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return esc(v);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 时间节点区仅显示到日期，不显示具体时分（具体时分仅用于内部计算旅途/工时）
// Time-log section shows date only (hour:minute is still used internally for duration calc)
function fmtDateOnly(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return esc(v);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 手工留空位：有值显示值，没值也保留一个可手写的下划线空格
// Fill-in blank: has a value → plain text, no underline; empty → underline gap for handwriting only
function fillBlank(v) {
  if (v) return `<span class="fill-blank-filled">${esc(v)}</span>`;
  return `<span class="fill-blank-empty">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>`;
}

function checkMark(list, value) {
  return (list || []).includes(value) ? "checked" : "unchecked";
}

function renderReportDoc(r) {
  const c = getCompanyById(r.companyId) || {};
  const bank = c.bank || {};
  const partsRows = (r.parts || []).map((p) => `
    <tr>
      <td>${esc(p.name)}</td>
      <td>${esc(p.qty)}</td>
      <td>${fmtMoney(p.price)}</td>
      <td>${fmtMoney((Number(p.qty) || 0) * (Number(p.price) || 0))}</td>
    </tr>`).join("");

  const photosHtml = (r.photos || []).map((p) => `<img src="${p}" />`).join("");

  const serviceTypeChecks = ["Installation 安装", "Warranty 保内", "Beyond Warranty 保外", "Service Contract 服务合同", "Others 其它"]
    .map((v) => `<span class="${checkMark(r.serviceType, v)}">${v}</span>`).join("");

  const totalLine = r.byContract
    ? `按照合同约定付费 Pay as per contract`
    : `${fmtMoney(r.grandTotal)}（含税 incl. tax ${(r.taxRate * 100).toFixed(0)}%）`;

  return `
  <div class="report-doc">
    <div class="doc-top-row">
      ${c.logo ? `<img class="company-logo" src="${c.logo}" />` : `<span class="company-logo-placeholder"></span>`}
      <h1 class="doc-title">SERVICE REPORT 服务报告</h1>
    </div>

    <div class="doc-header">
      <div class="company-block">
        <strong>${esc(c.nameCn)}</strong><br/>
        ${esc(c.nameEn)}<br/>
        ${esc(c.addressCn)}<br/>
        邮编 Postal: ${esc(c.postalCode)} 电话 Tel: ${esc(c.phone)} 传真 Fax: ${esc(c.fax)}<br/>
        服务热线 Hotline: ${esc(c.hotline)}
      </div>
      <div class="meta-block">
        服务报告编号 Report No.: <strong>${esc(r.reportNo)}</strong><br/>
        Contract # 合同编号: ${fillBlank(r.contractNo)}<br/>
        Notification 派工号: ${fillBlank(r.notification)}<br/>
        Engineer 工程师: ${esc((r.engineers || []).join("、"))}
      </div>
    </div>

    <div class="two-col">
      <div class="col">
        <div class="section-title">客户信息 Customer Info</div>
        <div class="kv-stack">
          <div class="kv"><span class="k">Customer 用户</span><span class="v">${esc(r.customer)}</span></div>
          <div class="kv"><span class="k">Dept/Add. 地址</span><span class="v">${esc(r.deptAdd)}</span></div>
          <div class="kv"><span class="k">Operator 负责人</span><span class="v">${esc(r.operator)}</span></div>
          <div class="kv"><span class="k">Phone No. 电话</span><span class="v">${esc(r.mobile)}</span></div>
          <div class="kv"><span class="k">Email 邮箱</span><span class="v">${esc(r.email)}</span></div>
          <div class="kv"><span class="k">Province 省份</span><span class="v">${esc(r.province)}</span></div>
        </div>
      </div>
      <div class="col">
        <div class="section-title">仪器信息 Instrument Info</div>
        <div class="kv-stack">
          <div class="kv"><span class="k">Model 仪器型号</span><span class="v">${esc(r.model)}</span></div>
          <div class="kv"><span class="k">Serial No. 序号</span><span class="v">${esc(r.serialNo)}</span></div>
          <div class="kv"><span class="k">Computer 计算机</span><span class="v">${esc(r.computer)}</span></div>
          <div class="kv"><span class="k">Serv.Tag 服务号</span><span class="v">${esc(r.servTag)}</span></div>
          <div class="kv"><span class="k">Software 软件</span><span class="v">${esc(r.software)}</span></div>
          <div class="kv"><span class="k">Operator System 操作系统</span><span class="v">${esc(r.os)}</span></div>
        </div>
      </div>
    </div>

    <div class="section-title">服务类型 Service Type</div>
    <div class="checks">${serviceTypeChecks}</div>

    <div class="two-col two-col-timelog">
      <div class="col">
        <div class="section-title">问题与服务内容 Issue &amp; Action Taken</div>
        <div class="kv-stack">
          <div class="kv block"><span class="k">Issue or Problem 项目或问题</span><span class="v">${esc(r.issue)}</span></div>
          <div class="kv block grow"><span class="k">Action Taken 服务内容</span><span class="v">${esc(r.actionTaken)}</span></div>
          <div class="kv block"><span class="k">Results 结果</span><span class="v">${esc(r.results)}</span></div>
          <div class="kv block"><span class="k">Engineer's Advice 工程师建议</span><span class="v">${esc(r.engineerAdvice)}</span></div>
        </div>
      </div>
      <div class="col">
        <div class="section-title">时间节点 Time Log</div>
        <table class="compact-table">
          <tbody>
            <tr><td class="k">Order Received 接受任务</td><td class="v">${fmtDateOnly(r.orderReceivedDate)}</td></tr>
            <tr><td class="k">Start Travel 出发</td><td class="v">${fmtDateOnly(r.startTravelDate)}</td></tr>
            <tr><td class="k">On Site 到达现场</td><td class="v">${fmtDateOnly(r.onSiteDate)}</td></tr>
            <tr><td class="k">Travel Time 总旅途(h)</td><td class="v">${esc(r.travelTime)}</td></tr>
            <tr><td class="k">Work Start 工作开始</td><td class="v">${fmtDateOnly(r.workStart)}</td></tr>
            <tr><td class="k">Work End 工作结束</td><td class="v">${fmtDateOnly(r.workEnd)}</td></tr>
            <tr><td class="k">Total Working 总工时(h)</td><td class="v">${esc(r.totalWorkingHours)}</td></tr>
            <tr><td class="k">Support Hours 支持(h)</td><td class="v">${esc(r.totalSupportHours)}</td></tr>
            <tr><td class="k">Waiting Hours 等待(h)</td><td class="v">${esc(r.waitingHours)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-title">备件 Spare Parts</div>
    <table>
      <thead><tr><th>备件名称 Name</th><th>数量 Qty</th><th>单价 Price</th><th>总价 Total</th></tr></thead>
      <tbody>${partsRows || '<tr><td colspan="4">无 None</td></tr>'}</tbody>
    </table>
    <div class="parts-total-line">备件费合计 Parts Total: ${fmtMoney(r.partsFeeTotal)}</div>

    <div class="section-title">费用 Fees</div>
    <table>
      <tbody>
        <tr><td>工时费 Labor (${esc(r.laborHours)}h × ${fmtMoney(r.laborRate)})</td><td>${fmtMoney(r.laborFeeTotal)}</td></tr>
        <tr><td>上门费 Basic Price</td><td>${fmtMoney(r.basicPrice)}</td></tr>
        <tr><td>税率 Tax Rate</td><td>${(r.taxRate * 100).toFixed(0)}%</td></tr>
      </tbody>
    </table>
    <div class="total-line">总费用 Total to be billed: ${totalLine}</div>

    ${(r.photos || []).length ? `<div class="section-title">图片附件 Photo Attachments</div><div class="photos">${photosHtml}</div>` : ""}

    <div class="sign-block">
      <div class="sign-col">
        ${r.engineerSignature ? `<img src="${r.engineerSignature}" />` : '<div class="sign-blank"></div>'}
        <div class="sign-meta">SERVICE ENGINEER 工程师签字（${esc(r.signingEngineer || "")}）<br/>DATE: ${fmtDateTime(r.engineerSignedAt)}</div>
      </div>
      <div class="sign-col">
        ${r.customerSignature ? `<img src="${r.customerSignature}" />` : '<div class="sign-blank"></div>'}
        <div class="sign-meta">CUSTOMER SIGNATURE 客户签字<br/>DATE: ${fmtDateTime(r.customerSignedAt)}</div>
      </div>
    </div>

    <div class="bank-footer">
      <div>
        开户名称 Account Name: ${esc(bank.accountName)}<br/>
        开户行 Bank: ${esc(bank.bankName)}<br/>
        银行账号 Account No.: ${esc(bank.accountNo)}<br/>
        ${bank.bankCode ? "行号 Bank Code: " + esc(bank.bankCode) : ""}
      </div>
      <div>请您付款时在付款留言中注明服务编号 Please note the report No. when making payment:<br/><strong>${esc(r.reportNo)}</strong></div>
    </div>
  </div>`;
}
