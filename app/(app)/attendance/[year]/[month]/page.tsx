"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui";
import { MonthReport } from "./month-report";
import { monthLabel } from "@/lib/utils";
import { PageFallback } from "@/components/app-nav";
import type { AttendanceDay, MonthlySummary } from "@/lib/types";

export default function MonthPage() {
  const params = useParams<{ year: string; month: string }>();
  const y = Number(params.year);
  const m = Number(params.month);
  const [summaries, setSummaries] = useState<MonthlySummary[] | null>(null);
  const [days, setDays] = useState<AttendanceDay[]>([]);

  useEffect(() => {
    if (!y || !m) return;
    const supabase = createClient();
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
    void Promise.all([
      supabase.from("monthly_summaries").select("*").eq("period_year", y).eq("period_month", m).order("employee_name"),
      supabase.from("attendance_days").select("*").gte("work_date", start).lte("work_date", end).order("work_date"),
    ]).then(([summariesRes, daysRes]) => {
      setSummaries((summariesRes.data ?? []) as MonthlySummary[]);
      setDays((daysRes.data ?? []) as AttendanceDay[]);
    });
  }, [y, m]);

  return (
    <div>
      <PageHeader
        eyebrow="Attendance"
        title={monthLabel(m, y)}
        description="Hours, leaves, absences and late marks for everyone in the file. Open a person for the day-by-day sheet."
        actions={
          <Link href="/attendance" className="text-sm font-medium text-teal hover:text-teal-soft">
            Upload another file
          </Link>
        }
      />
      {summaries ? (
        <MonthReport monthLabel={monthLabel(m, y)} summaries={summaries} days={days} />
      ) : (
        <PageFallback />
      )}
    </div>
  );
}
