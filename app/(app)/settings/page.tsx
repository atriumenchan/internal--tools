import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";
import { ensureHandbookCalendar } from "@/lib/ensure-handbook";
import { normalizeSettings } from "@/lib/settings";
import type { CompanySettings, Holiday } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const dataPromise = Promise.all([
    supabase.from("company_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("holidays").select("*").order("holiday_date"),
  ]);
  void ensureHandbookCalendar(supabase);
  const [{ data: settings }, { data: holidays }] = await dataPromise;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Company details appear on offer letters. Saturday and Sunday are always weekly offs. Fixed Noida holidays come from the handbook."
      />
      <SettingsForm settings={normalizeSettings(settings as CompanySettings | null)} holidays={(holidays ?? []) as Holiday[]} />
    </div>
  );
}
