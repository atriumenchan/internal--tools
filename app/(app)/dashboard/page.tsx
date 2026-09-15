"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { Announcements } from "@/components/announcements";
import { TaskCard } from "@/components/task-card";
import { isAdminUser } from "@/lib/admin";
import { displayName } from "@/lib/spaces";
import { formatWorkDate, hoursLabel, isOverdue, kolkataTodayKey } from "@/lib/datetime";
import type { AttendanceDay, Conversation, Employee, MonthlySummary, Profile, Space, Task } from "@/lib/types";

type InboxRow = {
  conversation_id: string;
  unread_count: number;
  last_body: string | null;
};

function Stat({
  label,
  value,
  href,
  warn,
}: {
  label: string;
  value: string | number;
  href?: string;
  warn?: boolean;
}) {
  const inner = (
    <div className="rounded-2xl border border-rule bg-cream px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-red-400" : "text-ink"}`}>{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:border-white/20">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default function DashboardPage() {
  const app = useAppState();
  const admin = app ? isAdminUser(app.profile) : false;
  const operator = Boolean(admin || app?.operator);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<{ conversation_id: string; user_id: string }[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [today, setToday] = useState<AttendanceDay | null>(null);
  const [teamToday, setTeamToday] = useState<AttendanceDay[]>([]);
  const [workFilter, setWorkFilter] = useState<"mine" | "created" | "overdue">("mine");

  useEffect(() => {
    if (!app) return;
    const supabase = createClient();
    const todayKey = kolkataTodayKey();
    const [year, month] = todayKey.split("-").map(Number);

    void (async () => {
      const [taskRes, spaceRes, peopleRes, inboxRes, convRes, empRes, memberRes] = await Promise.all([
        supabase.from("tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("spaces").select("*").order("name"),
        supabase.from("profiles").select("id, email, full_name, role"),
        supabase.rpc("chat_inbox"),
        supabase.from("conversations").select("*"),
        supabase.from("employees").select("*").eq("user_id", app.userId).maybeSingle(),
        supabase.from("conversation_members").select("conversation_id, user_id"),
      ]);
      setTasks((taskRes.data ?? []) as Task[]);
      setSpaces((spaceRes.data ?? []) as Space[]);
      setPeople((peopleRes.data ?? []) as Profile[]);
      setInbox((inboxRes.data ?? []) as InboxRow[]);
      setConvos((convRes.data ?? []) as Conversation[]);
      setMembers((memberRes.data ?? []) as { conversation_id: string; user_id: string }[]);
      const me = (empRes.data as Employee | null) ?? null;
      setEmployee(me);
      if (me) {
        const [sumRes, dayRes] = await Promise.all([
          supabase
            .from("monthly_summaries")
            .select("*")
            .eq("period_year", year)
            .eq("period_month", month)
            .eq("employee_code", me.employee_code)
            .maybeSingle(),
          supabase.from("attendance_days").select("*").eq("employee_code", me.employee_code).eq("work_date", todayKey).maybeSingle(),
        ]);
        setSummary((sumRes.data as MonthlySummary | null) ?? null);
        setToday((dayRes.data as AttendanceDay | null) ?? null);
      }
      if (operator) {
        const { data } = await supabase.from("attendance_days").select("*").eq("work_date", todayKey);
        setTeamToday((data ?? []) as AttendanceDay[]);
      }
    })();
  }, [app, operator]);

  const peopleMap = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const spaceMap = useMemo(() => Object.fromEntries(spaces.map((s) => [s.id, s])), [spaces]);

  const mine = useMemo(
    () => (tasks ?? []).filter((t) => t.assignee_id === app?.userId && t.status !== "done"),
    [tasks, app?.userId]
  );
  const created = useMemo(
    () => (tasks ?? []).filter((t) => t.created_by === app?.userId && t.status !== "done"),
    [tasks, app?.userId]
  );
  const overdue = useMemo(() => (tasks ?? []).filter((t) => isOverdue(t.due_date, t.status)), [tasks]);
  const unreadChats = inbox.filter((row) => row.unread_count > 0);
  const present = teamToday.filter((d) => d.status === "present" || d.status === "half_day").length;
  const absent = teamToday.filter((d) => d.status === "absent").length;

  const shown = workFilter === "created" ? created : workFilter === "overdue" ? overdue : mine;

  if (!app || tasks === null) return <PageFallback />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={formatWorkDate(kolkataTodayKey(), "long")}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="My tasks" value={mine.length} href="/spaces" />
        <Stat label="Overdue" value={overdue.length} warn={overdue.length > 0} href="/spaces" />
        <Stat label="Unread chats" value={unreadChats.reduce((n, r) => n + r.unread_count, 0)} href="/chat" />
        {operator ? (
          <Stat label="Absent today" value={absent} href="/board" warn={absent > 0} />
        ) : (
          <Stat
            label="Today"
            value={today ? today.status.replace("_", " ") : employee ? "No punch" : "—"}
          />
        )}
      </div>

      <div className="mb-6">
        <Announcements operator={operator} userId={app.userId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Work</h2>
            <div className="flex rounded-full border border-rule p-1 text-xs">
              {(
                [
                  ["mine", "Assigned to me"],
                  ["created", "I created"],
                  ["overdue", "Overdue"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setWorkFilter(id)}
                  className={`rounded-full px-3 py-1 ${workFilter === id ? "bg-terracotta text-white" : "text-ink-soft hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-rule px-4 py-8 text-center text-sm text-ink-soft">
              Nothing in this list. Open Tasks to add work to a board.
            </p>
          ) : (
            <ul className="space-y-2">
              {shown.map((task) => (
                <li key={task.id}>
                  <TaskCard
                    task={task}
                    href={`/spaces/${task.space_id}/tasks/${task.id}`}
                    spaceName={spaceMap[task.space_id]?.name}
                    assignee={task.assignee_id ? peopleMap[task.assignee_id] : null}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-rule bg-cream p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Boards</h2>
              <Link href="/spaces" className="text-xs text-terracotta">
                All
              </Link>
            </div>
            {spaces.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No task boards yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {spaces.map((space) => (
                  <li key={space.id}>
                    <Link href={`/spaces/${space.id}`} className="flex items-center gap-2 text-sm hover:text-terracotta">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: space.color || "#FF5A1F" }} />
                      {space.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-rule bg-cream p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{operator ? "Attendance" : "Your day"}</h2>
              {operator ? (
                <Link href="/board" className="text-xs text-terracotta">
                  Full board
                </Link>
              ) : null}
            </div>
            {operator ? (
              <p className="mt-3 text-sm text-ink-soft">
                Present {present} · Absent {absent}
              </p>
            ) : employee ? (
              <div className="mt-3 space-y-1 text-sm">
                <p>
                  {today ? today.status.replace("_", " ") : "No punch yet"}
                  {today?.hours_worked ? ` · ${hoursLabel(today.hours_worked)}` : ""}
                </p>
                {summary ? (
                  <p className="text-ink-soft">
                    This month · present {summary.present_days} · absent {summary.absent_days} · late {summary.late_days}
                  </p>
                ) : (
                  <p className="text-ink-soft">Month totals appear after the next Excel upload.</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">Ask admin to link your login on Staff.</p>
            )}
          </section>

          <section className="rounded-2xl border border-rule bg-cream p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Chat</h2>
              <Link href="/chat" className="text-xs text-terracotta">
                Open
              </Link>
            </div>
            {unreadChats.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No unread messages.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {unreadChats.map((row) => {
                  const convo = convos.find((c) => c.id === row.conversation_id);
                  let label = convo?.name || "Chat";
                  if (convo?.type === "dm") {
                    const other = members.find((m) => m.conversation_id === convo.id && m.user_id !== app.userId);
                    label = other ? displayName(peopleMap[other.user_id]) : "Direct message";
                  }
                  return (
                    <li key={row.conversation_id}>
                      <Link href={`/chat?c=${row.conversation_id}`} className="block hover:text-terracotta">
                        <span className="font-medium">{label}</span>
                        <span className="ml-2 rounded-full bg-terracotta px-1.5 text-[10px] text-white">{row.unread_count}</span>
                        {row.last_body ? <span className="mt-0.5 block truncate text-xs text-ink-soft">{row.last_body}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
