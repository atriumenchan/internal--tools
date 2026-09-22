"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, PageHeader, Select } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageFallback } from "@/components/app-nav";
import { TaskCard } from "@/components/task-card";
import { TaskForm, type TaskDraft } from "@/components/task-form";
import { Avatar } from "@/components/avatar";
import {
  displayName,
  missingPriorityColumn,
  missingSpacesSchema,
  TASK_COLUMNS,
  TASK_STATUS_LABELS,
} from "@/lib/spaces";
import { useAppState } from "@/components/app-frame";
import { applyTaskStatus, canManageTask, missingWorkflowColumn } from "@/lib/task-workflow";
import { dueDateKey } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Profile, Space, Task, TaskStatus } from "@/lib/types";

export default function SpaceDetailPage() {
  const app = useAppState();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [space, setSpace] = useState<Space | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviteId, setInviteId] = useState("");
  const [addingStatus, setAddingStatus] = useState<TaskStatus | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    void (async () => {
      const [spaceRes, tasksRes, memberRes, peopleRes, convRes] = await Promise.all([
        supabase.from("spaces").select("id, name, color, created_by, created_at").eq("id", id).maybeSingle(),
        supabase.from("tasks").select("*").eq("space_id", id).order("created_at", { ascending: false }),
        supabase.from("space_members").select("user_id").eq("space_id", id),
        supabase.from("profiles").select("id, email, full_name, role").order("full_name"),
        supabase.from("conversations").select("id").eq("space_id", id).eq("type", "space").maybeSingle(),
      ]);
      if (spaceRes.error || !spaceRes.data) {
        setError(
          missingSpacesSchema(spaceRes.error?.message)
            ? "Task boards are not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor."
            : spaceRes.error?.message || "Board not found."
        );
        return;
      }
      const allPeople = (peopleRes.data ?? []) as Profile[];
      const memberIds = new Set((memberRes.data ?? []).map((row) => row.user_id as string));
      setSpace(spaceRes.data as Space);
      setTasks((tasksRes.data ?? []) as Task[]);
      setPeople(allPeople);
      setMembers(allPeople.filter((p) => memberIds.has(p.id)));
      setConversationId((convRes.data as { id?: string } | null)?.id ?? null);
    })();
  }, [id]);

  const columns = useMemo(() => {
    const by: Record<TaskStatus, Task[]> = {
      open: [],
      in_progress: [],
      in_review: [],
      done: [],
      cancelled: [],
    };
    for (const task of tasks) {
      (by[task.status] ?? by.open).push(task);
    }
    return by;
  }, [tasks]);

  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  const outsiders = people.filter((p) => !members.some((m) => m.id === p.id));
  const actor = app ? { id: app.userId, email: app.profile.email, role: app.profile.role } : null;

  async function setStatus(taskId: string, status: TaskStatus) {
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === status) return;
    const userId = app?.userId;
    if (!userId) return;
    const next = applyTaskStatus(current, status, userId, app.profile);
    if (next.error && next.status === current.status) {
      setError(next.error);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: next.status } : t)));
    const supabase = createClient();
    const { data, error: err } = await supabase.from("tasks").update({ status: next.status }).eq("id", taskId).select("*").single();
    if (err) {
      setError(
        missingWorkflowColumn(err.message)
          ? "Task review needs a SQL patch. Paste supabase/workspace-lite.sql in the Supabase SQL editor, then refresh."
          : err.message
      );
      setTasks((prev) => prev.map((t) => (t.id === taskId ? current : t)));
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? (data as Task) : t)));
  }

  async function createTask(status: TaskStatus, values: TaskDraft) {
    if (!space || !values.title.trim()) return false;
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return false;
    const comment = values.comment.trim();
    const criteria = values.criteria.trim();
    const assigneeId = values.assigneeId || null;
    const payload = {
      space_id: space.id,
      title: values.title.trim(),
      description: comment || null,
      completion_criteria: criteria || null,
      assignee_id: assigneeId,
      reviewer_id: assigneeId && assigneeId !== userId ? userId : null,
      created_by: userId,
      due_date: dueDateKey(values.dueDate),
      status: status === "cancelled" ? "open" : status,
      priority: values.priority,
    };
    let { data, error: err } = await supabase.from("tasks").insert(payload).select("*").single();
    if (err && (missingPriorityColumn(err.message) || missingWorkflowColumn(err.message))) {
      const { priority, completion_criteria, reviewer_id, ...without } = payload;
      void priority;
      void completion_criteria;
      void reviewer_id;
      const retry = await supabase.from("tasks").insert(without).select("*").single();
      data = retry.data;
      err = retry.error;
      if (!err) {
        setError("Task review fields need a SQL patch. Paste supabase/workspace-lite.sql in the Supabase SQL editor.");
      }
    }
    if (err || !data) {
      setError(err?.message || "Could not add the task.");
      return false;
    }
    const task = data as Task;
    if (comment) {
      await supabase.from("task_comments").insert({ task_id: task.id, author_id: userId, body: comment });
    }
    setTasks((prev) => [task, ...prev]);
    setAddingStatus(null);
    return true;
  }

  async function editTask(taskId: string, values: TaskDraft) {
    const current = tasks.find((t) => t.id === taskId);
    if (!current) return false;
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return false;
    const assigneeId = values.assigneeId || null;
    const payload = {
      title: values.title.trim(),
      description: values.comment.trim() || null,
      completion_criteria: values.criteria.trim() || null,
      assignee_id: assigneeId,
      reviewer_id:
        assigneeId && assigneeId !== userId ? current.reviewer_id || current.created_by : current.reviewer_id,
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
    setTasks((prev) => prev.map((t) => (t.id === taskId ? (data as Task) : t)));
    return true;
  }

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
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  async function deleteSpace() {
    if (!space) return;
    const supabase = createClient();
    const { error: err } = await supabase.from("spaces").delete().eq("id", space.id);
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy")
          ? "Could not delete this board. Paste supabase/deletes.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    router.push("/spaces");
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteId || !space) return;
    const supabase = createClient();
    const { error: err } = await supabase.rpc("add_space_member", { p_space_id: space.id, p_user_id: inviteId });
    if (err) {
      setError(err.message);
      return;
    }
    const person = people.find((p) => p.id === inviteId);
    if (person) setMembers((prev) => [...prev, person]);
    setInviteId("");
  }

  async function inviteEveryone() {
    if (!space || outsiders.length === 0) return;
    const supabase = createClient();
    const added: Profile[] = [];
    for (const person of outsiders) {
      const { error: err } = await supabase.rpc("add_space_member", { p_space_id: space.id, p_user_id: person.id });
      if (err) {
        setError(err.message);
        break;
      }
      added.push(person);
    }
    if (added.length) setMembers((prev) => [...prev, ...added]);
  }

  function dropTask(status: TaskStatus, event: React.DragEvent) {
    event.preventDefault();
    setDragOver(null);
    const taskId = event.dataTransfer.getData("text/plain");
    const current = tasks.find((t) => t.id === taskId);
    if (!current || !canManageTask(current, actor)) {
      setError("Only the person who created this task, or a manager, can change status.");
      return;
    }
    if (taskId) void setStatus(taskId, status);
  }

  if (error && !space) {
    return <PageHeader title="Board" description={error} />;
  }
  if (!space) return <PageFallback />;

  return (
    <div>
      <p className="mb-3 text-sm">
        <Link href="/spaces" className="text-muted hover:text-ink">
          ← All boards
        </Link>
      </p>
      <PageHeader
        title={space.name}
        description="Drag cards between columns, or edit from the three-dot menu."
        actions={
          <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
            <div className="flex shrink-0 -space-x-2">
              {members.slice(0, 3).map((m) => (
                <Avatar key={m.id} name={displayName(m)} className="border border-page" />
              ))}
              {members.length > 3 ? (
                <span
                  title={members.map((m) => displayName(m)).join(", ")}
                  className="grid h-8 w-8 place-items-center rounded-full border border-page bg-surface-2 text-[11px] font-medium text-muted"
                >
                  +{members.length - 3}
                </span>
              ) : null}
            </div>
            {conversationId ? (
              <Link href={`/chat?c=${conversationId}`}>
                <Button variant="secondary">Chat</Button>
              </Link>
            ) : null}
            <ConfirmDelete
              label="Delete board"
              title="Delete this board?"
              description="All tasks, comments, and files on this board will be removed."
              onConfirm={() => deleteSpace()}
            />
          </div>
        }
      />
      {error ? <p className="mb-4 text-sm text-coral">{error}</p> : null}

      {outsiders.length > 0 ? (
        <form onSubmit={invite} className="mb-5 flex max-w-xl flex-wrap items-center gap-2">
          <Select value={inviteId} onChange={(e) => setInviteId(e.target.value)} required className="min-w-[12rem] flex-1">
            <option value="">Add a person to this board</option>
            {outsiders.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" variant="secondary">
            Add
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void inviteEveryone()}>
            Add everyone
          </Button>
        </form>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {TASK_COLUMNS.map((col) => (
          <section
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOver((current) => (current === col.status ? null : current));
              }
            }}
            onDrop={(e) => dropTask(col.status, e)}
            className={cn(
              "flex min-h-[22rem] min-w-0 flex-col rounded-md border p-3 transition duration-150",
              dragOver === col.status
                ? "border-dashed border-amber bg-amber-dim"
                : "border-border bg-page shadow-card"
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-2 px-1">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
                <span className={cn("h-2.5 w-2.5 rounded-[2px]", col.accent)} />
                {TASK_STATUS_LABELS[col.status]}
              </h2>
              <span className="tabular rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                {columns[col.status].length}
              </span>
            </div>
            {addingStatus === col.status ? (
              <div className="mb-3">
                <TaskForm
                  members={members}
                  submitLabel="Add"
                  busyLabel="Adding…"
                  onCancel={() => setAddingStatus(null)}
                  onSubmit={(values) => createTask(col.status, values)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingStatus(col.status)}
                className="mb-3 w-full cursor-pointer rounded-sm border border-dashed border-border bg-transparent px-3 py-2.5 text-left text-[13px] text-muted transition duration-150 hover:border-border-strong hover:bg-surface-2 hover:text-ink"
              >
                + Add a task
              </button>
            )}
            <ul className="space-y-3">
              {columns[col.status].length === 0 && addingStatus !== col.status ? (
                <li className="flex flex-1 flex-col items-center justify-center px-3 py-10 text-center">
                  <p className="text-[13px] text-faint">{col.hint}</p>
                </li>
              ) : null}
              {columns[col.status].map((task) => (
                <li key={task.id}>
                  <TaskCard
                    task={task}
                    href={`/spaces/${space.id}/tasks/${task.id}`}
                    assignee={task.assignee_id ? memberMap[task.assignee_id] : null}
                    members={members}
                    onMove={canManageTask(task, actor) ? (status) => void setStatus(task.id, status) : undefined}
                    onEdit={canManageTask(task, actor) ? (values) => editTask(task.id, values) : undefined}
                    onDelete={canManageTask(task, actor) ? () => deleteTask(task.id) : undefined}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
