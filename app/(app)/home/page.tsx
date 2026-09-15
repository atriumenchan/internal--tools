"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, PageHeader } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { isAdminUser } from "@/lib/admin";
import { displayName, TASK_STATUS_LABELS } from "@/lib/spaces";
import { formatDueDate, formatWorkDate, hoursLabel, isOverdue, kolkataTodayKey } from "@/lib/datetime";
import type { AttendanceDay, Conversation, Employee, MonthlySummary, Profile, Space, Task } from "@/lib/types";

type InboxRow = {
  conversation_id: string;
  unread_count: number;
  last_body: string | null;
};

function TaskBlock({
  title,
  tasks,
  spaces,
  people,
}: {
  title: string;
  tasks: Task[];
  spaces: Record<string, Space>;
  people: Record<string, Profile>;
}) {
  return (
    <section className="rounded-2xl border border-rule bg-cream p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Nothing here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule">
          {tasks.map((task) => {
            const due = formatDueDate(task.due_date);
            const late = isOverdue(task.due_date, task.status);
            return (
              <li key={task.id}>
                <Link
                  href={`/spaces/${task.space_id}/tasks/${task.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:text-terracotta"
                >
                  <span>
                    <span className="block font-medium">{task.title}</span>
                    <span className="text-xs text-ink-soft">
                      {spaces[task.space_id]?.name || "Space"}
                      {task.assignee_id ? ` · ${displayName(people[task.assignee_id])}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {due ? (
                      <span className={`block text-xs ${late ? "text-red-400" : "text-ink-soft"}`}>
                        due {due}
                      </span>
                    ) : null}
                    <Badge tone={task.status === "done" ? "ok" : late ? "danger" : "neutral"}>
                      {TASK_STATUS_LABELS[task.status]}
                    </Badge>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function HomePage() {
  const app = useAppState();
  const admin = app ? isAdminUser(app.profile) : false;
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
      if (admin || app.operator) {
        const { data } = await supabase.from("attendance_days").select("*").eq("work_date", todayKey);
        setTeamToday((data ?? []) as AttendanceDay[]);
      }
    })();
  }, [app, admin]);

  if (!app || tasks === null) return <PageFallback />;

  const spaceMap = Object.fromEntries(spaces.map((s) => [s.id, s]));
  const peopleMap = Object.fromEntries(people.map((p) => [p.id, p]));
  const assigned = tasks.filter((t) => t.assignee_id === app.userId && t.status !== "done");
  const created = tasks.filter((t) => t.created_by === app.userId);
  const overdue = tasks.filter((t) => isOverdue(t.due_date, t.status));
  const dms = convos.filter((c) => c.type === "dm");
  const unreadChats = inbox.filter((row) => row.unread_count > 0);
  const present = teamToday.filter((d) => d.status === "present" || d.status === "half_day").length;
  const absent = teamToday.filter((d) => d.status === "absent").length;

  return (
    <div>
      <PageHeader
        eyebrow={admin || app.operator ? "Admin" : "Your day"}
        title={admin || app.operator ? "Team home" : `Hi ${app.profile.full_name || "there"}`}
        description={
          admin || app.operator
            ? "Overdue work, today’s attendance, and unread chats. The full attendance board is under Board."
            : "Tasks assigned to you, tasks you created, your attendance, spaces, and chats."
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {admin || app.operator ? (
          <>
            <section className="rounded-2xl border border-rule bg-cream p-4">
              <h2 className="text-lg font-semibold">Today’s attendance</h2>
              <p className="mt-1 text-xs text-ink-soft">{formatWorkDate(kolkataTodayKey(), "long")}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <p className="rounded-xl bg-paper p-3">
                  <span className="block text-xs text-ink-soft">Present</span>
                  <span className="text-2xl font-semibold text-sage">{present}</span>
                </p>
                <p className="rounded-xl bg-paper p-3">
                  <span className="block text-xs text-ink-soft">Absent</span>
                  <span className="text-2xl font-semibold">{absent}</span>
                </p>
              </div>
              <Link href="/dashboard" className="mt-3 inline-block text-sm text-terracotta">
                Open full board
              </Link>
            </section>
            <TaskBlock title="Overdue across your Spaces" tasks={overdue} spaces={spaceMap} people={peopleMap} />
          </>
        ) : (
          <>
            <TaskBlock title="Assigned to you" tasks={assigned} spaces={spaceMap} people={peopleMap} />
            <TaskBlock title="Created by you" tasks={created} spaces={spaceMap} people={peopleMap} />
            <section className="rounded-2xl border border-rule bg-cream p-4">
              <h2 className="text-lg font-semibold">Your attendance</h2>
              {employee ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p>
                    Today:{" "}
                    <span className="font-medium">
                      {today ? today.status.replace("_", " ") : "No punch yet"}
                    </span>
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
                <p className="mt-3 text-sm text-ink-soft">Ask an admin to link your login on Staff so attendance can find you.</p>
              )}
            </section>
          </>
        )}
        <section className="rounded-2xl border border-rule bg-cream p-4">
          <h2 className="text-lg font-semibold">Your Spaces</h2>
          {spaces.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">No Spaces yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {spaces.map((space) => (
                <li key={space.id}>
                  <Link href={`/spaces/${space.id}`} className="flex items-center gap-2 text-sm hover:text-terracotta">
                    <span className="h-3 w-3 rounded-full" style={{ background: space.color || "#FF5A1F" }} />
                    {space.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-rule bg-cream p-4">
          <h2 className="text-lg font-semibold">Direct chats</h2>
          {dms.length === 0 && unreadChats.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">No DMs yet. Open Chat to start one.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {unreadChats.map((row) => {
                const convo = convos.find((c) => c.id === row.conversation_id);
                let label = convo?.name || (convo?.type === "space" ? "Space" : convo?.type === "group" ? "Group" : "Chat");
                if (convo?.type === "dm") {
                  const other = members.find((m) => m.conversation_id === convo.id && m.user_id !== app.userId);
                  label = other ? displayName(peopleMap[other.user_id]) : "Direct message";
                }
                return (
                  <li key={row.conversation_id}>
                    <Link href={`/chat?c=${row.conversation_id}`} className="block hover:text-terracotta">
                      <span className="font-medium">{label}</span>
                      <span className="ml-2 rounded-full bg-terracotta px-1.5 text-[10px] text-white">
                        {row.unread_count}
                      </span>
                      {row.last_body ? <span className="mt-0.5 block truncate text-xs text-ink-soft">{row.last_body}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/chat" className="mt-3 inline-block text-sm text-terracotta">
            Open Chat
          </Link>
        </section>
      </div>
    </div>
  );
}
