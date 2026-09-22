import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser, isIgnoredEmployee, normalizeEmpCode } from "@/lib/admin";
import { kolkataTodayKey } from "@/lib/datetime";
import { addDaysKey } from "@/lib/own-attendance";
import type { AttendanceDay, Employee, MonthlySummary } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
    const team = isAdminUser({ email: user.email ?? profile?.email, role: profile?.role });

    const today = kolkataTodayKey();
    const from = addDaysKey(today, -120);
    const { data: rows } = await admin.from("attendance_days").select("*").gte("work_date", from).order("work_date");
    const allDays = ((rows ?? []) as AttendanceDay[]).filter(
      (row) => !isIgnoredEmployee(row.employee_code, row.employee_name)
    );

    if (team) {
      return NextResponse.json({
        linked: true,
        team: true,
        employee: null,
        days: allDays,
        summaries: [],
      });
    }

    const { data: me } = await admin
      .from("employees")
      .select("id, employee_code, full_name, user_id, department")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!me) {
      return NextResponse.json({ linked: false, team: false, employee: null, days: [], summaries: [] });
    }

    const code = normalizeEmpCode(me.employee_code);
    const days = allDays.filter(
      (row) => row.employee_id === me.id || (!!code && normalizeEmpCode(row.employee_code) === code)
    );

    const { data: sums } = await admin.from("monthly_summaries").select("*").order("period_year", { ascending: false });
    const summaries = ((sums ?? []) as MonthlySummary[]).filter(
      (row) => row.employee_id === me.id || (!!code && normalizeEmpCode(row.employee_code) === code)
    );

    return NextResponse.json({
      linked: true,
      team: false,
      employee: me as Employee,
      days,
      summaries,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load attendance" },
      { status: 500 }
    );
  }
}
