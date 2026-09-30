// 报告编号规则：公司缩写 + 日期(YYYYMMDD) + 当日序号(2位) + 工程师姓名缩写
// Report number rule: CompanyAbbr + Date(YYYYMMDD) + DailySeq(2 digits) + Engineer initials
// 示例 / Example: STD2026091601YWX

function formatDateYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// primaryEngineerInitials: 用于编号的工程师缩写（取所选工程师中的第一位）
// initials of the engineer used in the number (first of the selected engineers)
async function generateReportNumber(companyId, primaryEngineerInitials, dateObj) {
  const d = dateObj || new Date();
  const dateStr = formatDateYYYYMMDD(d);
  const seq = await getNextSequence(companyId, dateStr);
  const seqStr = String(seq).padStart(2, "0");
  return `${companyId}${dateStr}${seqStr}${primaryEngineerInitials}`;
}
