"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Warning } from "@phosphor-icons/react/dist/ssr/Warning";
import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr/ChatCircleDots";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { Handshake } from "@phosphor-icons/react/dist/ssr/Handshake";
import { JoinMeetButton } from "@/components/join-meet";
import type { Icon } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { Button, EmptyState, ErrorText, PageHeader, Segmented } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { Announcements } from "@/components/announcements";
import { TaskCard } from "@/components/task-card";
import { type TaskDraft } from "@/components/task-form";
import { isAdminUser } from "@/lib/admin";
import { canPostAnnouncements } from "@/lib/roles";
import { displayName, missingPriorityColumn } from "@/lib/spaces";
import { dueDateKey, formatRelative, formatWorkDate, hoursLabel, isOverdue, kolkataTodayKey, compareDueSoon, dueWhenLabel } from "@/lib/datetime";
import { unrepliedTaskMentions } from "@/lib/mentions";
import { reportPeriodLabel } from "@/lib/reports";
import { pingTaskAssigned, pingWhatsApp } from "@/lib/ping-task";
import { useSilentLive } from "@/lib/silent-live";
import { canManageTask, canDeleteTask, effectiveReviewer, isAssignedByOther, missingWorkflowColumn } from "@/lib/task-workflow";
import { missingHelpersTable, openHelpAsks, TASK_HELPERS_SQL_HINT } from "@/lib/task-helpers";
import { inboxPreview } from "@/lib/chat-thread";
import { cn } from "@/lib/utils";
import type {
  AttendanceDay,
  Conversation,
  Employee,
  MonthlySummary,
  Profile,
  Space,
  Task,
  TaskComment,
  TaskHelper,
} from "@/lib/types";

type WorkFilter = "mine" | "requested" | "involved" | "done" | "overdue";

type InboxRow = {
  conversation_id: string;
  unread_count: number;
  last_body: string | null;
};

