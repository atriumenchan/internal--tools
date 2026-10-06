"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Select, Input } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState, useWorkspaceCache } from "@/components/app-frame";
import { TaskListRow } from "@/components/task-card";
import { type TaskDraft } from "@/components/task-form";
import { Segmented } from "@/components/overflow-strip";
import { DatePicker } from "@/components/date-picker";
import { Pager } from "@/components/pager";
import { isAdminUser, isIgnoredEmployee } from "@/lib/admin";
import { displayName, missingPriorityColumn, missingSpacesSchema } from "@/lib/spaces";
import { compareDueSoon, dueDateKey, kolkataTodayKey } from "@/lib/datetime";
import { useSilentLive } from "@/lib/silent-live";
import { pingTaskAssigned } from "@/lib/ping-task";
import { applyTaskStatus, canDeleteTask, canManageTask, canMoveTask, missingWorkflowColumn } from "@/lib/task-workflow";
import { parseTaskSlice, sliceTasks, taskSliceCounts, tasksForPerson, filterTasksByDue, matchTaskQuery, paginate, type TaskSlice } from "@/lib/task-overview";
import type { Profile, Space, Task, TaskStatus } from "@/lib/types";

function TasksPageInner() {
  const app = useAppState();
  const cache = useWorkspaceCache();
  const router = useRouter();
  const search = useSearchParams();
  const admin = app ? isAdminUser(app.profile) : false;
  const slice = parseTaskSlice(search.get("slice") || search.get("filter"));
  const personParam = search.get("person");
  const person = admin ? personParam || "all" : "me";
  const due = dueDateKey(search.get("due"));
  const pageParam = Math.max(1, Number(search.get("page") || 1) || 1);
  const [query, setQuery] = useState(search.get("q") || "");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const todayKey = kolkataTodayKey();
  const actor = app ? { id: app.userId, email: app.profile.email, role: app.profile.role } : null;

  const loadTasks = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("spaces").select("id, name, color, created_by, created_at").order("name"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("full_name"),
    ]).then(([spaceRes, taskRes, peopleRes]) => {
      if (spaceRes.error) {
        setError(
          missingSpacesSchema(spaceRes.error.message)
            ? "Task boards are not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor, then refresh."
            : spaceRes.error.message
        );
      }
      setSpaces((spaceRes.data ?? []) as Space[]);
      setTasks((taskRes.data ?? []) as Task[]);
      setPeople((peopleRes.data ?? []) as Profile[]);
    });
  }, []);

  useSilentLive(() => void loadTasks(), "tasks");

  const peopleMap = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const spaceMap = useMemo(() => Object.fromEntries(spaces.map((s) => [s.id, s])), [spaces]);
  const ignoredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const employee of cache?.employees ?? []) {
      if (employee.user_id && isIgnoredEmployee(employee.employee_code, employee.full_name)) ids.add(employee.user_id);
    }
    return ids;
  }, [cache?.employees]);

  const scoped = useMemo(() => tasksForPerson(tasks ?? [], person, app?.userId), [tasks, person, app?.userId]);
  const sliceCounts = useMemo(() => taskSliceCounts(scoped, todayKey), [scoped, todayKey]);
  const listed = useMemo(() => {
    const rows = sliceTasks(scoped, slice, todayKey);
    const dated = filterTasksByDue(rows, due);
    const found = dated.filter((task) =>
      matchTaskQuery(task, query, {
        spaceName: spaceMap[task.space_id]?.name,
        assignee: task.assignee_id ? displayName(peopleMap[task.assignee_id]) : "Unassigned",
        requester: displayName(peopleMap[task.created_by]),
      })
    );
    if (slice === "closed") {
      return [...found].sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
    }
    return [...found].sort(compareDueSoon);
  }, [scoped, slice, todayKey, due, query, spaceMap, peopleMap]);
  const paged = useMemo(() => paginate(listed, pageParam), [listed, pageParam]);

  const peopleOptions = useMemo(() => {
    const rows: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    const myId = app?.userId;
    for (const employee of cache?.employees ?? []) {
      if (!employee.user_id || employee.user_id === myId || seen.has(employee.user_id)) continue;
      if (isIgnoredEmployee(employee.employee_code, employee.full_name)) continue;
      seen.add(employee.user_id);
      rows.push({ id: employee.user_id, label: `${employee.employee_code} · ${employee.full_name}` });
    }
    for (const profile of people) {
      if (!profile.id || profile.id === myId || seen.has(profile.id) || ignoredIds.has(profile.id)) continue;
      seen.add(profile.id);
      rows.push({ id: profile.id, label: displayName(profile) });
    }
    return rows;
  }, [cache?.employees, people, app?.userId, ignoredIds]);

  function setOverview(next: { slice?: TaskSlice; person?: string; due?: string | null; page?: number }) {
    const params = new URLSearchParams();
    params.set("slice", next.slice ?? slice);
    if (admin) params.set("person", next.person ?? person);
    const dueNext = next.due === undefined ? due : next.due;
    if (dueNext) params.set("due", dueNext);
    const pageNext = next.page ?? 1;
    if (pageNext > 1) params.set("page", String(pageNext));
    router.replace(`/tasks?${params.toString()}`);
  }

  async function setStatus(taskId: string, status: TaskStatus) {
    const current = (tasks ?? []).find((t) => t.id === taskId);
    if (!current || current.status === status || !app) return;
    const next = applyTaskStatus(current, status, app.userId, app.profile);
    if (next.error && next.status === current.status) {
      setError(next.error);
      return;
    }
    setTasks((prev) => (prev ?? []).map((t) => (t.id === taskId ? { ...t, status: next.status } : t)));
    const supabase = createClient();
    const { data, error: err } = await supabase.from("tasks").update({ status: next.status }).eq("id", taskId).select("*").single();
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy") || err.message.includes("created this task")
          ? "Could not move this task. Paste supabase/assignee-move.sql in the Supabase SQL editor, then try again."
          : missingWorkflowColumn(err.message)
            ? "Task review needs a SQL patch. Paste supabase/workspace-lite.sql in the Supabase SQL editor, then refresh."
            : err.message
      );
      setTasks((prev) => (prev ?? []).map((t) => (t.id === taskId ? current : t)));
      return;
    }
    if (data) setTasks((prev) => (prev ?? []).map((t) => (t.id === taskId ? (data as Task) : t)));
  }

  async function editTask(taskId: string, values: TaskDraft) {
    if (!app) return false;
    const current = (tasks ?? []).find((t) => t.id === taskId);
    if (!current || !canManageTask(current, actor)) {
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

  const sliceLabel =
    slice === "today"
      ? "Today"
      : slice === "all"
        ? "Tasks"
        : slice === "closed"
          ? "Closed today"
          : slice === "overdue"
            ? "Overdue today"
            : "Left";
  const personLabel =
    !admin || person === "all"
      ? admin
        ? "everyone"
        : "you"
      : person === "me"
        ? "you"
        : displayName(peopleMap[person]);

  if (!app || tasks === null) return <PageFallback />;

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={
          admin
            ? "Today first. All is paged. Search and the due date filter stay on this list, not on boards."
            : "Today first. All is paged. Search this list with a keyword."
        }
      />
      {error ? <p className="mb-4 text-sm text-coral">{error}</p> : null}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={slice}
          onChange={(next) => setOverview({ slice: next })}
          options={[
            { id: "today", label: `Today (${sliceCounts.today})` },
            { id: "all", label: `All (${sliceCounts.all})` },
            { id: "left", label: `Left (${sliceCounts.left})` },
            { id: "closed", label: `Closed today (${sliceCounts.closed})` },
            { id: "overdue", label: `Overdue today (${sliceCounts.overdue})` },
          ]}
        />
        {admin ? (
          <Select
            value={person}
            onChange={(e) => setOverview({ person: e.target.value })}
            className="w-[14rem]"
            aria-label="Whose tasks"
          >
            <option value="all">Everyone</option>
            <option value="me">My tasks</option>
            {peopleOptions.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </Select>
        ) : null}
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (paged.page !== 1) setOverview({ page: 1 });
          }}
          placeholder="Search tasks"
          aria-label="Search tasks"
          className="w-full max-w-[16rem] py-2 text-[13px]"
        />
        <DatePicker
          value={due}
          onChange={(next) => setOverview({ due: next })}
          placeholder="Due date"
          className="min-w-[12rem] w-[14rem]"
        />
      </div>

      <section className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
        <div className="hidden border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted md:grid md:grid-cols-[minmax(12rem,1.4fr)_8rem_8rem_minmax(9rem,12rem)_8rem_8.5rem_2.25rem] md:gap-3">
          <span>Task</span>
          <span>Created by</span>
          <span>Assignee</span>
          <span>Space</span>
          <span>Due</span>
          <span>Status</span>
          <span />
        </div>
        {listed.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-faint">
            No {sliceLabel.toLowerCase()} for {personLabel}
            {query.trim() ? ` matching “${query.trim()}”` : ""}
            {due ? " on that due date" : ""}.
          </p>
        ) : (
          <>
            <ul>
              {paged.rows.map((task) => (
                <li key={task.id}>
                  <TaskListRow
                    task={task}
                    href={`/spaces/${task.space_id}/tasks/${task.id}`}
                    requester={peopleMap[task.created_by] ?? null}
                    assignee={task.assignee_id ? peopleMap[task.assignee_id] : null}
                    members={people}
                    spaceName={spaceMap[task.space_id]?.name || "Board"}
                    onMove={canMoveTask(task, actor) ? (status) => void setStatus(task.id, status) : undefined}
                    onEdit={canManageTask(task, actor) ? (values) => editTask(task.id, values) : undefined}
                    onDelete={canDeleteTask(task, actor) ? () => deleteTask(task.id) : undefined}
                  />
                </li>
              ))}
            </ul>
            <Pager
              page={paged.page}
              pages={paged.pages}
              start={paged.start}
              end={paged.end}
              total={listed.length}
              onChange={(next) => setOverview({ page: next })}
            />
          </>
        )}
      </section>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <TasksPageInner />
    </Suspense>
  );
}
