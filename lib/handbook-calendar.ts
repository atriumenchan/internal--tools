import type { DayStatus, Holiday } from "@/lib/types";

/** Sunday = 0 … Saturday = 6. Handbook: working days are Monday–Friday. */
export const HANDBOOK_WEEKLY_OFFS = [0, 6];

export type HandbookHoliday = {
  date: string;
  name: string;
  type: "fixed" | "optional";
};

/** ADMEXO Noida calendar from Employee & Intern Handbook v2.0, section 11. */
export const HANDBOOK_HOLIDAYS_2026: HandbookHoliday[] = [
  { date: "2026-01-26", name: "Republic Day", type: "fixed" },
  { date: "2026-03-04", name: "Holi", type: "fixed" },
  { date: "2026-03-21", name: "Eid-ul-Fitr", type: "optional" },
  { date: "2026-03-26", name: "Ram Navami", type: "fixed" },
  { date: "2026-04-03", name: "Good Friday", type: "optional" },
  { date: "2026-05-27", name: "Eid-ul-Zuha (Bakrid)", type: "optional" },
  { date: "2026-08-15", name: "Independence Day", type: "fixed" },
  { date: "2026-08-28", name: "Raksha Bandhan", type: "fixed" },
  { date: "2026-09-04", name: "Janmashtami", type: "fixed" },
  { date: "2026-10-02", name: "Gandhi Jayanti", type: "fixed" },
  { date: "2026-10-20", name: "Dussehra", type: "fixed" },
  { date: "2026-11-08", name: "Diwali", type: "fixed" },
  { date: "2026-11-24", name: "Guru Nanak Jayanti", type: "optional" },
  { date: "2026-12-25", name: "Christmas", type: "fixed" },
];

export function weekdayOf(dateKey: string) {
  const [year, month, day] = dateKey.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function mergedWeeklyOffs(extra: number[] | null | undefined) {
  return [...new Set([...HANDBOOK_WEEKLY_OFFS, ...(extra ?? [])])];
}

export function isWeeklyOff(dateKey: string, extraOffs?: number[] | null) {
  return mergedWeeklyOffs(extraOffs).includes(weekdayOf(dateKey));
}

export function fixedHolidayName(dateKey: string, extra: Pick<Holiday, "holiday_date" | "name">[] = []) {
  const key = dateKey.slice(0, 10);
  const fromHandbook = HANDBOOK_HOLIDAYS_2026.find((h) => h.date === key && h.type === "fixed");
  if (fromHandbook) return fromHandbook.name;
  return extra.find((h) => (h.holiday_date || "").slice(0, 10) === key)?.name ?? null;
}

export function resolveHandbookStatus(input: {
  dateKey: string;
  fileStatus: DayStatus;
  hasWork: boolean;
  extraOffs?: number[] | null;
  extraHolidays?: Pick<Holiday, "holiday_date" | "name">[];
}): { status: DayStatus; holidayName: string | null } {
  const holidayName = fixedHolidayName(input.dateKey, input.extraHolidays);
  const weekend = isWeeklyOff(input.dateKey, input.extraOffs);
  const worked =
    input.hasWork || input.fileStatus === "present" || input.fileStatus === "half_day";
  const onLeave = input.fileStatus === "leave";

  if (holidayName && !worked && !onLeave) return { status: "holiday", holidayName };
  if (weekend && !worked && !onLeave) return { status: "week_off", holidayName: null };
  return { status: input.fileStatus, holidayName };
}
