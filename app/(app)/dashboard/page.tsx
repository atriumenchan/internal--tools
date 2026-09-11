import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { AttendanceBoard } from "./board";
import { monthLabel } from "@/lib/utils";
import { isIgnoredEmployee } from "@/lib/admin";
import type { AttendanceDay, Employee, MonthlySummary } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const startKey = start.toISOString().slice(0, 10);

  const [{ data: employees }, { data: summaries }, { data: days }, { data: lastUpload }] = await Promise.all([
    supabase.from("employees").select("*").order("employee_code"),
    supabase.from("monthly_summaries").select("*").order("employee_name"),
    supabase.from("attendance_days").select("*").gte("work_date", startKey).order("work_date"),
    supabase.from("attendance_uploads").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const people = ((employees ?? []) as Employee[]).filter(
    (e) => !e.ignored && !isIgnoredEmployee(e.employee_code, e.full_name)
  );

  return (
    <div>
      <PageHeader
        eyebrow="Live from Supabase"
        title="Attendance board"
        description="Weekly Excel uploads land here. Filter by person, department, status, or date. Switch to day-wise to see the whole team on one date."
      />
      <AttendanceBoard
        employees={people}
        summaries={(summaries ?? []) as MonthlySummary[]}
        days={(days ?? []) as AttendanceDay[]}
        lastUploadLabel={
          lastUpload ? `${lastUpload.file_name} · ${monthLabel(lastUpload.period_month, lastUpload.period_year)}` : null
        }
      />
    </div>
  );
}
