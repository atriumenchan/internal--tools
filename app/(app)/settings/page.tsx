"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";
import { normalizeSettings } from "@/lib/settings";
import { useAppState } from "@/components/app-frame";
import { PageFallback } from "@/components/app-nav";
import type { CompanySettings, Holiday } from "@/lib/types";

export default function SettingsPage() {
  const app = useAppState();
  const router = useRouter();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  useEffect(() => {
    if (app && !app.operator) router.replace("/dashboard");
  }, [app, router]);

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("company_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("holidays").select("*").order("holiday_date"),
    ]).then(([settingsRes, holidaysRes]) => {
      setSettings(normalizeSettings(settingsRes.data as CompanySettings | null));
      setHolidays((holidaysRes.data ?? []) as Holiday[]);
    });
  }, []);

  if (app && !app.operator) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Company details appear on offer letters. Control who can create Spaces and which handbook version everyone must sign."
      />
      {settings ? <SettingsForm settings={settings} holidays={holidays} /> : <PageFallback />}
    </div>
  );
}
