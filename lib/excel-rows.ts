export type ColumnKey =
  | "employee_code"
  | "employee_name"
  | "date"
  | "time"
  | "punch_in"
  | "punch_out"
  | "status";

export type ColumnMapping = Partial<Record<ColumnKey, string>>;

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
  suggested: ColumnMapping;
  mode: "punches" | "daily";
};

export type RawPunch = {
  employee_code: string;
  employee_name: string;
  at: Date;
  status?: string;
};

export type RawDayRow = {
  employee_code: string;
  employee_name: string;
  date: Date;
  punch_in: Date | null;
  punch_out: Date | null;
  status?: string;
};

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  employee_code: [
    "emp code",
    "empcode",
    "employee code",
    "employee_code",
    "employee id",
    "empid",
    "emp id",
    "code",
    "staff id",
    "userid",
    "user id",
    "enroll",
    "enrollnumber",
    "enroll number",
  ],
  employee_name: [
    "name",
    "employee name",
    "employee_name",
    "emp name",
    "staff name",
    "full name",
    "fullname",
  ],
  date: ["date", "work date", "attendance date", "day", "punch date"],
  time: ["time", "punch time", "datetime", "date time", "punch datetime", "log time"],
  punch_in: ["in", "in time", "intime", "punch in", "check in", "clock in", "first in"],
  punch_out: ["out", "out time", "outtime", "punch out", "check out", "clock out", "last out"],
  status: ["status", "remark", "remarks", "type", "leave type", "attendance", "flag"],
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[_./-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const unused = new Set(headers);

  (Object.keys(HEADER_ALIASES) as ColumnKey[]).forEach((key) => {
    const aliases = HEADER_ALIASES[key];
    for (const header of unused) {
      const n = normalizeHeader(header);
      if (aliases.includes(n)) {
        mapping[key] = header;
        unused.delete(header);
        return;
      }
    }
  });

  return mapping;
}

export function excelSerialToDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const whole = Math.floor(value);
    const frac = value - whole;
    const utc = Date.UTC(1899, 11, 30) + whole * 86400000 + Math.round(frac * 86400000);
    const d = new Date(utc);
    return new Date(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds()
    );
  }
  const text = String(value).trim();
  if (!text) return null;

  const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text);
  if (timeOnly) {
    let hours = Number(timeOnly[1]);
    const minutes = Number(timeOnly[2]);
    const seconds = Number(timeOnly[3] ?? 0);
    const meridiem = timeOnly[4]?.toLowerCase();
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return new Date(1899, 11, 30, hours, minutes, seconds);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function combineDateAndTime(date: Date, time: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time.getHours(),
    time.getMinutes(),
    time.getSeconds()
  );
}

function cell(row: Record<string, unknown>, header?: string) {
  if (!header) return "";
  const value = row[header];
  if (value == null) return "";
  return String(value).trim();
}

export function extractPunches(sheet: ParsedSheet, mapping: ColumnMapping): RawPunch[] {
  const punches: RawPunch[] = [];
  for (const row of sheet.rows) {
    const name = cell(row, mapping.employee_name);
    if (!name) continue;
    const code = cell(row, mapping.employee_code);
    const status = cell(row, mapping.status);
    const dateVal = excelSerialToDate(mapping.date ? row[mapping.date] : undefined);
    const timeVal = excelSerialToDate(mapping.time ? row[mapping.time] : undefined);

    let at: Date | null = null;
    if (dateVal && timeVal) {
      const timeLooksLikeTimeOnly = timeVal.getFullYear() < 1950;
      at = timeLooksLikeTimeOnly ? combineDateAndTime(dateVal, timeVal) : timeVal;
    } else if (timeVal && timeVal.getFullYear() > 1950) {
      at = timeVal;
    } else if (dateVal && dateVal.getHours() + dateVal.getMinutes() > 0) {
      at = dateVal;
    }

    if (!at) continue;
    punches.push({
      employee_code: code,
      employee_name: name,
      at,
      status: status || undefined,
    });
  }
  return punches;
}

export function extractDailyRows(sheet: ParsedSheet, mapping: ColumnMapping): RawDayRow[] {
  const days: RawDayRow[] = [];
  for (const row of sheet.rows) {
    const name = cell(row, mapping.employee_name);
    if (!name) continue;
    const code = cell(row, mapping.employee_code);
    const status = cell(row, mapping.status);
    const dateVal = excelSerialToDate(mapping.date ? row[mapping.date] : undefined);
    if (!dateVal) continue;

    const inVal = excelSerialToDate(mapping.punch_in ? row[mapping.punch_in] : undefined);
    const outVal = excelSerialToDate(mapping.punch_out ? row[mapping.punch_out] : undefined);

    days.push({
      employee_code: code,
      employee_name: name,
      date: new Date(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate()),
      punch_in: inVal ? (inVal.getFullYear() < 1950 ? combineDateAndTime(dateVal, inVal) : inVal) : null,
      punch_out: outVal ? (outVal.getFullYear() < 1950 ? combineDateAndTime(dateVal, outVal) : outVal) : null,
      status: status || undefined,
    });
  }
  return days;
}
