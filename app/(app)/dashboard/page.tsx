"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ClipboardList, MessageCircle, Users, X } from "lucide-react";
import { JoinMeetButton } from "@/components/join-meet";
import { createClient } from "@/lib/supabase/client";
import { Button, EmptyState, ErrorText, Segmented } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { Announcements } from "@/components/announcements";
import { Avatar } from "@/components/avatar";
import { avatarSrc } from "@/lib/avatar";
import { TaskListRow, TaskRowHeader } from "@/components/task-card";
import { type TaskDraft } from "@/components/task-form";
import { isAdminUser } from "@/lib/admin";
import { canPostAnnouncements } from "@/lib/roles";
import { displayName, missingPriorityColumn } from "@/lib/spaces";
import { dueDateKey, formatRelative, formatWorkDate, hoursLabel, isOverdue, kolkataTodayKey, compareDueSoon, dueWhenLabel } from "@/lib/datetime";
import { unrepliedTaskMentions } from "@/lib/mentions";
import { readDismissedMentions, writeDismissedMentions } from "@/lib/dismissed-mentions";
import { Pager } from "@/components/pager";
import { paginate } from "@/lib/task-overview";
import { pingTaskAssigned, pingWhatsApp } from "@/lib/ping-task";
import { useSilentLive } from "@/lib/silent-live";
import { canManageTask, canDeleteTask, effectiveReviewer, isAssignedByOther, missingWorkflowColumn } from "@/lib/task-workflow";
import { missingHelpersTable, openHelpAsks, TASK_HELPERS_SQL_HINT } from "@/lib/task-helpers";
import { balanceHeadline, balanceNeedsAttention, type ApiBalance } from "@/lib/api-balances";
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
  accent,
}: {
  label: string;
  value: number;
  href: string;
  onSelect?: () => void;
  icon: typeof ClipboardList;
  accent: "brand" | "info" | "danger" | "success";
}) {
  const router = useRouter();
  const wash = {
    brand: "bg-[var(--brand-soft)] text-amber",
    info: "bg-[var(--info-soft)] text-[var(--info-ink)]",
    danger: "bg-coral-dim text-coral",
    success: "bg-teal-dim text-teal",
  }[accent];
  const edge = {
    brand: "border-t-amber",
    info: "border-t-[var(--info)]",
    danger: "border-t-coral",
    success: "border-t-teal",
  }[accent];
  return (
    <Link
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (onSelect) onSelect();
        else router.push(href);
      }}
      className={cn(
        "group flex h-[120px] flex-col justify-between rounded-[12px] border border-border border-t-2 bg-surface p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:hover:translate-y-0",
        edge
      )}
    >
      <span className="flex items-center gap-2.5">
        <span className={cn("grid h-8 w-8 place-items-center rounded-[8px]", wash)}>
          <Icon size={18} />
        </span>
        <span className="text-[13px] leading-5 font-semibold text-muted">{label}</span>
      </span>
      <span className="tabular text-[32px] leading-[38px] font-semibold text-ink">{value}</span>
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
  const [dismissedMentions, setDismissedMentions] = useState<string[]>([]);
  const [tagPage, setTagPage] = useState(1);
  const [balances, setBalances] = useState<ApiBalance[]>([]);

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

  const loadBalances = useCallback(async () => {
    const { data } = await createClient().from("api_balances").select("*").order("updated_at", { ascending: false });
    if (data) setBalances(data as ApiBalance[]);
  }, []);

  useEffect(() => {
    void loadBalances();
    const timer = window.setInterval(() => void loadBalances(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadBalances]);

  useEffect(() => {
    if (!app) return;
    const local = readDismissedMentions(app.userId);
    setDismissedMentions(local);
    void createClient()
      .from("mention_dismissals")
      .select("comment_id")
      .eq("user_id", app.userId)
      .then(({ data }) => {
        if (!data?.length) return;
        const next = Array.from(new Set([...local, ...data.map((row) => String(row.comment_id))]));
        writeDismissedMentions(app.userId, next);
        setDismissedMentions(next);
      });
  }, [app]);

  function dismissMention(commentId: string) {
    if (!app) return;
    setDismissedMentions((prev) => {
      if (prev.includes(commentId)) return prev;
      const next = [...prev, commentId];
      writeDismissedMentions(app.userId, next);
      return next;
    });
    void createClient().from("mention_dismissals").insert({ user_id: app.userId, comment_id: commentId });
  }

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
      .filter((row) => !helpTaskIds.has(row.taskId) && !dismissedMentions.includes(row.commentId));
  }, [app, taggedComments, myComments, people, tasks, helping, dismissedMentions]);
  const mentionPage = useMemo(() => paginate(waitingMentions, tagPage, 5), [waitingMentions, tagPage]);
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-[38px] font-bold tracking-[-0.03em] text-ink">Dashboard</h1>
          <p className="mt-1 text-[13px] leading-5 text-muted">Your workspace at a glance.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[13px] leading-5 text-muted">{formatWorkDate(kolkataTodayKey(), "long")}</p>
          <JoinMeetButton />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      {balances.some((row) => balanceNeedsAttention(row.status)) ? (
        <section id="api-balances" className="rounded-[14px] border border-coral/30 bg-coral-dim px-5 py-4">
          <h2 className="text-[16px] leading-6 font-semibold text-ink">API balances</h2>
          <ul className="mt-3 space-y-3">
            {balances
              .filter((row) => balanceNeedsAttention(row.status))
              .map((row) => (
                <li key={row.provider} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="text-[14px] font-bold text-ink">{balanceHeadline(row.label, row.status)}</span>
                    {row.message ? <span className="mt-0.5 block text-[13px] text-muted">{row.message}</span> : null}
                  </span>
                  <span className="text-[13px] font-semibold text-coral">
                    {row.status === "depleted" ? "Fill it up" : "Recharge soon"}
                    {row.balance ? ` · ${row.balance}` : ""}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="My tasks" value={mine.length} href={firstTaskHref(mine, "/tasks?slice=left&person=me")} icon={ClipboardList} accent="brand" />
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
          icon={Users}
          accent="info"
        />
        <Stat label="Overdue" value={overdue.length} href={firstTaskHref(overdue, "/tasks?slice=overdue")} icon={AlertCircle} accent="danger" />
        <Stat label="Unread chat" value={unreadChats.reduce((n, r) => n + r.unread_count, 0)} href="/chat" icon={MessageCircle} accent="success" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[12px] border border-border bg-surface px-5 py-4 shadow-card">
          <p className="text-[13px] font-medium text-muted">Needs your action</p>
          <p className="tabular mt-1 text-[28px] leading-none font-semibold text-ink">{actionCount}</p>
          <p className="mt-2 text-[12px] leading-[18px] text-muted">Reviews, overdue, new assigns, and tasks you are involved in.</p>
        </div>
        <div className="rounded-[12px] border border-border bg-surface px-5 py-4 shadow-card">
          <p className="text-[13px] font-medium text-muted">Waiting on others</p>
          <p className="tabular mt-1 text-[28px] leading-none font-semibold text-ink">{waiting.length}</p>
          <p className="mt-2 text-[12px] leading-[18px] text-muted">Work you asked someone else for.</p>
        </div>
      </div>

      <Announcements operator={canPostAnnouncements(app.profile) || operator} userId={app.userId} />

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <section id="work" className="scroll-mt-24 rounded-[14px] border border-border bg-surface p-5 shadow-elevated lg:col-span-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em] text-ink">Your work</h2>
              <p className="text-[13px] leading-5 text-muted">Everything that needs your attention.</p>
            </div>
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
            <div className="overflow-hidden rounded-[12px] border border-border">
            <div className="hidden border-b border-border bg-surface-2/60 md:block">
              <TaskRowHeader />
            </div>
            <ul>
              {shown.map((task) => (
                <li key={task.id}>
                  <TaskListRow
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
            </div>
          )}
        </section>

        <aside className="space-y-4 lg:col-span-4">
          <section className="rounded-[14px] border border-border bg-surface p-5 shadow-elevated">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em] text-ink">Tagged you</h2>
            <Link href="/notifications" className="text-[12px] font-semibold text-amber">
              View all
            </Link>
          </div>
          {waitingMentions.length === 0 ? (
            <p className="mt-6 text-[13px] leading-5 text-muted">No tags waiting for a reply.</p>
          ) : (
            <>
            <ul className="mt-4 divide-y divide-border">
              {mentionPage.rows.map((row) => (
                <li key={row.commentId} className="relative">
                  <Link href={row.href} className="flex gap-3 py-3 pr-8">
                    <Avatar name={displayName(peopleMap[row.authorId])} src={avatarSrc(peopleMap[row.authorId])} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-[14px] leading-5 font-bold text-ink">{displayName(peopleMap[row.authorId])} tagged you</span>
                      <span className="mt-0.5 block truncate text-[13px] leading-5 font-semibold text-ink">{row.taskTitle}</span>
                      {row.body ? <span className="mt-0.5 line-clamp-2 text-[13px] leading-5 font-normal text-muted">{row.body}</span> : null}
                      <span className="mt-1 block text-[12px] leading-4 text-muted">{formatRelative(row.createdAt)}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label="Remove this tag"
                    title="Remove"
                    onClick={() => dismissMention(row.commentId)}
                    className="absolute top-2.5 right-0 grid h-7 w-7 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            {waitingMentions.length > 5 ? (
              <Pager
                page={mentionPage.page}
                pages={mentionPage.pages}
                start={mentionPage.start}
                end={mentionPage.end}
                total={waitingMentions.length}
                onChange={setTagPage}
              />
            ) : null}
            </>
          )}
          </section>

          <section className="rounded-[14px] border border-border bg-surface p-5 shadow-elevated">
            <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em] text-ink">Coming up</h2>
            {dueSoon.length === 0 ? (
              <p className="mt-4 text-[13px] leading-5 text-muted">Nothing is due on your tasks.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {dueSoon.slice(0, 6).map((task) => {
                  const when = dueWhenLabel(task.due_date, task.status);
                  const due = formatWorkDate(task.due_date);
                  const late = isOverdue(task.due_date, task.status);
                  return (
                    <li key={task.id}>
                      <Link href={`/spaces/${task.space_id}/tasks/${task.id}`} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className={cn("block text-[11px] leading-4 font-semibold", late ? "text-coral" : "text-amber")}>{when || "Scheduled"}</span>
                          <span className="mt-0.5 block truncate text-[13px] leading-5 font-medium text-ink">{task.title}</span>
                        </span>
                        <span className="shrink-0 text-[12px] text-muted">{due}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-[14px] border border-border bg-surface p-5 shadow-elevated">
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em] text-ink">Boards</h2>
              <Link href="/spaces" className="text-[12px] font-semibold text-amber">All</Link>
            </div>
            {spaces.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted">No task boards yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {spaces.map((space) => (
                  <li key={space.id}>
                    <Link href={`/spaces/${space.id}`} className="flex items-center gap-2 text-[13px] text-ink hover:text-amber">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: space.color || "var(--amber)" }} />
                      {space.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[14px] border border-border bg-surface p-5 shadow-elevated">
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em] text-ink">{operator ? "Attendance" : "Your day"}</h2>
              <Link href={operator ? "/board" : "/my-attendance"} className="text-[12px] font-semibold text-amber">
                {operator ? "Full board" : "Last week"}
              </Link>
            </div>
            {operator ? (
              <p className="mt-3 text-[13px] text-muted">Present {present} · Absent {absent}</p>
            ) : employee ? (
              <div className="mt-3 space-y-1 text-[13px]">
                <p>
                  {today ? today.status.replace("_", " ") : "No punch yet"}
                  {today?.hours_worked ? ` · ${hoursLabel(today.hours_worked)}` : ""}
                </p>
                {summary ? (
                  <p className="text-muted">This month · present {summary.present_days} · absent {summary.absent_days} · late {summary.late_days}</p>
                ) : (
                  <p className="text-muted">Month totals appear after the next Excel upload.</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-muted">Ask Ryan Ritabrata to link your login on Staff.</p>
            )}
            {admin && wfhPending > 0 ? (
              <Link href="/wfh" className="mt-3 block text-[13px] font-semibold text-amber">
                {wfhPending} WFH {wfhPending === 1 ? "request" : "requests"} waiting
              </Link>
            ) : (
              <Link href="/wfh" className="mt-3 block text-[13px] font-semibold text-teal">WFH</Link>
            )}
          </section>

          <section className="rounded-[14px] border border-border bg-surface p-5 shadow-elevated">
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em] text-ink">Chat</h2>
              <Link href="/chat" className="text-[12px] font-semibold text-amber">Open</Link>
            </div>
            {unreadChats.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">No unread messages.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {unreadChats.map((row) => {
                  const convo = convos.find((c) => c.id === row.conversation_id);
                  let label = convo?.name || "Chat";
                  if (convo?.type === "dm") {
                    const other = members.find((m) => m.conversation_id === convo.id && m.user_id !== app.userId);
                    label = other ? displayName(peopleMap[other.user_id]) : "Direct message";
                  }
                  return (
                    <li key={row.conversation_id}>
                      <Link href={`/chat?c=${row.conversation_id}`} className="block text-[13px] hover:text-amber">
                        <span className="font-medium">{label}</span>
                        <span className="ml-2 tabular text-[12px] text-teal">{row.unread_count}</span>
                        {row.last_body ? <span className="mt-0.5 block truncate text-[12px] text-muted">{inboxPreview(row.last_body)}</span> : null}
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
