import ExcelJS from "exceljs";
import { normalizeEmpCode } from "@/lib/admin";
import { countWeekdays, type PeriodicRecord, type PeriodicReport } from "@/lib/periodic-attendance";

const FONT_NAME = "Arial";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { name: FONT_NAME, bold: true, color: { argb: "FFFFFFFF" } };
const SUBHEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
const SUBHEADER_FONT: Partial<ExcelJS.Font> = { name: FONT_NAME, bold: true, color: { argb: "FF1F4E78" } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB7B7B7" } },
  bottom: { style: "thin", color: { argb: "FFB7B7B7" } },
  left: { style: "thin", color: { argb: "FFB7B7B7" } },
  right: { style: "thin", color: { argb: "FFB7B7B7" } },
};
const TIME_FMT = "hh:mm";
const DUR_FMT = "[h]:mm";

function hhmmToFraction(s: string | null): number | null {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h * 60 + m) / (24 * 60);
}

function dayAbbrev(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(y, m - 1, d).getDay()];
}

function styleHeaderRow(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center", wrapText: true };
  }
}

type EmpGroup = {
  empCode: string;
  name: string;
  departments: string[];
  records: PeriodicRecord[];
};

function groupByEmpCode(records: PeriodicRecord[]): EmpGroup[] {
  const map = new Map<string, EmpGroup>();
  const order: string[] = [];
  for (const row of records) {
    const key = normalizeEmpCode(row.empCode);
    if (!map.has(key)) {
      map.set(key, { empCode: row.empCode, name: row.name, departments: [], records: [] });
      order.push(key);
    }
    const group = map.get(key)!;
    if (row.name && group.name !== row.name) group.name = row.name;
    if (row.department && !group.departments.includes(row.department)) group.departments.push(row.department);
    group.records.push(row);
  }
  return order.map((key) => map.get(key)!);
}

const col = (n: number) => String.fromCharCode(64 + n);
const rangeRef = (colIdx: number, lastRow: number) => `'Raw Data'!$${col(colIdx)}$2:$${col(colIdx)}$${lastRow}`;

