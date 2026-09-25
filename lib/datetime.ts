const TZ = "Asia/Kolkata";

export function kolkataTodayKey() {
  return kolkataDateKeyFromInstant(new Date()) || "";
}

export function kolkataDateKeyFromInstant(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null;
  const key = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), key };
}

export function formatWorkDate(value: string | null | undefined, pattern: "short" | "long" = "short") {
  const parts = dateOnly(value);
  if (!parts) return "—";
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  if (Number.isNaN(date.getTime())) return parts.key;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      weekday: pattern === "long" ? "long" : "short",
      day: "numeric",
      month: pattern === "long" ? "long" : "short",
      year: pattern === "long" ? "numeric" : undefined,
      timeZone: TZ,
    }).format(date);
  } catch {
    return parts.key;
  }
}

export function formatClock(value: string | null | undefined) {
  if (!value) return "—";
  const text = String(value).trim();
  const hm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (hm) return `${hm[1].padStart(2, "0")}:${hm[2]}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: TZ,
    }).format(date);
  } catch {
    return "—";
  }
}

export function dueDateKey(value: string | null | undefined) {
  if (!value) return null;
  const key = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function formatDueDate(value: string | null | undefined) {
  const key = dueDateKey(value);
  if (!key) return null;
  return formatWorkDate(key, "short");
}

export function isOverdue(value: string | null | undefined, status?: string | null, today = kolkataTodayKey()) {
  if (status === "done" || status === "cancelled") return false;
  const key = dueDateKey(value);
  if (!key) return false;
  return key < today;
}

export function isOpenWork(status?: string | null) {
  return status !== "done" && status !== "cancelled";
}

export function isClosedToday(
  task: { status?: string | null; updated_at?: string | null; created_at?: string | null },
  today = kolkataTodayKey()
) {
  if (task.status !== "done") return false;
  const key = kolkataDateKeyFromInstant(task.updated_at || task.created_at);
  return key === today;
}

/** Calendar-day gap from today in IST. Negative = overdue. Null = no due date. */
export function dueOffsetDays(value: string | null | undefined, today = kolkataTodayKey()) {
  const key = dueDateKey(value);
  if (!key) return null;
  const a = dateOnly(key);
  const b = dateOnly(today);
  if (!a || !b) return null;
  const ms = Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);
  return Math.round(ms / 86_400_000);
}

export function dueWhenLabel(value: string | null | undefined, status?: string | null, today = kolkataTodayKey()) {
  if (status === "done" || status === "cancelled") {
    const dated = formatDueDate(value);
    return dated ? `Was due ${dated}` : null;
  }
  const offset = dueOffsetDays(value, today);
  if (offset === null) return null;
  if (offset < 0) return offset === -1 ? "Overdue · yesterday" : `Overdue · ${Math.abs(offset)} days`;
  if (offset === 0) return "Due today";
  if (offset === 1) return "Due tomorrow";
  if (offset <= 6) return `Due in ${offset} days`;
  const dated = formatDueDate(value);
  return dated ? `Due ${dated}` : `Due in ${offset} days`;
}

export function compareDueSoon<T extends { due_date?: string | null; status?: string | null }>(a: T, b: T) {
  const aDone = a.status === "done" || a.status === "cancelled";
  const bDone = b.status === "done" || b.status === "cancelled";
  if (aDone !== bDone) return aDone ? 1 : -1;
  const ao = dueOffsetDays(a.due_date);
  const bo = dueOffsetDays(b.due_date);
  if (ao === null && bo === null) return 0;
  if (ao === null) return 1;
  if (bo === null) return -1;
  return ao - bo;
}

export function formatRelative(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const now = Date.now();
  const diff = now - date.getTime();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "Just now";
  if (abs < hour) {
    const n = Math.round(abs / minute);
    return `${n} min ${diff > 0 ? "ago" : "from now"}`;
  }
  const sameDay = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" });
  const todayKey = sameDay.format(new Date());
  const thatKey = sameDay.format(date);
  const clock = new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  if (todayKey === thatKey) return `Today at ${clock}`;
  const yest = new Date(now - day);
  if (sameDay.format(yest) === thatKey) return `Yesterday at ${clock}`;
  if (abs < 7 * day) {
    const weekday = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "long" }).format(date);
    return `${weekday} at ${clock}`;
  }
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function hoursLabel(value: number | string | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const hours = Math.floor(n);
  const minutes = Math.round((n - hours) * 60);
  return `${hours}:${String(Math.abs(minutes)).padStart(2, "0")}`;
}
