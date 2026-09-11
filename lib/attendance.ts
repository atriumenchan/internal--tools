import { format, getDay, getDaysInMonth } from "date-fns";
import type { CompanySettings, DayStatus, Employee, Holiday } from "@/lib/types";
import type { RawDayRow, RawPunch } from "@/lib/excel";
import { isIgnoredEmployee } from "@/lib/admin";

export type ComputedDay = {
  employee_code: string | null;
  employee_name: string;
  employee_id: string | null;
  work_date: string;
  punch_in: string | null;
  punch_out: string | null;
  hours_worked: number;
  is_late: boolean;
  late_by_minutes: number;
  status: DayStatus;
  source_note: string | null;
};

export type ComputedSummary = {
  employee_id: string | null;
  employee_code: string | null;
  employee_name: string;
  period_month: number;
  period_year: number;
  working_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  half_days: number;
  week_offs: number;
  holidays: number;
  late_days: number;
  total_hours: number;
  overtime_hours: number;
};

function ymd(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function parseTimeOnDate(workDate: Date, timeHms: string) {
  const [h, m] = timeHms.split(":").map(Number);
  return new Date(workDate.getFullYear(), workDate.getMonth(), workDate.getDate(), h || 0, m || 0, 0);
}

function classifyStatusToken(value?: string): DayStatus | null {
  if (!value) return null;
  const t = value.trim().toLowerCase();
  if (["leave", "cl", "sl", "el", "pl", "lwp", "on leave"].includes(t)) return "leave";
  if (["wo", "week off", "weekly off", "off", "w/o"].includes(t)) return "week_off";
  if (["ho", "holiday", "h"].includes(t)) return "holiday";
  if (["ab", "absent", "a"].includes(t)) return "absent";
  if (["hd", "half day", "half"].includes(t)) return "half_day";
  if (["p", "present", "pr"].includes(t)) return "present";
  return null;
}

function matchEmployee(code: string, name: string, employees: Employee[]) {
  const codeNorm = code.trim().toLowerCase();
  const nameNorm = name.trim().toLowerCase();
  if (codeNorm) {
    const byCode = employees.find((e) => e.employee_code.trim().toLowerCase() === codeNorm);
    if (byCode) return byCode;
  }
  return employees.find((e) => e.full_name.trim().toLowerCase() === nameNorm) ?? null;
}

function hoursBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 36e5) * 100) / 100;
}

function dayFromPunches(
  name: string,
  code: string,
  dateKey: string,
  punches: Date[],
  token: string | undefined,
  settings: CompanySettings,
  employee: Employee | null,
  holidayName?: string
): ComputedDay {
  const workDate = new Date(`${dateKey}T00:00:00`);
  const weekday = getDay(workDate);
  const isOff = settings.weekly_offs.includes(weekday);
  punches.sort((a, b) => a.getTime() - b.getTime());
  const first = punches[0] ?? null;
  const last = punches.length > 1 ? punches[punches.length - 1] : null;
  const hours = first && last ? hoursBetween(first, last) : 0;
  const marked = classifyStatusToken(token);

  let status: DayStatus = "absent";
  if (holidayName) status = "holiday";
  else if (isOff) status = "week_off";
  else if (marked) status = marked;
  else if (hours > 0 && hours < settings.half_day_hours) status = "half_day";
  else if (hours > 0) status = "present";
  else status = isOff ? "week_off" : "absent";

  const start = parseTimeOnDate(workDate, settings.work_start);
  const grace = new Date(start.getTime() + settings.late_grace_minutes * 60_000);
  const isLate = Boolean(first && !isOff && !holidayName && status !== "leave" && first > grace);
  const lateBy = isLate && first ? Math.round((first.getTime() - start.getTime()) / 60000) : 0;

  return {
    employee_code: employee?.employee_code ?? (code || null),
    employee_name: employee?.full_name ?? name,
    employee_id: employee?.id ?? null,
    work_date: dateKey,
    punch_in: first ? first.toISOString() : null,
    punch_out: last ? last.toISOString() : null,
    hours_worked: hours,
    is_late: isLate,
    late_by_minutes: lateBy,
    status,
    source_note: holidayName ? `Holiday: ${holidayName}` : token || null,
  };
}

