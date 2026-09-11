import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { AttendanceUploader } from "./uploader";
import { monthLabel } from "@/lib/utils";
import { isAdminUser, isIgnoredEmployee } from "@/lib/admin";
import type { CompanySettings, Employee, Holiday } from "@/lib/types";

export default async function AttendancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user!.id).maybeSingle();
  const { data: linked } = await supabase.from("employees").select("id").eq("user_id", user!.id).maybeSingle();
  const operator = isAdminUser({ email: user?.email, role: profile?.role }) || !linked;
  if (!operator) redirect("/dashboard");
  const [{ data: settings }, { data: employees }, { data: holidays }, { data: uploads }] = await Promise.all([
    supabase.from("company_settings").select("*").eq("id", 1).single(),
    supabase.from("employees").select("*").eq("is_active", true),
    supabase.from("holidays").select("*"),
    supabase.from("attendance_uploads").select("*").order("created_at", { ascending: false }).limit(12),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Time"
        title="Attendance from Excel"
        description="Drop the weekly month-performance .xls here. It overwrites that month in Supabase. The live board on Home always reads from the database."
      />
      <AttendanceUploader
        settings={settings as CompanySettings}
        employees={((employees ?? []) as Employee[]).filter(
          (e) => !e.ignored && !isIgnoredEmployee(e.employee_code, e.full_name)
        )}
        holidays={(holidays ?? []) as Holiday[]}
        userId={user!.id}
      />

      <section className="mt-12">
        <h2 className="font-serif text-2xl">Past uploads</h2>
        <ul className="mt-4 divide-y divide-rule rounded-2xl border border-rule bg-cream">
          {(uploads ?? []).length === 0 ? (
            <li className="px-4 py-8 text-sm text-ink-soft">No files yet.</li>
          ) : (
            (uploads ?? []).map((upload) => (
              <li key={upload.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{upload.file_name}</p>
                  <p className="text-xs text-ink-soft">{monthLabel(upload.period_month, upload.period_year)}</p>
                </div>
                <Link
                  className="text-terracotta"
                  href={`/attendance/${upload.period_year}/${upload.period_month}`}
                >
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
