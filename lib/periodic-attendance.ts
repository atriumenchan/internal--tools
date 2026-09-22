import * as XLSX from "xlsx";
import { isIgnoredEmployee, normalizeEmpCode } from "@/lib/admin";
import type { CompanySettings, DayStatus, Employee, Holiday } from "@/lib/types";
import { summarizeDays, type ComputedDay } from "@/lib/attendance";
import { resolveHandbookStatus } from "@/lib/handbook-calendar";

export type PeriodicRecord = {
  department: string;
  empCode: string;
  name: string;
  /** YYYY-MM-DD */
  dateKey: string;
  /** DD/MM/YYYY as in the file */
  dateLabel: string;
  shift: string;
  inTime: string | null;
  lateIn: string | null;
  earlyOut: string | null;
  outTime: string | null;
  workOT: string | null;
  overTime: string | null;
  status: string;
  remark: string;
};

export type PeriodicReport = {
  company: string;
  period: string;
  startDate: string;
  endDate: string;
  records: PeriodicRecord[];
};

function cellStr(row: unknown[], idx: number): string {
  const v = row[idx];
  return v === undefined || v === null ? "" : String(v).trim();
}

function timeToHHMM(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const totalMinutes = Math.round(v * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = ((totalMinutes % 60) + 60) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const text = v.trim();
    if (!text || text === "--:--" || text === "-" || text === "00:00") return text === "00:00" ? "00:00" : null;
    const m = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if (!m) return null;
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  return null;
}

function durationHours(hhmm: string | null): number {
  if (!hhmm) return 0;
  const m = /^(\d{1,3}):(\d{2})$/.exec(hhmm);
  if (!m) return 0;
  return Math.round((Number(m[1]) + Number(m[2]) / 60) * 100) / 100;
}

function excelSerialToKey(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

function parseDateCell(v: unknown): { key: string; label: string } | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const key = `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
    const label = `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`;
    return { key, label };
  }
  if (typeof v === "number") {
    const key = excelSerialToKey(v);
    if (!key) return null;
    const [y, m, d] = key.split("-");
    return { key, label: `${d}/${m}/${y}` };
  }
  const text = String(v ?? "").trim();
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3];
    return { key: `${year}-${month}-${day}`, label: `${day}/${month}/${year}` };
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return { key: `${iso[1]}-${iso[2]}-${iso[3]}`, label: `${iso[3]}/${iso[2]}/${iso[1]}` };
  }
  return null;
}

function mapStatus(token: string): DayStatus {
  const t = token.trim().toUpperCase();
  if (["P", "PR", "PRESENT", "OD"].includes(t)) return "present";
  if (["A", "AB", "ABSENT"].includes(t)) return "absent";
  if (["WO", "W/O", "OFF"].includes(t)) return "week_off";
  if (["HL", "HO", "H", "HOLIDAY"].includes(t)) return "holiday";
  if (["LV", "L", "CL", "SL", "EL", "PL", "LWP", "LEAVE"].includes(t)) return "leave";
  if (["HD", "1/2", "HALF"].includes(t)) return "half_day";
  return "unmatched";
}

export function isPeriodicDatewise(matrix: unknown[][]): boolean {
  const title = String(matrix[0]?.[0] ?? "").toLowerCase();
  if (title.includes("periodic")) return true;
  const period = String(matrix[0]?.[6] ?? "");
  const labels = matrix.slice(0, 12).map((row) => String(row?.[0] ?? "").trim().toLowerCase());
  return / to /i.test(period) && labels.includes("empcode") && labels.some((label) => label.startsWith("date"));
}

export function parsePeriodicExport(buffer: ArrayBuffer): PeriodicReport {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

  const period = cellStr(rows[0] ?? [], 6);
  const company = cellStr(rows[1] ?? [], 0) || "ADMEXO";
  const records: PeriodicRecord[] = [];
  let currentDept = "";
  let currentEmp: { empCode: string; name: string } | null = null;

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const c0 = cellStr(row, 0);

    if (c0 === "Dept. Name") {
      currentDept = cellStr(row, 2);
      continue;
    }
    if (c0 === "Empcode") {
      currentEmp = { empCode: cellStr(row, 1), name: cellStr(row, 4) };
      continue;
    }
    if (!c0 || c0.toLowerCase().startsWith("date")) continue;
    if (!currentEmp) continue;
    if (isIgnoredEmployee(currentEmp.empCode, currentEmp.name)) continue;

    const parsedDate = parseDateCell(row[0]);
    if (!parsedDate) continue;

    records.push({
      department: currentDept,
      empCode: currentEmp.empCode,
      name: currentEmp.name,
      dateKey: parsedDate.key,
      dateLabel: parsedDate.label,
      shift: cellStr(row, 1),
      inTime: timeToHHMM(row[2]),
      lateIn: timeToHHMM(row[3]),
      earlyOut: timeToHHMM(row[4]),
      outTime: timeToHHMM(row[5]),
      workOT: timeToHHMM(row[6]),
      overTime: timeToHHMM(row[7]),
      status: cellStr(row, 8),
      remark: cellStr(row, 9),
    });
  }

  if (!records.length) throw new Error("No daily rows found in this periodic attendance file.");

  const keys = records.map((row) => row.dateKey).sort();
  return {
    company,
    period,
    startDate: keys[0],
    endDate: keys[keys.length - 1],
    records,
  };
}

function codesMatch(a: string | null | undefined, b: string | null | undefined) {
  return normalizeEmpCode(a) === normalizeEmpCode(b);
}

function combine(dateKey: string, hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h || 0, min || 0, 0).toISOString();
}

export function periodicToAttendance(
  report: PeriodicReport,
  employees: Employee[],
  settings: CompanySettings,
  holidays: Holiday[] = []
) {
  const days: ComputedDay[] = [];

  for (const row of report.records) {
    if (isIgnoredEmployee(row.empCode, row.name)) continue;
    const employee =
      employees.find((e) => codesMatch(e.employee_code, row.empCode)) ||
      employees.find((e) => (e.full_name || "").trim().toLowerCase() === row.name.trim().toLowerCase()) ||
      null;

    const fileStatus = mapStatus(row.status);
    const workHours = durationHours(row.workOT);
    const otHours = durationHours(row.overTime);
    const resolved = resolveHandbookStatus({
      dateKey: row.dateKey,
      fileStatus,
      hasWork: Boolean(row.inTime || row.outTime || workHours > 0),
      extraOffs: settings.weekly_offs,
      extraHolidays: holidays,
    });

    const punchIn = row.inTime
      ? new Date(
          Number(row.dateKey.slice(0, 4)),
          Number(row.dateKey.slice(5, 7)) - 1,
          Number(row.dateKey.slice(8, 10)),
          Number(row.inTime.slice(0, 2)),
          Number(row.inTime.slice(3, 5))
        )
      : null;
    const start = new Date(Number(row.dateKey.slice(0, 4)), Number(row.dateKey.slice(5, 7)) - 1, Number(row.dateKey.slice(8, 10)));
    const [sh, sm] = String(settings?.work_start || "10:00").split(":").map(Number);
    start.setHours(sh || 10, sm || 0, 0, 0);
    const grace = new Date(start.getTime() + (settings.late_grace_minutes || 0) * 60_000);
    const isLate = Boolean(punchIn && resolved.status === "present" && punchIn.getTime() > grace.getTime());

    days.push({
      employee_code: employee?.employee_code ?? row.empCode,
      employee_name: employee?.full_name ?? row.name,
      employee_id: employee?.id ?? null,
      work_date: row.dateKey,
      punch_in: combine(row.dateKey, row.inTime),
      punch_out: combine(row.dateKey, row.outTime),
      hours_worked: Math.round((workHours + otHours) * 100) / 100,
      is_late: isLate,
      late_by_minutes: isLate && punchIn ? Math.round((punchIn.getTime() - start.getTime()) / 60000) : 0,
      status: resolved.status,
      source_note: [row.department, row.status ? `Status ${row.status}` : "", row.remark && row.remark !== "--" ? row.remark : ""]
        .filter(Boolean)
        .join(" · ") || null,
    });
  }

  const start = new Date(`${report.startDate}T00:00:00`);
  return {
    days,
    summaries: summarizeDays(days, start.getMonth() + 1, start.getFullYear(), settings),
    startDate: report.startDate,
    endDate: report.endDate,
  };
}

export function countWeekdays(startISO: string, endISO: string) {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) count += 1;
  }
  return count;
}

export function rangeLabel(startISO: string, endISO: string) {
  const fmt = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  if (startISO === endISO) return fmt(startISO);
  return `${fmt(startISO)} – ${fmt(endISO)}`;
}
