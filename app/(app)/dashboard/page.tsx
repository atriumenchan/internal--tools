"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Warning } from "@phosphor-icons/react/dist/ssr/Warning";
import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr/ChatCircleDots";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { Eye } from "@phosphor-icons/react/dist/ssr/Eye";
import type { Icon } from "@phosphor-icons/react";
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
import { pingTaskAssigned } from "@/lib/ping-task";
import { useSilentLive } from "@/lib/silent-live";
import { canManageTask, effectiveReviewer, isAssignedByOther, missingWorkflowColumn } from "@/lib/task-workflow";
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
}: {
  label: string;
  value: number;
  href: string;
  icon: Icon;
  tone?: "neutral" | "info" | "warn" | "danger";
}) {
  const router = useRouter();
  const zero = value === 0;
  return (
    <Link
      href={href}
      onClick={(e) => {
        e.preventDefault();
        router.push(href);
      }}
      className={cn(
        "group block rounded-md border border-border border-t-[3px] bg-surface p-5 shadow-card",
        "transition duration-150 ease-out hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--amber-dim)]",
        tone === "danger" && "border-t-coral",
        tone === "warn" && "border-t-violet",
        tone === "info" && "border-t-teal",
        tone === "neutral" && "border-t-amber"
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-sm",
            tone === "danger" && "bg-coral-dim text-coral",
            tone === "warn" && "bg-violet-dim text-violet",
            tone === "info" && "bg-teal-dim text-teal",
            tone === "neutral" && "bg-amber-dim text-amber"
          )}
        >
          <Icon size={18} weight="light" />
        </span>
        <p className="text-[12px] font-medium text-muted">{label}</p>
      </div>
      <p
        className={cn(
          "tabular mt-3 text-[32px] font-semibold leading-none",
          zero && "text-faint",
          !zero && tone === "danger" && "text-coral",
          !zero && tone === "warn" && "text-violet",
          !zero && tone !== "danger" && tone !== "warn" && "text-ink"
        )}
      >
        {value}
      </p>
    </Link>
  );
}

