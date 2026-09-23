"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (app && !app.operator) router.replace("/dashboard");
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

  async function deleteUpload(upload: UploadRow) {
    const supabase = createClient();
    const { error: err } = await supabase.from("attendance_uploads").delete().eq("id", upload.id);
    if (err) {
      setError(err.message);
      return;
    }
    setUploads((prev) => (prev ?? []).filter((row) => row.id !== upload.id));
  }

  if (app && !app.operator) return <PageFallback />;
  if (!app || !settings || !uploads) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="Time"
        title="Attendance from Excel"
        description="Drop the weekly Excel here. After Save, those dates stay locked. A later week only adds new days."
      />
      <AttendanceUploader settings={settings} employees={employees} holidays={holidays} userId={app.userId} />
      {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium tracking-tight">Past uploads</h2>
        <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-surface shadow-card">
          {uploads.length === 0 ? (
            <li className="px-4 py-8 text-sm text-faint">No files yet</li>
          ) : (
            uploads.map((upload) => (
              <li key={upload.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{upload.file_name}</p>
                  <p className="text-xs text-muted">{monthLabel(upload.period_month, upload.period_year)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Link className="text-sm font-medium text-teal hover:text-teal-soft" href={`/attendance/${upload.period_year}/${upload.period_month}`}>
                    Open month
                  </Link>
                  <ConfirmDelete
                    label="Delete upload"
                    title="Delete this upload?"
                    description="Removes the file from this list. Saved attendance days stay locked."
                    onConfirm={() => deleteUpload(upload)}
                  />
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