export function computeAttendance(options: {
  month: number;
  year: number;
  settings: CompanySettings;
  employees: Employee[];
  holidays: Holiday[];
  punches?: RawPunch[];
  daily?: RawDayRow[];
}) {
  const { month, year, settings, employees, holidays } = options;
  const holidayMap = new Map(holidays.map((h) => [h.holiday_date, h.name]));
  const grouped = new Map<
    string,
    { name: string; code: string; dates: Map<string, { punches: Date[]; token?: string }> }
  >();

  const ensure = (name: string, code: string) => {
    const key = `${code.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
    if (!grouped.has(key)) {
      grouped.set(key, { name, code, dates: new Map() });
    }
    return grouped.get(key)!;
  };

  for (const punch of options.punches ?? []) {
    const person = ensure(punch.employee_name, punch.employee_code);
    const dateKey = ymd(punch.at);
    if (!person.dates.has(dateKey)) person.dates.set(dateKey, { punches: [], token: punch.status });
    const bucket = person.dates.get(dateKey)!;
    bucket.punches.push(punch.at);
    if (punch.status) bucket.token = punch.status;
  }

  for (const row of options.daily ?? []) {
    const person = ensure(row.employee_name, row.employee_code);
    const dateKey = ymd(row.date);
    if (!person.dates.has(dateKey)) person.dates.set(dateKey, { punches: [], token: row.status });
    const bucket = person.dates.get(dateKey)!;
    if (row.punch_in) bucket.punches.push(row.punch_in);
    if (row.punch_out) bucket.punches.push(row.punch_out);
    if (row.status) bucket.token = row.status;
  }

  const days: ComputedDay[] = [];

  grouped.forEach((person) => {
    if (isIgnoredEmployee(person.code, person.name)) return;
    const employee = matchEmployee(person.code, person.name, employees);
    const dim = getDaysInMonth(new Date(year, month - 1, 1));
    for (let d = 1; d <= dim; d++) {
      const date = new Date(year, month - 1, d);
      const dateKey = ymd(date);
      const bucket = person.dates.get(dateKey);
      days.push(
        dayFromPunches(
          person.name,
          person.code,
          dateKey,
          bucket?.punches ?? [],
          bucket?.token,
          settings,
          employee,
          holidayMap.get(dateKey)
        )
      );
    }
  });

  const summaries = summarizeDays(days, month, year, settings);
  return { days, summaries };
}

export function summarizeDays(
  days: ComputedDay[],
  month: number,
  year: number,
  settings: CompanySettings
): ComputedSummary[] {
  const byPerson = new Map<string, ComputedDay[]>();
  for (const day of days) {
    const key = `${(day.employee_code ?? "").toLowerCase()}::${day.employee_name.toLowerCase()}`;
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key)!.push(day);
  }

  const summaries: ComputedSummary[] = [];
  byPerson.forEach((personDays) => {
    const first = personDays[0];
    let present = 0;
    let absent = 0;
    let leave = 0;
    let half = 0;
    let weekOffs = 0;
    let holidayCount = 0;
    let late = 0;
    let hours = 0;
    let working = 0;
    let overtime = 0;

    for (const day of personDays) {
      hours += day.hours_worked;
      if (day.is_late) late += 1;
      if (day.status === "present") {
        present += 1;
        working += 1;
        overtime += Math.max(0, day.hours_worked - settings.expected_hours);
      } else if (day.status === "half_day") {
        half += 1;
        present += 0.5;
        absent += 0.5;
        working += 1;
      } else if (day.status === "absent") {
        absent += 1;
        working += 1;
      } else if (day.status === "leave") {
        leave += 1;
        working += 1;
      } else if (day.status === "week_off") {
        weekOffs += 1;
      } else if (day.status === "holiday") {
        holidayCount += 1;
      }
    }

    summaries.push({
      employee_id: first.employee_id,
      employee_code: first.employee_code,
      employee_name: first.employee_name,
      period_month: month,
      period_year: year,
      working_days: working,
      present_days: present,
      absent_days: absent,
      leave_days: leave,
      half_days: half,
      week_offs: weekOffs,
      holidays: holidayCount,
      late_days: late,
      total_hours: Math.round(hours * 100) / 100,
      overtime_hours: Math.round(overtime * 100) / 100,
    });
  });

  return summaries.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}
