import { weekLabel, weekStartKey } from "@/lib/task-metrics";
import { kolkataTodayKey } from "@/lib/datetime";

export const REPORTS_SPACE_NAME = "Reports";

export function isReportsSpace(space: { name?: string | null } | null | undefined) {
  return (space?.name || "").trim().toLowerCase() === REPORTS_SPACE_NAME.toLowerCase();
}

function shiftKey(key: string, days: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days)).toISOString().slice(0, 10);
}

export function reportPeriodLabel(kind: "weekly" | "monthly", today = kolkataTodayKey()) {
  if (kind === "monthly") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
    if (!m) return today;
    return new Intl.DateTimeFormat("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1, 12)));
  }
  const start = weekStartKey(today);
  if (!start) return today;
  return `${weekLabel(start)} – ${weekLabel(shiftKey(start, 6))}`;
}

export function reportTitle(kind: "weekly" | "monthly", personName: string, today = kolkataTodayKey()) {
  const who = personName.trim() || "Someone";
  const label = kind === "weekly" ? "Weekly report" : "Monthly report";
  return `${label} · ${who} · ${reportPeriodLabel(kind, today)}`;
}
