const TZ = "Asia/Kolkata";

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

export function hoursLabel(value: number | string | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const hours = Math.floor(n);
  const minutes = Math.round((n - hours) * 60);
  return `${hours}:${String(Math.abs(minutes)).padStart(2, "0")}`;
}
