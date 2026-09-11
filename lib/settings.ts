import type { CompanySettings } from "@/lib/types";

import { mergedWeeklyOffs } from "@/lib/handbook-calendar";

export const DEFAULT_SETTINGS: CompanySettings = {
  id: 1,
  company_name: "Atrium",
  legal_name: "",
  address: "",
  city: "",
  website: "",
  hr_email: "",
  logo_url: null,
  work_start: "10:00",
  work_end: "19:00",
  expected_hours: 9,
  late_grace_minutes: 15,
  half_day_hours: 4,
  weekly_offs: [0, 6],
  offer_validity_days: 7,
  offer_footer: "",
};

export function normalizeSettings(raw: Partial<CompanySettings> | null | undefined): CompanySettings {
  const s = raw ?? {};
  const weekly = Array.isArray(s.weekly_offs) ? s.weekly_offs.map(Number).filter((n) => Number.isFinite(n)) : [0];
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    work_start: String(s.work_start || DEFAULT_SETTINGS.work_start).slice(0, 5),
    work_end: String(s.work_end || DEFAULT_SETTINGS.work_end).slice(0, 5),
    weekly_offs: mergedWeeklyOffs(weekly),
    expected_hours: Number(s.expected_hours) || DEFAULT_SETTINGS.expected_hours,
    late_grace_minutes: Number(s.late_grace_minutes) || DEFAULT_SETTINGS.late_grace_minutes,
    half_day_hours: Number(s.half_day_hours) || DEFAULT_SETTINGS.half_day_hours,
  };
}
