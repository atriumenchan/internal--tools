"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { AttendanceUploader } from "./uploader";
import { monthLabel } from "@/lib/utils";
import { isIgnoredEmployee } from "@/lib/admin";
import { normalizeSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/client";
import { useAppState } from "@/components/app-frame";
import { PageFallback } from "@/components/app-nav";
import type { CompanySettings, Employee, Holiday } from "@/lib/types";

type UploadRow = { id: string; file_name: string; period_month: number; period_year: number };

export default function AttendancePage() {
  const app = useAppState();
  const router = useRouter();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [uploads, setUploads] = useState<UploadRow[] | null>(null);

  useEffect(() => {
    if (app && !app.operator) router.replace("/home");
  }, [app, router]);

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("company_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("employees").select("*").eq("is_active", true),
      supabase.from("holidays").select("*"),
      supabase
        .from("attendance_uploads")
        .select("id, file_name, period_month, period_year")
        .order("created_at", { ascending: false })
        .limit(12),
    ]).then(([settingsRes, employeesRes, holidaysRes, uploadsRes]) => {
      setSettings(normalizeSettings(settingsRes.data as CompanySettings | null));
      setEmployees(
        ((employeesRes.data ?? []) as Employee[]).filter(
          (e) => !e.ignored && !isIgnoredEmployee(e.employee_code, e.full_name)
        )
      );
      setHolidays((holidaysRes.data ?? []) as Holiday[]);
      setUploads((uploadsRes.data ?? []) as UploadRow[]);
    });
  }, []);

  if (app && !app.operator) return <PageFallback />;
  if (!app || !settings || !uploads) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="Time"
        title="Attendance from Excel"
        description="Drop the weekly month-performance .xls here. Saturday, Sunday, and handbook holidays count as offs. It overwrites that month in Supabase."
      />
      <AttendanceUploader settings={settings} employees={employees} holidays={holidays} userId={app.userId} />

      <section className="mt-12">
        <h2 className="font-serif text-2xl">Past uploads</h2>
        <ul className="mt-4 divide-y divide-rule rounded-2xl border border-rule bg-cream">
          {uploads.length === 0 ? (
            <li className="px-4 py-8 text-sm text-ink-soft">No files yet.</li>
          ) : (
            uploads.map((upload) => (
              <li key={upload.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{upload.file_name}</p>
                  <p className="text-xs text-ink-soft">{monthLabel(upload.period_month, upload.period_year)}</p>
                </div>
                <Link className="text-terracotta" href={`/attendance/${upload.period_year}/${upload.period_month}`}>
                  Open month
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
