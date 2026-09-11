import type { SupabaseClient } from "@supabase/supabase-js";
import { HANDBOOK_HOLIDAYS_2026, HANDBOOK_WEEKLY_OFFS, mergedWeeklyOffs } from "@/lib/handbook-calendar";

let seeded = false;

export async function ensureHandbookCalendar(supabase: SupabaseClient) {
  if (seeded) return;
  seeded = true;
  try {
    const { data: settings } = await supabase.from("company_settings").select("weekly_offs").eq("id", 1).maybeSingle();
    const weekly_offs = mergedWeeklyOffs((settings?.weekly_offs as number[] | null) ?? []);
    const needsOffs = HANDBOOK_WEEKLY_OFFS.some((d) => !((settings?.weekly_offs as number[] | null) ?? []).includes(d));
    if (needsOffs) {
      await supabase.from("company_settings").update({ weekly_offs }).eq("id", 1);
    }

    const rows = HANDBOOK_HOLIDAYS_2026.filter((h) => h.type === "fixed").map((h) => ({
      holiday_date: h.date,
      name: h.name,
    }));
    if (rows.length) {
      await supabase.from("holidays").upsert(rows, { onConflict: "holiday_date" });
    }
  } catch {
    // Handbook rules still apply in code if these writes are blocked.
  }
}