function firstTaskHref(tasks: Task[], fallback: string) {
  if (tasks.length === 1) return `/spaces/${tasks[0].space_id}/tasks/${tasks[0].id}`;
  return fallback;
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

  const loadTasks = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }, []);

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
      if (operator) {
        const { data } = await supabase.from("attendance_days").select("*").eq("work_date", todayKey);
        setTeamToday((data ?? []) as AttendanceDay[]);
      }
      const mineRes = await fetch("/api/attendance/mine");
      if (mineRes.ok) {
        const mineJson = await mineRes.json();
        if (mineJson.linked && mineJson.employee) setEmployee(mineJson.employee as Employee);
        const ownDays = (mineJson.days ?? []) as AttendanceDay[];
        setToday(ownDays.find((d) => d.work_date === todayKey) ?? null);
        const ownSums = (mineJson.summaries ?? []) as MonthlySummary[];
        setSummary(ownSums.find((s) => s.period_year === year && s.period_month === month) ?? ownSums[0] ?? null);
      }
    })();
  }, [app, operator]);

  useSilentLive(() => void loadTasks(), "dashboard");

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
  const dueToday = useMemo(() => {
    const todayKey = kolkataTodayKey();
    return (tasks ?? []).filter(
      (t) =>
        t.assignee_id === app?.userId &&
        t.status !== "done" &&
        t.status !== "cancelled" &&
        dueDateKey(t.due_date) === todayKey
    );
  }, [tasks, app?.userId]);
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
          ? "Could not delete this task. Paste supabase/task-owner.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    setTasks((prev) => (prev ?? []).filter((t) => t.id !== taskId));
  }

  async function editTask(taskId: string, values: TaskDraft) {
    if (!app) return false;
    const current = (tasks ?? []).find((t) => t.id === taskId);
    if (!current || !canManageTask(current, { id: app.userId, email: app.profile.email, role: app.profile.role })) {
      setError("Only the person who created this task, or a manager, can change it. You can still comment.");
      return false;
    }
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
    if (assigneeId && assigneeId !== current.assignee_id) {
      pingTaskAssigned({
        title: (data as Task).title,
        assigneeName: displayName(peopleMap[assigneeId] || people.find((p) => p.id === assigneeId)),
        byName: displayName(app.profile),
        spaceName: spaceMap[(data as Task).space_id]?.name,
        due: (data as Task).due_date,
        path: `/spaces/${(data as Task).space_id}/tasks/${taskId}`,
      });
    }
    return true;
  }

  if (!app || tasks === null) return <PageFallback />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={formatWorkDate(kolkataTodayKey(), "long")}
      />
      <ErrorText className="mb-4">{error}</ErrorText>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="My tasks" value={mine.length} href={firstTaskHref(mine, "/spaces?filter=mine")} icon={ClipboardText} tone="neutral" />
        <Stat label="To review" value={needsReview.length} href={firstTaskHref(needsReview, "/spaces?filter=review")} icon={Eye} tone="warn" />
        <Stat label="Overdue" value={overdue.length} href={firstTaskHref(overdue, "/spaces?filter=overdue")} icon={Warning} tone="danger" />
        <Stat
          label="Unread chat"
          value={unreadChats.reduce((n, r) => n + r.unread_count, 0)}
          href="/chat"
          icon={ChatCircleDots}
          tone="info"
        />
      </div>

      {dueToday.length > 0 ? (
        <section className="mb-6 rounded-md border border-border bg-surface px-4 py-3 shadow-card">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-semibold tracking-tight">Due today</h2>
            <span className="tabular text-[12px] text-muted">{dueToday.length}</span>
          </div>
          <ul>
            {dueToday.slice(0, 4).map((task) => (
              <li key={task.id} className="border-t border-border first:border-t-0">
                <Link
                  href={`/spaces/${task.space_id}/tasks/${task.id}`}
                  className="flex min-w-0 items-center justify-between gap-3 py-1.5 text-[13px] hover:text-teal"
                >
                  <span className="truncate font-medium">{task.title}</span>
                  <span className="max-w-[40%] shrink-0 truncate text-[12px] text-muted">
                    {spaceMap[task.space_id]?.name || "Board"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {dueToday.length > 4 ? (
            <p className="pt-1 text-[12px] text-muted">+{dueToday.length - 4} more in Work below</p>
          ) : null}
        </section>
      ) : null}

      <div className="mb-6">
        <Announcements operator={operator} userId={app.userId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section>
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h2 className="font-display shrink-0 text-xl font-medium tracking-tight">Work</h2>
            <Segmented
              className="min-w-0"
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
              <div className="rounded-md border border-border bg-surface px-3 py-3 shadow-card">
                <p className="text-[12px] font-medium text-muted">Needs your action</p>
                <p className="mt-1 font-display text-2xl font-medium tabular">{needsAction.length}</p>
                <p className="mt-1 text-xs text-muted">Reviews, overdue, and new assigns.</p>
              </div>
              <div className="rounded-md border border-border bg-surface px-3 py-3 shadow-card">
                <p className="text-[12px] font-medium text-muted">Waiting on others</p>
                <p className="mt-1 font-display text-2xl font-medium tabular">{waiting.length}</p>
                <p className="mt-1 text-xs text-muted">Work you asked someone else for.</p>
              </div>
            </div>
          ) : null}
          {shown.length === 0 ? (
            <EmptyState>
              No tasks yet
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
                    onEdit={
                      canManageTask(task, { id: app.userId, email: app.profile.email, role: app.profile.role })
                        ? (values) => editTask(task.id, values)
                        : undefined
                    }
                    onDelete={
                      canManageTask(task, { id: app.userId, email: app.profile.email, role: app.profile.role })
                        ? () => deleteTask(task.id)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-md border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-medium">Boards</h2>
              <Link href="/spaces" className="text-xs font-medium text-teal hover:text-teal-soft">
                All
              </Link>
            </div>
            {spaces.length === 0 ? (
              <p className="mt-3 text-sm text-faint">No task boards yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {spaces.map((space) => (
                  <li key={space.id}>
                    <Link href={`/spaces/${space.id}`} className="flex items-center gap-2 text-sm transition duration-200 hover:text-teal">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: space.color || "var(--amber)" }} />
                      {space.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-md border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-medium">{operator ? "Attendance" : "Your day"}</h2>
              {operator ? (
                <Link href="/board" className="text-xs font-medium text-teal hover:text-teal-soft">
                  Full board
                </Link>
              ) : (
                <Link href="/my-attendance" className="text-xs font-medium text-teal hover:text-teal-soft">
                  Last week
                </Link>
              )}
            </div>
            {operator ? (
              <p className="mt-3 text-sm text-muted">
                Present {present} · Absent {absent}
              </p>
            ) : employee ? (
              <div className="mt-3 space-y-1 text-sm">
                <p>
                  {today ? today.status.replace("_", " ") : "No punch yet"}
                  {today?.hours_worked ? ` · ${hoursLabel(today.hours_worked)}` : ""}
                </p>
                {summary ? (
                  <p className="text-muted">
                    This month · present {summary.present_days} · absent {summary.absent_days} · late {summary.late_days}
                  </p>
                ) : (
                  <p className="text-muted">Month totals appear after the next Excel upload.</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Ask Ryan Ritabrata to link your login on Staff.</p>
            )}
          </section>

          <section className="rounded-md border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-medium">Chat</h2>
              <Link href="/chat" className="text-xs font-medium text-teal hover:text-teal-soft">
                Open
              </Link>
            </div>
            {unreadChats.length === 0 ? (
              <p className="mt-3 text-sm text-faint">No unread messages.</p>
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
                      <Link href={`/chat?c=${row.conversation_id}`} className="block hover:text-teal">
                        <span className="font-medium">{label}</span>
                        <span className="ml-2 rounded-sm bg-teal-dim px-1.5 font-mono text-[10px] font-medium text-teal">{row.unread_count}</span>
                        {row.last_body ? <span className="mt-0.5 block truncate text-xs text-muted">{row.last_body}</span> : null}
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
