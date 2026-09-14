"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { AttendanceBoard } from "./board";
import { monthLabel } from "@/lib/utils";
import { isIgnoredEmployee } from "@/lib/admin";
import { kolkataTodayKey } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/client";
import { PageFallback } from "@/components/app-nav";
import type { AttendanceDay, Employee, MonthlySummary } from "@/lib/types";

export default function DashboardPage() {
  const [people, setPeople] = useState<Employee[] | null>(null);
  const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [lastUploadLabel, setLastUploadLabel] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const today = kolkataTodayKey();
    const [year, month] = today.split("-").map(Number);
    const start = new Date(year, month - 3, 1);
    const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;

    void Promise.all([
      supabase.from("employees").select("id, employee_code, full_name, department, ignored, is_active").eq("is_active", true).order("employee_code"),
      supabase
        .from("monthly_summaries")
        .select("id, employee_code, employee_name, present_days, absent_days, leave_days, week_offs, late_days, total_hours, overtime_hours, period_month, period_year")
        .order("employee_name"),
      supabase
        .from("attendance_days")
        .select("id, employee_code, employee_name, work_date, punch_in, punch_out, hours_worked, is_late, status")
        .gte("work_date", startKey)
        .order("work_date"),
      supabase.from("attendance_uploads").select("file_name, period_month, period_year").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([employees, summariesRes, daysRes, lastUpload]) => {
      setPeople(
        ((employees.data ?? []) as Employee[]).filter(
          (e) => !e.ignored && !isIgnoredEmployee(e.employee_code, e.full_name)
        )
      );
      setSummaries((summariesRes.data ?? []) as MonthlySummary[]);
      setDays((daysRes.data ?? []) as AttendanceDay[]);
      const upload = lastUpload.data;
      setLastUploadLabel(upload ? `${upload.file_name} · ${monthLabel(upload.period_month, upload.period_year)}` : null);
    });
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Live from Supabase"
        title="Attendance board"
        description="Weekly Excel uploads land here. Filter by person, department, status, or date. Switch to day-wise to see the whole team on one date."
      />
      {people ? (
        <AttendanceBoard employees={people} summaries={summaries} days={days} lastUploadLabel={lastUploadLabel} />
      ) : (
        <PageFallback />
      )}
    </div>
  );
}
