import type { CompanySettings, DayStatus, Employee, Holiday } from "@/lib/types";
import { summarizeDays, type ComputedDay } from "@/lib/attendance";
import { isIgnoredEmployee } from "@/lib/admin";
import { kolkataTodayKey } from "@/lib/datetime";
import { resolveHandbookStatus } from "@/lib/handbook-calendar";

export type MonthPerformanceReport = {
  company: string;
  month: number;
  year: number;
  people: MonthPerformancePerson[];
};

export type MonthPerformancePerson = {
  employee_code: string;
  employee_name: string;
  department: string;
  present: number;
  week_offs: number;
  holidays: number;
  leave_days: number;
  absent: number;
  total_hours: number;
  overtime_hours: number;
  days: Array<{
    day: number;
    weekday: string;
    inTime: string | null;
    outTime: string | null;
    workHours: number;
    breakHours: number;
    otHours: number;
    status: DayStatus;
    rawStatus: string;
  }>;
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function valueAfter(row: string[], label: string): string {
  const target = label.toLowerCase();
  const i = row.findIndex((c) => c.toLowerCase() === target);
  if (i < 0) return "";
  for (let j = i + 1; j < row.length; j++) {
    if (row[j]) return row[j];
  }
  return "";
}

function parseDuration(value: string): number {
  const text = value.trim();
  if (!text || text === "--:--" || text === "-" || text === "00:00" || text === "0:00") return 0;
  const m = /^(\d{1,3}):(\d{2})$/.exec(text);
  if (!m) return 0;
  return Math.round((Number(m[1]) + Number(m[2]) / 60) * 100) / 100;
}

function parseClock(value: string): string | null {
  const text = value.trim();
  if (!text || text === "--:--" || text === "-") return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function parseMonthLabel(value: string): { month: number; year: number } | null {
  const text = value.trim();
  const named = /^([A-Za-z]+)\s*[-/]\s*(\d{4})$/.exec(text);
  if (named) {
    const month = MONTH_NAMES[named[1].toLowerCase()];
    if (month) return { month, year: Number(named[2]) };
  }
  const numeric = /^(\d{1,2})\s*[-/]\s*(\d{4})$/.exec(text);
  if (numeric) return { month: Number(numeric[1]), year: Number(numeric[2]) };
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

function rowLabel(row: string[]): string {
  return (row[0] || "").toLowerCase();
}

export function isMonthPerformanceGrid(matrix: string[][]): boolean {
  const labels = matrix.slice(0, 25).map((r) => rowLabel(r));
  return labels.includes("empcode") && labels.includes("in") && labels.includes("status");
}

export function parseMonthPerformanceMatrix(matrix: string[][]): MonthPerformanceReport {
  let company = "";
  let period = { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
  const people: MonthPerformancePerson[] = [];

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    if (rowLabel(row) === "dept. name" || row[0] === "Dept. Name") {
      company = valueAfter(row, "CompName") || company;
      const monthLabel = valueAfter(row, "Report Month");
      const parsed = parseMonthLabel(monthLabel);
      if (parsed) period = parsed;
    }

    if (rowLabel(row) !== "empcode") continue;

    const header = row;
    const daysRow = matrix[i + 1] ?? [];
    const weekRow = matrix[i + 2] ?? [];
    const inRow = matrix[i + 3] ?? [];
    const outRow = matrix[i + 4] ?? [];
    const workRow = matrix[i + 5] ?? [];
    const breakRow = matrix[i + 6] ?? [];
    const otRow = matrix[i + 7] ?? [];
    const statusRow = matrix[i + 8] ?? [];

    if (rowLabel(inRow) !== "in" || rowLabel(statusRow) !== "status") continue;

    const dim = new Date(period.year, period.month, 0).getDate();
    const days: MonthPerformancePerson["days"] = [];
    for (let c = 1; c < daysRow.length; c++) {
      const dayNum = Number(daysRow[c]);
      if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > dim) continue;
      const rawStatus = statusRow[c] || "";
      days.push({
        day: dayNum,
        weekday: weekRow[c] || "",
        inTime: parseClock(inRow[c] || ""),
        outTime: parseClock(outRow[c] || ""),
        workHours: parseDuration(workRow[c] || ""),
        breakHours: parseDuration(breakRow[c] || ""),
        otHours: parseDuration(otRow[c] || ""),
        status: mapStatus(rawStatus),
        rawStatus,
      });
    }

    const employee_code = valueAfter(header, "Empcode");
    const employee_name = valueAfter(header, "Name");
    if (isIgnoredEmployee(employee_code, employee_name)) {
      i += 8;
      continue;
    }

    people.push({
      employee_code,
      employee_name,
      department: valueAfter(matrix[i - 1] ?? [], "Dept. Name"),
      present: Number(valueAfter(header, "Present") || 0),
      week_offs: Number(valueAfter(header, "WO") || 0),
      holidays: Number(valueAfter(header, "HL") || 0),
      leave_days: Number(valueAfter(header, "LV") || 0),
      absent: Number(valueAfter(header, "Absent") || 0),
      total_hours: parseDuration(valueAfter(header, "Tot. Work+OT")),
      overtime_hours: parseDuration(valueAfter(header, "Total OT")),
      days,
    });
    i += 8;
  }

  if (!people.length) throw new Error("No employees found in this month-performance file.");
  return { company, month: period.month, year: period.year, people };
}

function codesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = (a || "").trim();
  const right = (b || "").trim();
  const na = left.replace(/^0+/, "") || "0";
  const nb = right.replace(/^0+/, "") || "0";
  return left.toLowerCase() === right.toLowerCase() || na === nb;
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function combine(year: number, month: number, day: number, hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(year, month - 1, day, h || 0, m || 0, 0).toISOString();
}

export function monthPerformanceToAttendance(
  report: MonthPerformanceReport,
  employees: Employee[],
  settings: CompanySettings,
  holidays: Holiday[] = []
) {
  const days: ComputedDay[] = [];
  const todayKey = kolkataTodayKey();

  for (const person of report.people) {
    if (isIgnoredEmployee(person.employee_code, person.employee_name)) continue;
    const employee =
      employees.find((e) => codesMatch(e.employee_code, person.employee_code)) ||
      employees.find(
        (e) => (e.full_name || "").trim().toLowerCase() === (person.employee_name || "").trim().toLowerCase()
      ) ||
      null;

    for (const day of person.days) {
      const dateKey = ymd(report.year, report.month, day.day);
      if (dateKey > todayKey) continue;

      const workDate = new Date(report.year, report.month - 1, day.day);
      const start = new Date(workDate);
      const [sh, sm] = String(settings?.work_start || "10:00").split(":").map(Number);
      start.setHours(sh || 10, sm || 0, 0, 0);
      const grace = new Date(start.getTime() + (settings.late_grace_minutes || 0) * 60_000);
      const punchIn = day.inTime
        ? new Date(report.year, report.month - 1, day.day, Number(day.inTime.slice(0, 2)), Number(day.inTime.slice(3, 5)))
        : null;
      const resolved = resolveHandbookStatus({
        dateKey,
        fileStatus: day.status,
        hasWork: Boolean(day.inTime || day.outTime || day.workHours > 0),
        extraOffs: settings.weekly_offs,
        extraHolidays: holidays,
      });
      const isLate = Boolean(
        punchIn && resolved.status === "present" && punchIn.getTime() > grace.getTime()
      );

      const notes = [
        resolved.holidayName ? `Holiday: ${resolved.holidayName}` : "",
        day.rawStatus ? `Status ${day.rawStatus}` : "",
        day.breakHours ? `Break ${day.breakHours}h` : "",
        person.department ? person.department : "",
      ]
        .filter(Boolean)
        .join(" · ");

      days.push({
        employee_code: employee?.employee_code ?? person.employee_code,
        employee_name: employee?.full_name ?? person.employee_name,
        employee_id: employee?.id ?? null,
        work_date: dateKey,
        punch_in: combine(report.year, report.month, day.day, day.inTime),
        punch_out: combine(report.year, report.month, day.day, day.outTime),
        hours_worked: Math.round((day.workHours + day.otHours) * 100) / 100,
        is_late: isLate,
        late_by_minutes: isLate && punchIn ? Math.round((punchIn.getTime() - start.getTime()) / 60000) : 0,
        status: resolved.status,
        source_note: notes || null,
      });
    }
  }

  return { days, summaries: summarizeDays(days, report.month, report.year, settings) };
}