export async function buildPeriodicWorkbook(report: PeriodicReport, weekLabel: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const groups = groupByEmpCode(report.records);
  const wd = Math.max(1, countWeekdays(report.startDate, report.endDate));
  const expectedHoursFormula = `${wd}*TIME(8,30,0)`;

  const raw = wb.addWorksheet("Raw Data");
  const headers = [
    "Department",
    "Emp Code",
    "Employee Name",
    "Date",
    "Shift",
    "In Time",
    "Late In",
    "Early Out",
    "Out Time",
    "Work+OT",
    "Over Time",
    "Status",
    "Remark",
    "EmpDateKey",
  ];
  raw.addRow(headers);
  styleHeaderRow(raw, 1, headers.length);

  report.records.forEach((r, i) => {
    const rowNum = i + 2;
    const row = raw.getRow(rowNum);
    row.getCell(1).value = r.department;
    row.getCell(2).value = r.empCode;
    row.getCell(3).value = r.name;
    row.getCell(4).value = r.dateLabel;
    row.getCell(5).value = r.shift;
    row.getCell(6).value = hhmmToFraction(r.inTime);
    row.getCell(6).numFmt = TIME_FMT;
    row.getCell(7).value = hhmmToFraction(r.lateIn) ?? 0;
    row.getCell(7).numFmt = DUR_FMT;
    row.getCell(8).value = hhmmToFraction(r.earlyOut) ?? 0;
    row.getCell(8).numFmt = DUR_FMT;
    row.getCell(9).value = hhmmToFraction(r.outTime);
    row.getCell(9).numFmt = TIME_FMT;
    row.getCell(10).value = hhmmToFraction(r.workOT) ?? 0;
    row.getCell(10).numFmt = DUR_FMT;
    row.getCell(11).value = hhmmToFraction(r.overTime) ?? 0;
    row.getCell(11).numFmt = DUR_FMT;
    row.getCell(12).value = r.status;
    row.getCell(13).value = r.remark;
    row.getCell(14).value = { formula: `B${rowNum}&"|"&D${rowNum}` };
  });
  raw.columns = [16, 12, 18, 12, 7, 9, 9, 9, 9, 10, 10, 8, 12, 22].map((w) => ({ width: w }));
  raw.views = [{ state: "frozen", ySplit: 1 }];
  const lastRow = report.records.length + 1;
  const CODE_R = rangeRef(2, lastRow);
  const STATUS_R = rangeRef(12, lastRow);
  const INTIME_R = rangeRef(6, lastRow);
  const LATEIN_R = rangeRef(7, lastRow);
  const ERLOUT_R = rangeRef(8, lastRow);
  const OUTTIME_R = rangeRef(9, lastRow);
  const WORK_R = rangeRef(10, lastRow);

  const summ = wb.addWorksheet("Weekly Summary");
  summ.mergeCells("A1:K1");
  summ.getCell("A1").value = `${report.company} — Attendance summary (${weekLabel})`;
  summ.getCell("A1").font = { name: FONT_NAME, bold: true, size: 14 };
  summ.getCell("A1").alignment = { horizontal: "center" };
  summ.addRow([]);
  summ.addRow([
    "Department",
    "Emp Code",
    "Employee Name",
    "Total Working Hours",
    "Expected Hours (8:30 x N)",
    "Difference (Actual vs Expected)",
    "Total Present Days",
    "Total Leaves (Absent)",
    "Avg Working Hours/Day",
    "Avg In Time",
    "Avg Out Time",
  ]);
  styleHeaderRow(summ, 3, 11);

  const dataStart = 4;
  groups.forEach((g, i) => {
    const r = dataStart + i;
    const codeRef = `B${r}`;
    summ.getCell(r, 1).value = g.departments.join(", ");
    summ.getCell(r, 2).value = g.empCode;
    summ.getCell(r, 3).value = g.name;
    summ.getCell(r, 4).value = { formula: `SUMIF(${CODE_R},${codeRef},${WORK_R})` };
    summ.getCell(r, 4).numFmt = DUR_FMT;
    summ.getCell(r, 5).value = { formula: expectedHoursFormula };
    summ.getCell(r, 5).numFmt = DUR_FMT;
    summ.getCell(r, 6).value = {
      formula: `IF(D${r}>=E${r},TEXT(D${r}-E${r},"[h]:mm")&" over",TEXT(E${r}-D${r},"[h]:mm")&" short")`,
    };
    summ.getCell(r, 7).value = { formula: `COUNTIFS(${CODE_R},${codeRef},${STATUS_R},"P")` };
    summ.getCell(r, 8).value = { formula: `COUNTIFS(${CODE_R},${codeRef},${STATUS_R},"A")` };
    summ.getCell(r, 9).value = { formula: `IFERROR(D${r}/G${r},0)` };
    summ.getCell(r, 9).numFmt = DUR_FMT;
    summ.getCell(r, 10).value = { formula: `IFERROR(AVERAGEIFS(${INTIME_R},${CODE_R},${codeRef},${STATUS_R},"P"),0)` };
    summ.getCell(r, 10).numFmt = TIME_FMT;
    summ.getCell(r, 11).value = { formula: `IFERROR(AVERAGEIFS(${OUTTIME_R},${CODE_R},${codeRef},${STATUS_R},"P"),0)` };
    summ.getCell(r, 11).numFmt = TIME_FMT;
    for (let c = 1; c <= 11; c++) summ.getCell(r, c).border = THIN_BORDER;
  });
  summ.columns = [16, 12, 18, 18, 18, 22, 14, 18, 18, 12, 12].map((w) => ({ width: w }));
  summ.views = [{ state: "frozen", ySplit: 3 }];

  const perf = wb.addWorksheet("Individual Performance");
  perf.columns = [14, 12, 8, 9, 9, 9, 9, 10, 16].map((w) => ({ width: w }));
  perf.mergeCells("A1:I1");
  perf.getCell("A1").value = `${report.company} — Individual attendance (${weekLabel})`;
  perf.getCell("A1").font = { name: FONT_NAME, bold: true, size: 14 };
  perf.getCell("A1").alignment = { horizontal: "center" };

  let r = 3;
  const dayHeaders = ["Date", "Day", "Shift", "In Time", "Out Time", "Work Hours", "Late In", "Early Out", "Status / Remark"];
  for (const g of groups) {
    perf.mergeCells(`A${r}:I${r}`);
    perf.getCell(r, 1).value = `${g.name}   |   Emp Code: ${g.empCode}   |   Dept: ${g.departments.join(", ") || "—"}`;
    perf.getCell(r, 1).font = { name: FONT_NAME, bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    perf.getCell(r, 1).fill = HEADER_FILL;
    r += 1;
    dayHeaders.forEach((h, i) => {
      const cell = perf.getCell(r, i + 1);
      cell.value = h;
      cell.font = SUBHEADER_FONT;
      cell.fill = SUBHEADER_FILL;
      cell.alignment = { horizontal: "center" };
      cell.border = THIN_BORDER;
    });
    r += 1;
    const sorted = [...g.records].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    for (const rec of sorted) {
      const key = `"${rec.empCode}|${rec.dateLabel}"`;
      const lookup = (colIdx: number) => `INDEX(${rangeRef(colIdx, lastRow)},MATCH(${key},${rangeRef(14, lastRow)},0))`;
      perf.getCell(r, 1).value = rec.dateLabel;
      perf.getCell(r, 2).value = dayAbbrev(rec.dateKey);
      perf.getCell(r, 3).value = { formula: `IFERROR(${lookup(5)},"")` };
      perf.getCell(r, 4).value = { formula: `IFERROR(${lookup(6)},"")` };
      perf.getCell(r, 4).numFmt = TIME_FMT;
      perf.getCell(r, 5).value = { formula: `IFERROR(${lookup(9)},"")` };
      perf.getCell(r, 5).numFmt = TIME_FMT;
      perf.getCell(r, 6).value = { formula: `IFERROR(${lookup(10)},"")` };
      perf.getCell(r, 6).numFmt = DUR_FMT;
      perf.getCell(r, 7).value = { formula: `IFERROR(${lookup(7)},"")` };
      perf.getCell(r, 7).numFmt = DUR_FMT;
      perf.getCell(r, 8).value = { formula: `IFERROR(${lookup(8)},"")` };
      perf.getCell(r, 8).numFmt = DUR_FMT;
      perf.getCell(r, 9).value = { formula: `IFERROR(${lookup(12)}&" / "&${lookup(13)},"")` };
      for (let c = 1; c <= 9; c++) {
        perf.getCell(r, c).alignment = { horizontal: "center" };
        perf.getCell(r, c).border = THIN_BORDER;
      }
      r += 1;
    }
    const codeRef = `"${g.empCode}"`;
    const totalHoursRow = r;
    perf.getCell(r, 1).value = "Total Working Hours";
    perf.getCell(r, 1).font = { name: FONT_NAME, bold: true };
    perf.getCell(r, 2).value = { formula: `SUMIF(${CODE_R},${codeRef},${WORK_R})` };
    perf.getCell(r, 2).numFmt = DUR_FMT;
    r += 1;
    const expectedRow = r;
    perf.getCell(r, 1).value = `Expected Hours (8:30 × ${wd} weekdays)`;
    perf.getCell(r, 1).font = { name: FONT_NAME, bold: true };
    perf.getCell(r, 2).value = { formula: expectedHoursFormula };
    perf.getCell(r, 2).numFmt = DUR_FMT;
    r += 1;
    perf.getCell(r, 1).value = "Difference";
    perf.getCell(r, 1).font = { name: FONT_NAME, bold: true };
    perf.getCell(r, 2).value = {
      formula: `IF(B${totalHoursRow}>=B${expectedRow},TEXT(B${totalHoursRow}-B${expectedRow},"[h]:mm")&" over",TEXT(B${expectedRow}-B${totalHoursRow},"[h]:mm")&" short")`,
    };
    r += 2;
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
