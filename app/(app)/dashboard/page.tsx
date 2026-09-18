"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, LayoutList, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, ErrorText, PageHeader, Segmented } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { Announcements } from "@/components/announcements";
import { TaskCard } from "@/components/task-card";
import { type TaskDraft } from "@/components/task-form";
import { isAdminUser } from "@/lib/admin";
import { displayName, missingPriorityColumn } from "@/lib/spaces";
import { dueDateKey, formatWorkDate, hoursLabel, isOverdue, kolkataTodayKey } from "@/lib/datetime";
import { effectiveReviewer, isAssignedByOther, missingWorkflowColumn } from "@/lib/task-workflow";
import { cn } from "@/lib/utils";
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
  icon: Icon,
  tone = "neutral",
  onSelect,
}: {
  label: string;
  value: number;
  href: string;
  icon: typeof LayoutList;
  tone?: "neutral" | "info" | "warn" | "danger";
  onSelect?: () => void;
}) {
  const zero = value === 0;
  return (
    <Link
      href={href}
      onClick={onSelect}
      className="group block rounded-[10px] border border-rule bg-surface p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] transition duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-[8px]",
            tone === "danger" && "bg-danger/15 text-danger",
            tone === "warn" && "bg-warning/15 text-warning",
            tone === "info" && "bg-blue/15 text-blue-soft",
            tone === "neutral" && "bg-white/[0.06] text-ink-soft"
          )}
        >
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <p className="text-[12px] font-medium text-ink-soft">{label}</p>
      </div>
      <p
        className={cn(
          "tabular mt-3 text-[32px] font-semibold leading-none",
          zero && "text-muted",
          !zero && tone === "danger" && "text-danger",
          !zero && tone === "warn" && "text-warning",
          !zero && tone !== "danger" && tone !== "warn" && "text-ink"
        )}
      >
        {value}
      </p>
    </Link>
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
  const [workFilter, setWorkFilter] = useState<"mine" | "requested" | "review" | "done" | "overdue">("mine");
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    const work = new URLSearchParams(window.location.search).get("work");
    if (work === "mine" || work === "requested" || work === "review" || work === "done" || work === "overdue") {
      setWorkFilter(work);
    }
  }, []);

  const peopleMap = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const spaceMap = useMemo(() => Object.fromEntries(spaces.map((s) => [s.id, s])), [spaces]);

  const mine = useMemo(
    () => (tasks ?? []).filter((t) => t.assignee_id === app?.userId && t.status !== "done" && t.status !== "cancelled"),
    [tasks, app?.userId]
  );
  const requested = useMemo(
    () =>
      (tasks ?? []).filter(
        (t) => t.created_by === app?.userId && isAssignedByOther(t) && t.status !== "done" && t.status !== "cancelled"
      ),
    [tasks, app?.userId]
  );
  const needsReview = useMemo(
    () => (tasks ?? []).filter((t) => t.status === "in_review" && effectiveReviewer(t) === app?.userId),
    [tasks, app?.userId]
  );
  const completed = useMemo(
    () =>
      (tasks ?? []).filter(
        (t) =>
          t.status === "done" &&
          (t.assignee_id === app?.userId || t.created_by === app?.userId || t.reviewer_id === app?.userId)
      ),
    [tasks, app?.userId]
  );
  const overdue = useMemo(() => (tasks ?? []).filter((t) => isOverdue(t.due_date, t.status)), [tasks]);
  const waiting = requested.filter((t) => t.status === "in_review" || (t.assignee_id && t.assignee_id !== app?.userId));
  const needsAction = useMemo(() => {
    const seen = new Set<string>();
    const rows: Task[] = [];
    for (const task of [...needsReview, ...overdue.filter((t) => t.assignee_id === app?.userId), ...mine.filter((t) => t.status === "open")]) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      rows.push(task);
    }
    return rows;
  }, [needsReview, overdue, mine, app?.userId]);
  const unreadChats = inbox.filter((row) => row.unread_count > 0);
  const present = teamToday.filter((d) => d.status === "present" || d.status === "half_day").length;
  const absent = teamToday.filter((d) => d.status === "absent").length;

  const shown =
    workFilter === "requested"
      ? requested
      : workFilter === "review"
        ? needsReview
        : workFilter === "done"
          ? completed
          : workFilter === "overdue"
            ? overdue
            : mine;

  async function deleteTask(taskId: string) {
    const supabase = createClient();
    const { error: err } = await supabase.from("tasks").delete().eq("id", taskId);
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy")
          ? "Could not delete this task. Paste supabase/deletes.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    setTasks((prev) => (prev ?? []).filter((t) => t.id !== taskId));
  }

  async function editTask(taskId: string, values: TaskDraft) {
    if (!app) return false;
    const supabase = createClient();
    const assigneeId = values.assigneeId || null;
    const payload = {
      title: values.title.trim(),
      description: values.comment.trim() || null,
      completion_criteria: values.criteria.trim() || null,
      assignee_id: assigneeId,
      due_date: dueDateKey(values.dueDate),
      priority: values.priority,
    };
    const { data, error: err } = await supabase.from("tasks").update(payload).eq("id", taskId).select("*").single();
    if (err || !data) {
      setError(
        missingPriorityColumn(err?.message) || missingWorkflowColumn(err?.message)
          ? "Task review needs a SQL patch. Paste supabase/workspace-lite.sql in the Supabase SQL editor, then refresh."
          : err?.message || "Could not save the task."
      );
      return false;
    }
    setTasks((prev) => (prev ?? []).map((t) => (t.id === taskId ? (data as Task) : t)));
    return true;
  }

  if (!app || tasks === null) return <PageFallback />;

  return (
    <div>
      <PageHeader
        title="Home"
        description={formatWorkDate(kolkataTodayKey(), "long")}
      />
      <ErrorText className="mb-4">{error}</ErrorText>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="My tasks" value={mine.length} href="/dashboard?work=mine" icon={LayoutList} tone="neutral" onSelect={() => setWorkFilter("mine")} />
        <Stat label="To review" value={needsReview.length} href="/dashboard?work=review" icon={Eye} tone="warn" onSelect={() => setWorkFilter("review")} />
        <Stat label="Overdue" value={overdue.length} href="/dashboard?work=overdue" icon={AlertTriangle} tone="danger" onSelect={() => setWorkFilter("overdue")} />
        <Stat
          label="Unread chat"
          value={unreadChats.reduce((n, r) => n + r.unread_count, 0)}
          href="/chat"
          icon={MessageSquare}
          tone="info"
        />
      </div>

      <div className="mb-6">
        <Announcements operator={operator} userId={app.userId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Work</h2>
            <Segmented
              value={workFilter}
              onChange={setWorkFilter}
              options={[
                { id: "mine", label: "Mine" },
                { id: "requested", label: "Requested" },
                { id: "review", label: "Review" },
                { id: "overdue", label: "Overdue" },
                { id: "done", label: "Done" },
              ]}
            />
          </div>
          {workFilter === "mine" && (needsAction.length > 0 || waiting.length > 0) ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[12px] border border-rule bg-surface px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Needs your action</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{needsAction.length}</p>
                <p className="mt-1 text-xs text-ink-soft">Reviews, overdue, and new assigns.</p>
              </div>
              <div className="rounded-[12px] border border-rule bg-surface px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Waiting on others</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{waiting.length}</p>
                <p className="mt-1 text-xs text-ink-soft">Work you asked someone else for.</p>
              </div>
            </div>
          ) : null}
          {shown.length === 0 ? (
            <EmptyState>
              Nothing in this list. Open Tasks to add work to a board.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {shown.map((task) => (
                <li key={task.id}>
                  <TaskCard
                    task={task}
                    href={`/spaces/${task.space_id}/tasks/${task.id}`}
                    spaceName={spaceMap[task.space_id]?.name}
                    assignee={task.assignee_id ? peopleMap[task.assignee_id] : null}
                    members={people}
                    onEdit={(values) => editTask(task.id, values)}
                    onDelete={() => deleteTask(task.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-rule bg-cream p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Boards</h2>
              <Link href="/spaces" className="text-xs font-medium text-blue-soft hover:text-blue">
                All
              </Link>
            </div>
            {spaces.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No task boards yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {spaces.map((space) => (
                  <li key={space.id}>
                    <Link href={`/spaces/${space.id}`} className="flex items-center gap-2 text-sm transition duration-200 hover:text-blue-soft">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: space.color || "#FF5A1F" }} />
                      {space.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-rule bg-cream p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{operator ? "Attendance" : "Your day"}</h2>
              {operator ? (
                <Link href="/board" className="text-xs font-medium text-blue-soft hover:text-blue">
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

          <section className="rounded-xl border border-rule bg-cream p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Chat</h2>
              <Link href="/chat" className="text-xs font-medium text-blue-soft hover:text-blue">
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
                      <Link href={`/chat?c=${row.conversation_id}`} className="block hover:text-blue-soft">
                        <span className="font-medium">{label}</span>
                        <span className="ml-2 rounded-md bg-blue/15 px-1.5 text-[10px] font-semibold text-blue-soft">{row.unread_count}</span>
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
