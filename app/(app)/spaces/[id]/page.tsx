"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, PageHeader, Select } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageFallback } from "@/components/app-nav";
import { TaskCard, TaskListRow } from "@/components/task-card";
import { TaskForm, type TaskDraft } from "@/components/task-form";
import { Avatar } from "@/components/avatar";
import {
  displayName,
  missingPriorityColumn,
  missingSpacesSchema,
  TASK_COLUMNS,
  TASK_STATUS_LABELS,
  visibleSpaceTasks,
} from "@/lib/spaces";
import { useAppState } from "@/components/app-frame";
import { Segmented } from "@/components/overflow-strip";
import { applyTaskStatus, canManageSpace, canManageTask, canMoveTask, missingWorkflowColumn } from "@/lib/task-workflow";
import { dueDateKey } from "@/lib/datetime";
import { useSilentLive } from "@/lib/silent-live";
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
  const [view, setView] = useState<"board" | "list">("board");
  const [whose, setWhose] = useState("me");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [excludeId, setExcludeId] = useState("");
  const [excludeConfirm, setExcludeConfirm] = useState(false);

  const loadTasks = useCallback(async () => {
    if (!id) return;
    const supabase = createClient();
    const { data } = await supabase.from("tasks").select("*").eq("space_id", id).order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }, [id]);

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
      const loaded = spaceRes.data as Space;
      setSpace(loaded);
      setNameDraft(loaded.name);
      setTasks((tasksRes.data ?? []) as Task[]);
      setPeople(allPeople);
      setMembers(allPeople.filter((p) => memberIds.has(p.id)));
      setConversationId((convRes.data as { id?: string } | null)?.id ?? null);
    })();
  }, [id]);

  useSilentLive(() => void loadTasks(), id ? `space-${id}` : "space");

  useEffect(() => {
    if (!id) return;
    const stored = sessionStorage.getItem(`it-space-view-${id}`);
    if (stored === "list" || stored === "board") setView(stored);
    const peopleStored = sessionStorage.getItem(`it-space-whose-${id}`);
    if (peopleStored) setWhose(peopleStored);
  }, [id]);

  const shownTasks = useMemo(
    () => visibleSpaceTasks(tasks, whose, app?.userId),
    [tasks, whose, app?.userId]
  );

  const columns = useMemo(() => {
    const by: Record<TaskStatus, Task[]> = {
      open: [],
      in_progress: [],
      in_review: [],
      done: [],
      cancelled: [],
    };
    for (const task of shownTasks) {
      (by[task.status] ?? by.open).push(task);
    }
    return by;
  }, [shownTasks]);

  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  const outsiders = people.filter((p) => !members.some((m) => m.id === p.id));
  const removable = members.filter((p) => p.id !== space?.created_by);
  const actor = app ? { id: app.userId, email: app.profile.email, role: app.profile.role } : null;
  const whosePeople = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m]));
    for (const task of tasks) {
      if (!task.assignee_id || byId.has(task.assignee_id)) continue;
      const person = people.find((p) => p.id === task.assignee_id);
      if (person) byId.set(person.id, person);
    }
    return [...byId.values()].filter((p) => p.id !== app?.userId);
  }, [members, tasks, people, app?.userId]);
  const whoseLabel =
    whose === "all"
      ? "Everyone's tasks on this board."
      : whose === "me"
        ? "Your tasks on this board. Pick someone else to see theirs."
        : `${displayName(whosePeople.find((p) => p.id === whose) || memberMap[whose])}'s tasks.`;

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
        err.message.includes("row-level security") || err.message.includes("policy") || err.message.includes("created this task")
          ? "Could not move this task. Paste supabase/assignee-move.sql in the Supabase SQL editor, then try again."
          : missingWorkflowColumn(err.message)
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
    if (!canManageSpace(space, actor)) {
      setError("Only the person who created this board, or a manager, can delete it.");
      return;
    }
    const supabase = createClient();
    const { error: err } = await supabase.from("spaces").delete().eq("id", space.id);
    if (err) {
      setError(
        err.message.includes("row-level security") || err.message.includes("policy")
          ? "Could not delete this board. Paste supabase/space-owner.sql in the Supabase SQL editor, then try again."
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

  async function renameSpace(e: React.FormEvent) {
    e.preventDefault();
    if (!space || !canManageSpace(space, actor)) return;
    const next = nameDraft.trim();
    if (!next) {
      setError("Name is required.");
      return;
    }
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("rename_space", { p_space_id: space.id, p_name: next });
    if (err) {
      setError(
        err.message.includes("Could not find the function") || err.message.includes("schema cache")
          ? "Board rename needs a SQL patch. Paste supabase/space-manage.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    setSpace({ ...space, name: next });
    setEditingName(false);
  }

  async function excludeMember() {
    if (!space || !excludeId || !canManageSpace(space, actor)) return;
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("remove_space_member", {
      p_space_id: space.id,
      p_user_id: excludeId,
    });
    if (err) {
      setError(
        err.message.includes("Could not find the function") || err.message.includes("schema cache")
          ? "Excluding someone needs a SQL patch. Paste supabase/space-manage.sql in the Supabase SQL editor, then try again."
          : err.message
      );
      return;
    }
    setMembers((prev) => prev.filter((p) => p.id !== excludeId));
    if (whose === excludeId) {
      setWhose("me");
      if (id) sessionStorage.setItem(`it-space-whose-${id}`, "me");
    }
    setExcludeId("");
    setExcludeConfirm(false);
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
    if (!current || !canMoveTask(current, actor)) {
      setError("Only the requester, the assignee, or a manager can move this task.");
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
        title={
          editingName && canManageSpace(space, actor) ? (
            <form onSubmit={(e) => void renameSpace(e)} className="flex max-w-xl flex-wrap items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                aria-label="Board name"
                autoFocus
                className="min-w-[12rem] flex-1 font-display text-[22px]"
              />
              <Button type="submit" size="sm">
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNameDraft(space.name);
                  setEditingName(false);
                }}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <h1 className="flex flex-wrap items-center gap-3 font-display text-[32px] font-medium leading-[1.15] tracking-tight text-ink">
              <span className="min-w-0">{space.name}</span>
              {canManageSpace(space, actor) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setNameDraft(space.name);
                    setEditingName(true);
                  }}
                >
                  Rename
                </Button>
              ) : null}
            </h1>
          )
        }
        description={whoseLabel}
        actions={
          <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
            <Select
              value={whose}
              onChange={(e) => {
                const next = e.target.value;
                setWhose(next);
                if (id) sessionStorage.setItem(`it-space-whose-${id}`, next);
              }}
              className="w-[11.5rem] shrink-0"
              aria-label="Whose tasks"
            >
              <option value="me">My tasks</option>
              {whosePeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {displayName(person)}
                </option>
              ))}
              <option value="all">Everyone</option>
            </Select>
            <Segmented
              value={view}
              onChange={(next) => {
                setView(next);
                if (id) sessionStorage.setItem(`it-space-view-${id}`, next);
              }}
              options={[
                { id: "board", label: "Board" },
                { id: "list", label: "List" },
              ]}
            />
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
            {canManageSpace(space, actor) ? (
              <ConfirmDelete
                label="Delete board"
                title="Delete this board?"
                description="All tasks, comments, and files on this board will be removed."
                onConfirm={() => deleteSpace()}
              />
            ) : null}
          </div>
        }
      />
      {error ? <p className="mb-4 text-sm text-coral">{error}</p> : null}

      {outsiders.length > 0 || (canManageSpace(space, actor) && removable.length > 0) ? (
        <div className="mb-5 flex max-w-3xl flex-wrap items-end gap-x-4 gap-y-3">
          {outsiders.length > 0 ? (
            <form onSubmit={invite} className="flex min-w-[16rem] flex-1 flex-wrap items-center gap-2">
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
          {canManageSpace(space, actor) && removable.length > 0 ? (
            <div className="flex min-w-[16rem] flex-1 flex-wrap items-center gap-2">
              <Select
                value={excludeId}
                onChange={(e) => {
                  setExcludeId(e.target.value);
                  setExcludeConfirm(false);
                }}
                className="min-w-[12rem] flex-1"
              >
                <option value="">Exclude a person</option>
                {removable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)}
                  </option>
                ))}
              </Select>
              {excludeId && excludeConfirm ? (
                <>
                  <Button type="button" size="sm" variant="danger" onClick={() => void excludeMember()}>
                    Exclude
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExcludeConfirm(false)}>
                    Cancel
                  </Button>
                </>
              ) : excludeId ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => setExcludeConfirm(true)}>
                  Exclude
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "list" ? (
        <div className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_8rem_7rem_8.5rem_2.25rem] gap-3 border-b border-border px-3 py-2 text-[11px] font-semibold tracking-wide text-faint uppercase md:grid">
            <span>Name</span>
            <span>Assignee</span>
            <span>Due</span>
            <span>Status</span>
            <span />
          </div>
          {TASK_COLUMNS.map((col) => (
            <section key={col.status}>
              <div className="flex items-center justify-between gap-2 bg-surface-2 px-3 py-2">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
                  <span className={cn("h-2.5 w-2.5 rounded-[2px]", col.accent)} />
                  {TASK_STATUS_LABELS[col.status]}
                </h2>
                <span className="tabular rounded-sm bg-page px-1.5 py-0.5 text-[11px] font-medium text-muted">
                  {columns[col.status].length}
                </span>
              </div>
              {addingStatus === col.status ? (
                <div className="border-t border-border px-3 py-3">
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
                  className="w-full cursor-pointer border-t border-border bg-transparent px-3 py-2 text-left text-[13px] text-muted transition duration-150 hover:bg-surface-2 hover:text-ink"
                >
                  + Add a task
                </button>
              )}
              {columns[col.status].map((task) => (
                <TaskListRow
                  key={task.id}
                  task={task}
                  href={`/spaces/${space.id}/tasks/${task.id}`}
                  assignee={task.assignee_id ? memberMap[task.assignee_id] : null}
                  members={members}
                  onMove={canMoveTask(task, actor) ? (status) => void setStatus(task.id, status) : undefined}
                  onEdit={canManageTask(task, actor) ? (values) => editTask(task.id, values) : undefined}
                  onDelete={canManageTask(task, actor) ? () => deleteTask(task.id) : undefined}
                />
              ))}
            </section>
          ))}
        </div>
      ) : (
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
                    onMove={canMoveTask(task, actor) ? (status) => void setStatus(task.id, status) : undefined}
                    onEdit={canManageTask(task, actor) ? (values) => editTask(task.id, values) : undefined}
                    onDelete={canManageTask(task, actor) ? () => deleteTask(task.id) : undefined}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      )}
    </div>
  );
}
