import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser, isIgnoredEmployee } from "@/lib/admin";
import { kolkataTodayKey } from "@/lib/datetime";
import { displayName } from "@/lib/spaces";
import type { AttendanceDay, Employee, MonthlySummary, Profile, Space, Task } from "@/lib/types";

export const runtime = "nodejs";

type ChatTurn = { role: "user" | "assistant"; content: string };

function compactJson(value: unknown, max = 28000) {
  const text = JSON.stringify(value);
  if (text.length <= max) return text;
  return text.slice(0, max) + "…[truncated]";
}

async function gatherContext(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const todayKey = kolkataTodayKey();
  const [year, month, day] = todayKey.split("-").map(Number);
  const fromKey = new Date(Date.UTC(year, month - 1, day - 21)).toISOString().slice(0, 10);

  const [{ data: profile }, { data: linked }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role").eq("id", userId).maybeSingle(),
    supabase.from("employees").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  const me = (profile as Profile | null) ?? null;
  const myEmployee = (linked as Employee | null) ?? null;
  const operator = isAdminUser({ email: me?.email, role: me?.role }) || !myEmployee;

  const [peopleRes, empRes, spaceRes, taskRes, announceRes, summaryRes, dayRes] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role"),
    supabase.from("employees").select("employee_code, full_name, department, designation, is_active, ignored, email"),
    supabase.from("spaces").select("id, name"),
    supabase.from("tasks").select("id, space_id, title, status, assignee_id, created_by, due_date").limit(80),
    supabase.from("announcements").select("title, body, pinned, created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("monthly_summaries").select("*").eq("period_year", year).eq("period_month", month),
    supabase.from("attendance_days").select("*").gte("work_date", fromKey).lte("work_date", todayKey).order("work_date", { ascending: false }),
  ]);

  const people = (peopleRes.data ?? []) as Profile[];
  const peopleMap = Object.fromEntries(people.map((p) => [p.id, p]));
  const spaces = (spaceRes.data ?? []) as Pick<Space, "id" | "name">[];
  const spaceMap = Object.fromEntries(spaces.map((s) => [s.id, s.name]));

  const employees = ((empRes.data ?? []) as Employee[]).filter(
    (e) => !e.ignored && !isIgnoredEmployee(e.employee_code, e.full_name)
  );

  let summaries = (summaryRes.data ?? []) as MonthlySummary[];
  let days = (dayRes.data ?? []) as AttendanceDay[];
  if (!operator && myEmployee) {
    summaries = summaries.filter((s) => s.employee_code === myEmployee.employee_code);
    days = days.filter((d) => d.employee_code === myEmployee.employee_code);
  } else {
    days = days.filter((d) => !isIgnoredEmployee(d.employee_code, d.employee_name));
    summaries = summaries.filter((s) => !isIgnoredEmployee(s.employee_code, s.employee_name));
  }

  const tasks = ((taskRes.data ?? []) as Task[]).map((t) => ({
    title: t.title,
    status: t.status,
    due: t.due_date,
    space: spaceMap[t.space_id] || null,
    assignee: t.assignee_id ? displayName(peopleMap[t.assignee_id]) : null,
  }));

  return {
    today_ist: todayKey,
    asker: {
      name: me ? displayName(me) : null,
      email: me?.email ?? null,
      role: operator ? "operator" : "staff",
      employee_code: myEmployee?.employee_code ?? null,
    },
    people: employees.map((e) => ({
      code: e.employee_code,
      name: e.full_name,
      department: e.department,
      designation: e.designation,
      active: e.is_active !== false,
    })),
    spaces: spaces.map((s) => s.name),
    tasks,
    announcements: announceRes.data ?? [],
    month_summaries: summaries.map((s) => ({
      code: s.employee_code,
      name: s.employee_name,
      present: s.present_days,
      absent: s.absent_days,
      late: s.late_days,
      leave: s.leave_days,
      half_days: s.half_days,
      hours: s.total_hours,
    })),
    attendance_last_21_days: days.slice(0, 400).map((d) => ({
      date: d.work_date,
      code: d.employee_code,
      name: d.employee_name,
      status: d.status,
      in: d.punch_in,
      out: d.punch_out,
      hours: d.hours_worked,
      late: d.is_late,
    })),
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ configured: Boolean(process.env.DEEPSEEK_API_KEY) });
}

export async function POST(request: Request) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "DeepSeek is not connected yet. Add DEEPSEEK_API_KEY in Vercel → Project → Settings → Environment Variables, then redeploy.",
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const question = String(body.question || "").trim();
  const history = Array.isArray(body.history) ? (body.history as ChatTurn[]).slice(-6) : [];
  if (question.length < 2) {
    return NextResponse.json({ error: "Ask a question about the company data." }, { status: 400 });
  }

  const context = await gatherContext(supabase, user.id);
  const system = `You are ADMEXO Mind. Answer only from the JSON context. Dates are IST (Asia/Kolkata). Attendance comes from TeamOffice Excel files that staff upload into this app — there is no live TeamOffice connection. Never invent people, codes, or punches. If the answer is not in the context, say so. Be concise. Do not reveal API keys or passwords.`;

  const messages: ChatTurn[] = [
    { role: "user", content: `CONTEXT:\n${compactJson(context)}\n\nQUESTION:\n${question}` },
  ];
  const prior = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        max_tokens: 700,
        messages: [{ role: "system", content: system }, ...prior, ...messages],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof json?.error?.message === "string" ? json.error.message : `DeepSeek HTTP ${res.status}`;
      return NextResponse.json({ error: detail }, { status: 502 });
    }
    const answer = String(json?.choices?.[0]?.message?.content || "").trim();
    if (!answer) return NextResponse.json({ error: "DeepSeek returned an empty answer." }, { status: 502 });
    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reach DeepSeek" },
      { status: 502 }
    );
  }
}
