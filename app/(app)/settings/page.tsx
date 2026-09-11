import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";
import { ensureHandbookCalendar } from "@/lib/ensure-handbook";
import type { CompanySettings, Holiday } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  await ensureHandbookCalendar(supabase);
  const [{ data: settings }, { data: holidays }] = await Promise.all([
    supabase.from("company_settings").select("*").eq("id", 1).single(),
    supabase.from("holidays").select("*").order("holiday_date"),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Company details appear on offer letters. Saturday and Sunday are always weekly offs. Fixed Noida holidays come from the handbook."
      />
      <SettingsForm settings={settings as CompanySettings} holidays={(holidays ?? []) as Holiday[]} />
    </div>
  );
}