function Stat({
  label,
  value,
  href,
  onSelect,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href: string;
  onSelect?: () => void;
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
        if (onSelect) onSelect();
        else router.push(href);
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
  const [workFilter, setWorkFilter] = useState<WorkFilter>("mine");
  const [helpRows, setHelpRows] = useState<TaskHelper[]>([]);
  const [helpBusy, setHelpBusy] = useState<string | null>(null);
  const knownTaskIds = useRef<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wfhPending, setWfhPending] = useState(0);
  const [taggedComments, setTaggedComments] = useState<Pick<TaskComment, "id" | "task_id" | "author_id" | "body" | "created_at">[]>([]);
  const [myComments, setMyComments] = useState<Pick<TaskComment, "task_id" | "created_at">[]>([]);

  const loadTasks = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }, []);

  const loadHelping = useCallback(async () => {
    if (!app) return;
    const { data, error: err } = await createClient().from("task_helpers").select("*").eq("user_id", app.userId);
    if (err) return;
    const rows = (data ?? []) as TaskHelper[];
    setHelpRows(rows);
    if (knownTaskIds.current && rows.some((h) => !knownTaskIds.current?.has(h.task_id))) void loadTasks();
  }, [app, loadTasks]);

  useEffect(() => {
    void loadHelping();
  }, [loadHelping]);

  useEffect(() => {
    knownTaskIds.current = tasks ? new Set(tasks.map((t) => t.id)) : null;
  }, [tasks]);

  const loadMentions = useCallback(async () => {
    if (!app) return;
    const supabase = createClient();
    const [taggedRes, mineRes] = await Promise.all([
      supabase
        .from("task_comments")
        .select("id, task_id, author_id, body, created_at")
        .ilike("body", "%@%")
        .neq("author_id", app.userId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("task_comments").select("task_id, created_at").eq("author_id", app.userId),
    ]);
    if (taggedRes.data) setTaggedComments(taggedRes.data);
    if (mineRes.data) setMyComments(mineRes.data);
  }, [app]);

  useEffect(() => {
    if (!app) return;
    const supabase = createClient();
    const todayKey = kolkataTodayKey();
    const [year, month] = todayKey.split("-").map(Number);

    void (async () => {
      const [taskRes, spaceRes, peopleRes, inboxRes, convRes, empRes, memberRes, taggedRes, myCommentRes] = await Promise.all([
        supabase.from("tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("spaces").select("*").order("name"),
        supabase.from("profiles").select("*"),
        supabase.rpc("chat_inbox"),
        supabase.from("conversations").select("*"),
        supabase.from("employees").select("*").eq("user_id", app.userId).maybeSingle(),
        supabase.from("conversation_members").select("conversation_id, user_id"),
        supabase
          .from("task_comments")
          .select("id, task_id, author_id, body, created_at")
          .ilike("body", "%@%")
          .neq("author_id", app.userId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("task_comments").select("task_id, created_at").eq("author_id", app.userId),
      ]);
      setTasks((taskRes.data ?? []) as Task[]);
      setSpaces((spaceRes.data ?? []) as Space[]);
      setPeople((peopleRes.data ?? []) as Profile[]);
      setInbox((inboxRes.data ?? []) as InboxRow[]);
      setConvos((convRes.data ?? []) as Conversation[]);
      setMembers((memberRes.data ?? []) as { conversation_id: string; user_id: string }[]);
      setTaggedComments(taggedRes.data ?? []);
      setMyComments(myCommentRes.data ?? []);
      const me = (empRes.data as Employee | null) ?? null;
      setEmployee(me);
      if (admin) {
        const { count } = await supabase.from("wfh_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
        setWfhPending(count ?? 0);
      }
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
  }, [app, operator, admin]);

  useSilentLive(() => {
    void loadTasks();
    void loadHelping();
  }, "dashboard");

  useEffect(() => {
    if (!app) return;
    const supabase = createClient();
    const channel = supabase
      .channel("dashboard-mentions")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, () => {
        void loadMentions();
        void loadHelping();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_helpers", filter: `user_id=eq.${app.userId}` },
        () => {
          void loadHelping();
          void loadTasks();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [app, loadMentions, loadHelping, loadTasks]);

  useEffect(() => {
    const work = new URLSearchParams(window.location.search).get("work");
    if (work === "mine" || work === "requested" || work === "involved" || work === "done" || work === "overdue") {
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
  const helping = useMemo(
    () => (app ? openHelpAsks(helpRows, tasks ?? [], app.userId) : []),
    [helpRows, tasks, app]
  );
  const mineWithReviews = useMemo(() => {
    const ids = new Set(mine.map((t) => t.id));
    return [...mine, ...needsReview.filter((t) => !ids.has(t.id))];
  }, [mine, needsReview]);
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
  const dueSoon = useMemo(() => {
    return [...(tasks ?? [])]
      .filter(
        (t) =>
          t.assignee_id === app?.userId &&
          t.status !== "done" &&
          t.status !== "cancelled" &&
          Boolean(dueDateKey(t.due_date))
      )
      .sort(compareDueSoon);
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
  const actionCount = useMemo(() => {
    const ids = new Set(needsAction.map((t) => t.id));
    for (const row of helping) ids.add(row.task.id);
    return ids.size;
  }, [needsAction, helping]);
  const unreadChats = inbox.filter((row) => row.unread_count > 0);
  const waitingMentions = useMemo(() => {
    if (!app) return [];
    const helpTaskIds = new Set(helping.map((row) => row.task.id));
    return unrepliedTaskMentions({
      comments: taggedComments,
      myComments,
      me: { ...app.profile, id: app.userId },
      people,
      tasks: tasks ?? [],
    })
      .filter((row) => !helpTaskIds.has(row.taskId))
      .slice(0, 8);
  }, [app, taggedComments, myComments, people, tasks, helping]);
  const present = teamToday.filter((d) => d.status === "present" || d.status === "half_day").length;
  const absent = teamToday.filter((d) => d.status === "absent").length;

  const shown = useMemo(() => {
    const rows =
      workFilter === "requested"
        ? requested
        : workFilter === "done"
          ? completed
          : workFilter === "overdue"
            ? overdue
            : mineWithReviews;
    return [...rows].sort(compareDueSoon);
  }, [workFilter, requested, completed, overdue, mineWithReviews]);

  async function finishHelp(task: Task) {
    setHelpBusy(task.id);
    const { error: err } = await createClient().rpc("set_task_help_done", { p_task_id: task.id, p_done: true });
    setHelpBusy(null);
    if (err) {
      setError(missingHelpersTable(err.message) ? TASK_HELPERS_SQL_HINT : err.message);
      return;
    }
    const doneAt = new Date().toISOString();
    setHelpRows((prev) =>
      prev.map((h) => (h.task_id === task.id && h.user_id === app?.userId ? { ...h, status: "done", done_at: doneAt } : h))
    );
    void pingWhatsApp(`/spaces/${task.space_id}/tasks/${task.id}`);
  }

  async function deleteTask(taskId: string) {
    const supabase = createClient();
    const { error: err } = await supabase.from("tasks").delete().eq("id", taskId);
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy")
          ? "Could not delete this task. Paste supabase/task-delete.sql in the Supabase SQL editor, then try again."
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
        assigneeId,
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
        actions={<JoinMeetButton />}
      />
      <ErrorText className="mb-4">{error}</ErrorText>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="My tasks" value={mine.length} href={firstTaskHref(mine, "/tasks?slice=left&person=me")} icon={ClipboardText} tone="neutral" />
        <Stat
          label="Involved"
          value={helping.length}
          href={helping.length === 1 ? `/spaces/${helping[0].task.space_id}/tasks/${helping[0].task.id}` : "/dashboard?work=involved"}
          onSelect={
            helping.length === 1
              ? undefined
              : () => {
                  setWorkFilter("involved");
                  document.getElementById("work")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
          }
          icon={Handshake}
          tone="warn"
        />
        <Stat label="Overdue" value={overdue.length} href={firstTaskHref(overdue, "/tasks?slice=overdue")} icon={Warning} tone="danger" />
        <Stat
          label="Unread chat"
          value={unreadChats.reduce((n, r) => n + r.unread_count, 0)}
          href="/chat"
          icon={ChatCircleDots}
          tone="info"
        />
      </div>

      {dueSoon.length > 0 ? (
        <section className="mb-6 rounded-md border border-border bg-surface px-4 py-3 shadow-card">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-semibold tracking-tight">Coming due</h2>
            <span className="tabular text-[12px] text-muted">{dueSoon.length}</span>
          </div>
          <ul>
            {dueSoon.slice(0, 6).map((task) => {
              const when = dueWhenLabel(task.due_date, task.status);
              const due = formatWorkDate(task.due_date);
              const late = isOverdue(task.due_date, task.status);
              return (
                <li key={task.id} className="border-t border-border first:border-t-0">
                  <Link
                    href={`/spaces/${task.space_id}/tasks/${task.id}`}
                    className="flex min-w-0 items-center justify-between gap-3 py-1.5 text-[13px] hover:text-teal"
                  >
                    <span className="truncate font-medium">{task.title}</span>
                    <span className={cn("shrink-0 text-[12px] font-medium", late ? "text-coral" : "text-teal")}>
                      {when && due && due !== "—" ? `${when} · ${due}` : when || due}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="mb-6">
        <Announcements operator={canPostAnnouncements(app.profile) || operator} userId={app.userId} />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link
          href="/reports?kind=weekly"
          className="rounded-md border border-border bg-surface px-4 py-3 hover:border-border-strong"
        >
          <p className="text-[13px] font-semibold">Weekly report</p>
          <p className="mt-1 text-[12px] text-muted">This week · {reportPeriodLabel("weekly")}</p>
        </Link>
        <Link
          href="/reports?kind=monthly"
          className="rounded-md border border-border bg-surface px-4 py-3 hover:border-border-strong"
        >
          <p className="text-[13px] font-semibold">Monthly report</p>
          <p className="mt-1 text-[12px] text-muted">This month · {reportPeriodLabel("monthly")}</p>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section id="work" className="scroll-mt-24">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h2 className="font-display shrink-0 text-xl font-medium tracking-tight">Work</h2>
            <Segmented
              className="min-w-0"
              value={workFilter}
              onChange={setWorkFilter}
              options={[
                { id: "mine", label: "Mine" },
                { id: "requested", label: "Requested" },
                { id: "involved", label: "Involved" },
                { id: "overdue", label: "Overdue" },
                { id: "done", label: "Done" },
              ]}
            />
          </div>
          {workFilter === "mine" && (actionCount > 0 || waiting.length > 0) ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-surface px-3 py-3 shadow-card">
                <p className="text-[12px] font-medium text-muted">Needs your action</p>
                <p className="mt-1 font-display text-2xl font-medium tabular">{actionCount}</p>
                <p className="mt-1 text-xs text-muted">Reviews, overdue, new assigns, and tasks you are involved in.</p>
              </div>
              <div className="rounded-md border border-border bg-surface px-3 py-3 shadow-card">
                <p className="text-[12px] font-medium text-muted">Waiting on others</p>
                <p className="mt-1 font-display text-2xl font-medium tabular">{waiting.length}</p>
                <p className="mt-1 text-xs text-muted">Work you asked someone else for.</p>
              </div>
            </div>
          ) : null}
          {workFilter === "involved" ? (
            helping.length === 0 ? (
              <EmptyState>
                {"You're not involved in anyone else's tasks right now. When someone @mentions you on a task, it shows up here."}
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {helping.map(({ helper, task }) => {
                  const asker = helper.added_by ? peopleMap[helper.added_by] : undefined;
                  const href = `/spaces/${task.space_id}/tasks/${task.id}${helper.comment_id ? `#comment-${helper.comment_id}` : ""}`;
                  return (
                    <li key={task.id} className="rounded-md border border-border bg-surface px-4 py-3 shadow-card">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <Link href={href} className="group min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium group-hover:text-teal">{task.title}</p>
                          <p className="mt-0.5 text-[12px] text-muted">
                            {[spaceMap[task.space_id]?.name, `Asked by ${displayName(asker)}`, formatRelative(helper.created_at)]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {helper.ask ? (
                            <p className="mt-1.5 line-clamp-2 text-[13px] text-ink">{inboxPreview(helper.ask)}</p>
                          ) : null}
                        </Link>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={helpBusy === task.id}
                          onClick={() => void finishHelp(task)}
                        >
                          {helpBusy === task.id ? "Saving…" : "Mark my part done"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : shown.length === 0 ? (
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
                    requester={peopleMap[task.created_by] ?? null}
                    assignee={task.assignee_id ? peopleMap[task.assignee_id] : null}
                    members={people}
                    onEdit={
                      canManageTask(task, { id: app.userId, email: app.profile.email, role: app.profile.role })
                        ? (values) => editTask(task.id, values)
                        : undefined
                    }
                    onDelete={
                      canDeleteTask(task, { id: app.userId, email: app.profile.email, role: app.profile.role })
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
              <h2 className="font-display font-medium">Tagged you</h2>
              {waitingMentions.length > 0 ? (
                <span className="tabular rounded-sm bg-amber-dim px-1.5 font-mono text-[10px] font-medium text-amber">
                  {waitingMentions.length}
                </span>
              ) : null}
            </div>
            {waitingMentions.length === 0 ? (
              <p className="mt-3 text-sm text-faint">No tags waiting for a reply.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {waitingMentions.map((row) => (
                  <li key={row.commentId}>
                    <Link href={row.href} className="block rounded-sm py-0.5 hover:text-teal">
                      <span className="block text-sm font-medium">
                        {displayName(peopleMap[row.authorId])} tagged you
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{row.taskTitle}</span>
                      {row.body ? (
                        <span className="mt-0.5 block truncate text-xs text-muted">{inboxPreview(row.body)}</span>
                      ) : null}
                      <span className="mt-0.5 block font-mono text-[11px] text-faint">{formatRelative(row.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
            {admin && wfhPending > 0 ? (
              <Link href="/wfh" className="mt-3 block text-[13px] font-medium text-amber">
                {wfhPending} WFH {wfhPending === 1 ? "request" : "requests"} waiting
              </Link>
            ) : (
              <Link href="/wfh" className="mt-3 block text-[13px] font-medium text-teal">
                WFH
              </Link>
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
                        {row.last_body ? <span className="mt-0.5 block truncate text-xs text-muted">{inboxPreview(row.last_body)}</span> : null}
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
