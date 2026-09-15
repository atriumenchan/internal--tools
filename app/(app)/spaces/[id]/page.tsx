"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DatePicker } from "@/components/date-picker";
import { PageFallback } from "@/components/app-nav";
import { TaskCard } from "@/components/task-card";
import { Avatar } from "@/components/avatar";
import {
  displayName,
  missingPriorityColumn,
  missingSpacesSchema,
  TASK_COLUMNS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  taskPriority,
} from "@/lib/spaces";
import { dueDateKey } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Profile, Space, Task, TaskPriority, TaskStatus } from "@/lib/types";

export default function SpaceDetailPage() {
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
    const by: Record<TaskStatus, Task[]> = { open: [], in_progress: [], done: [] };
    for (const task of tasks) by[task.status].push(task);
    return by;
  }, [tasks]);

  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  const outsiders = people.filter((p) => !members.some((m) => m.id === p.id));

  async function setStatus(taskId: string, status: TaskStatus) {
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === status) return;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    const supabase = createClient();
    const { data, error: err } = await supabase.from("tasks").update({ status }).eq("id", taskId).select("*").single();
    if (err) {
      setError(err.message);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? current : t)));
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? (data as Task) : t)));
  }

  async function createTask(
    status: TaskStatus,
    values: { title: string; assigneeId: string; dueDate: string; priority: TaskPriority; comment: string }
  ) {
    if (!space || !values.title.trim()) return false;
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return false;
    const comment = values.comment.trim();
    const payload = {
      space_id: space.id,
      title: values.title.trim(),
      description: comment || null,
      assignee_id: values.assigneeId || null,
      created_by: userId,
      due_date: dueDateKey(values.dueDate),
      status,
      priority: values.priority,
    };
    let { data, error: err } = await supabase.from("tasks").insert(payload).select("*").single();
    if (err && missingPriorityColumn(err.message)) {
      const { priority, ...withoutPriority } = payload;
      void priority;
      const retry = await supabase.from("tasks").insert(withoutPriority).select("*").single();
      data = retry.data;
      err = retry.error;
      if (!err) {
        setError("Priority needs a SQL patch. Paste supabase/task-board.sql in the Supabase SQL editor, then refresh.");
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

  function dropTask(status: TaskStatus, event: React.DragEvent) {
    event.preventDefault();
    setDragOver(null);
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) void setStatus(taskId, status);
  }

  if (error && !space) {
    return <PageHeader title="Board" description={error} />;
  }
  if (!space) return <PageFallback />;

  return (
    <div>
      <p className="mb-3 text-sm">
        <Link href="/spaces" className="text-ink-soft hover:text-ink">
          ← All boards
        </Link>
      </p>
      <PageHeader
        title={space.name}
        description="Drag a card into another column, or tap To do / Doing / Done on the card."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex -space-x-2">
              {members.slice(0, 6).map((m) => (
                <Avatar key={m.id} name={displayName(m)} className="border border-paper" />
              ))}
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
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      {outsiders.length > 0 ? (
        <form onSubmit={invite} className="mb-5 flex max-w-md items-center gap-2">
          <Select value={inviteId} onChange={(e) => setInviteId(e.target.value)} required>
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
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
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
              "flex min-h-[22rem] flex-col rounded-xl border bg-surface p-3 shadow-card transition duration-200",
              dragOver === col.status ? "border-blue bg-blue/10" : "border-rule"
            )}
          >
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="font-semibold">{TASK_STATUS_LABELS[col.status]}</h2>
              <span className="text-xs text-ink-soft">
                {columns[col.status].length} · {col.hint}
              </span>
            </div>
            {addingStatus === col.status ? (
              <AddTaskForm members={members} onCancel={() => setAddingStatus(null)} onSubmit={(values) => createTask(col.status, values)} />
            ) : (
              <button
                type="button"
                onClick={() => setAddingStatus(col.status)}
                className="mb-3 w-full rounded-[12px] border border-dashed border-rule bg-input px-3 py-2.5 text-left text-sm text-muted transition duration-200 hover:border-line-hover hover:text-ink"
              >
                + Add a task
              </button>
            )}
            <ul className="space-y-2">
              {columns[col.status].map((task) => (
                <li key={task.id}>
                  <TaskCard
                    task={task}
                    href={`/spaces/${space.id}/tasks/${task.id}`}
                    assignee={task.assignee_id ? memberMap[task.assignee_id] : null}
                    onMove={(status) => void setStatus(task.id, status)}
                    onDelete={() => deleteTask(task.id)}
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

function AddTaskForm({
  members,
  onCancel,
  onSubmit,
}: {
  members: Profile[];
  onCancel: () => void;
  onSubmit: (values: {
    title: string;
    assigneeId: string;
    dueDate: string;
    priority: TaskPriority;
    comment: string;
  }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || busy) return;
        setBusy(true);
        const ok = await onSubmit({ title, assigneeId, dueDate, priority: taskPriority(priority), comment });
        if (!ok) setBusy(false);
      }}
      className="mb-3 space-y-2 rounded-[12px] border border-rule bg-cream p-3"
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" required autoFocus />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Assign">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {displayName(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(taskPriority(e.target.value))}>
            {TASK_PRIORITIES.map((key) => (
              <option key={key} value={key}>
                {TASK_PRIORITY_LABELS[key]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Due">
        <DatePicker value={dueDate || null} onChange={(v) => setDueDate(v || "")} placeholder="Due date" />
      </Field>
      <Field label="Comment">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="min-h-[4.5rem]"
          placeholder="Optional note for the person you assign"
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
