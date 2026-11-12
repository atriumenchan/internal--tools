"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronDown, GripVertical as DotsSixVertical } from "lucide-react";
import { Pencil as PencilSimple } from "lucide-react";
import { PriorityMark, StatusMark } from "@/components/ui";
import { OverflowStrip } from "@/components/overflow-strip";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Avatar } from "@/components/avatar";
import { avatarSrc } from "@/lib/avatar";
import { TaskForm, draftFromTask, type TaskDraft } from "@/components/task-form";
import {
  displayName,
  TASK_COLUMNS,
  TASK_STATUS_LABELS,
  taskPriority,
} from "@/lib/spaces";
import { formatDueDate, isOverdue, dueWhenLabel } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Profile, Task, TaskPriority, TaskStatus } from "@/lib/types";

export function taskBadgeTone(task: Pick<Task, "status" | "due_date">) {
  if (task.status === "done") return "ok" as const;
  if (task.status === "cancelled") return "neutral" as const;
  if (isOverdue(task.due_date, task.status)) return "danger" as const;
  if (task.status === "in_review") return "review" as const;
  if (task.status === "in_progress") return "accent" as const;
  return "neutral" as const;
}

export function taskStatusClass(status: TaskStatus, active = false) {
  if (status === "done") {
    return active ? "bg-teal-dim text-teal" : "text-muted hover:text-teal hover:bg-teal-dim";
  }
  if (status === "in_review") {
    return active ? "bg-[var(--mention-soft)] text-[var(--mention-ink)]" : "text-muted hover:bg-[var(--mention-soft)] hover:text-[var(--mention-ink)]";
  }
  if (status === "in_progress") {
    return active ? "bg-[var(--info-soft)] text-[var(--info-ink)]" : "text-muted hover:bg-[var(--info-soft)] hover:text-[var(--info-ink)]";
  }
  if (status === "cancelled") {
    return active ? "bg-surface text-muted" : "text-muted hover:text-ink hover:bg-surface";
  }
  return active ? "bg-surface text-ink" : "text-muted hover:text-ink hover:bg-surface";
}

export function priorityTone(value: TaskPriority | string | null | undefined): "neutral" | "info" | "warn" | "danger" {
  const key = taskPriority(value);
  if (key === "urgent") return "danger";
  if (key === "high") return "danger";
  if (key === "low") return "neutral";
  return "warn";
}

function StatusMoveControl({
  status,
  onMove,
  className,
}: {
  status: TaskStatus;
  onMove: (status: TaskStatus) => void;
  className?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    function place() {
      const el = trigger.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.max(r.width, 176);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setBox({ top: r.bottom + 6, left, width });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const node = e.target as Node;
      if (trigger.current?.contains(node) || pop.current?.contains(node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={cn("mt-3 min-w-0", className)}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Change status"
        className={cn(
          "flex h-7 w-full min-w-0 items-center justify-between gap-1 rounded-full px-2.5 text-left text-[12px] font-semibold",
          taskStatusClass(status, true)
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="min-w-0 truncate">{TASK_STATUS_LABELS[status]}</span>
        <ChevronDown size={12} className="shrink-0 opacity-70" />
      </button>
      {open && box && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={pop}
              role="listbox"
              aria-label="Task status"
              className="fixed z-[80] rounded-md border border-border bg-surface p-1 shadow-float"
              style={{ top: box.top, left: box.left, width: box.width }}
              onClick={(e) => e.stopPropagation()}
            >
              {TASK_COLUMNS.map((col) => (
                <button
                  key={col.status}
                  type="button"
                  role="option"
                  aria-selected={status === col.status}
                  className={cn(
                    "flex w-full rounded-sm px-3 py-2 text-left text-[13px] font-medium",
                    taskStatusClass(col.status, status === col.status)
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    if (status !== col.status) onMove(col.status);
                  }}
                >
                  {TASK_STATUS_LABELS[col.status]}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function PersonChip({
  label,
  person,
  empty,
}: {
  label: string;
  person?: Profile | null;
  empty: string;
}) {
  const name = person ? displayName(person) : empty;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5" title={`${label} ${name}`}>
      <span className="text-[11px] text-faint">{label}</span>
      <Avatar name={name} src={avatarSrc(person)} size="sm" className="h-5 w-5 text-[9px]" />
      {name}
    </span>
  );
}

export function TaskCard({
  task,
  href,
  spaceName,
  requester,
  assignee,
  members,
  onMove,
  onEdit,
  onDelete,
}: {
  task: Task;
  href: string;
  spaceName?: string;
  requester?: Profile | null;
  assignee?: Profile | null;
  members?: Profile[];
  onMove?: (status: TaskStatus) => void;
  onEdit?: (values: TaskDraft) => Promise<boolean>;
  onDelete?: () => Promise<void> | void;
}) {
  const due = formatDueDate(task.due_date);
  const when = dueWhenLabel(task.due_date, task.status);
  const late = isOverdue(task.due_date, task.status);
  const priority = taskPriority(task.priority);
  const dragged = useRef(false);
  const note = (task.description || "").trim();
  const [editing, setEditing] = useState(false);
  const [lifting, setLifting] = useState(false);

  if (editing && onEdit && members) {
    return (
      <TaskForm
        members={members}
        initial={draftFromTask(task)}
        submitLabel="Save task"
        busyLabel="Saving…"
        onCancel={() => setEditing(false)}
        onSubmit={async (values) => {
          const ok = await onEdit(values);
          if (ok) setEditing(false);
          return ok;
        }}
      />
    );
  }

  return (
    <article
      draggable={Boolean(onMove) && !editing}
      onDragStart={(e) => {
        if (!onMove) return;
        dragged.current = true;
        setLifting(true);
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => {
        setLifting(false);
        window.setTimeout(() => {
          dragged.current = false;
        }, 50);
      }}
      className={cn(
        "relative rounded-md border border-border bg-surface-2 p-4 shadow-card",
        "border-l-[3px] transition-[box-shadow,transform,opacity] duration-200 ease-out motion-reduce:transition-none",
        task.status === "done" && "border-l-teal",
        task.status === "in_review" && "border-l-violet",
        task.status === "in_progress" && "border-l-amber",
        task.status !== "done" && task.status !== "in_review" && task.status !== "in_progress" && "border-l-muted",
        onMove && "cursor-grab active:cursor-grabbing",
        lifting && "rotate-1 scale-[1.02] opacity-80 shadow-float motion-reduce:rotate-0 motion-reduce:scale-100"
      )}
    >
      <Link
        href={href}
        aria-label={task.title}
        onClick={(e) => {
          if (dragged.current) e.preventDefault();
        }}
        className="absolute inset-0 z-0 rounded-md"
      />
      <div className="pointer-events-none relative z-[1] flex items-start gap-2">
        {onMove ? (
          <span className="mt-1 shrink-0 text-muted" title="Drag to move" aria-label="Drag to move">
            <DotsSixVertical size={18} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p title={task.title} className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-snug tracking-tight text-ink">
              {task.title}
            </p>
            <div className="pointer-events-auto relative z-[2] flex shrink-0 items-center gap-1">
              {onDelete || onEdit ? (
                <ConfirmDelete
                  label="Delete task"
                  title="Delete this task?"
                  description="The task, comments, and files will be removed."
                  onConfirm={onDelete}
                  showDelete={Boolean(onDelete)}
                  extra={
                    onEdit
                      ? [
                          {
                            label: "Edit task",
                            icon: <PencilSimple size={18} />,
                            onSelect: () => setEditing(true),
                          },
                        ]
                      : undefined
                  }
                />
              ) : null}
            </div>
          </div>
          <OverflowStrip className="pointer-events-auto mt-2" moreLabel="More">
            <PriorityMark priority={priority} />
            {spaceName ? <span className="shrink-0 text-muted">{spaceName}</span> : null}
            <PersonChip label="Created by" person={requester} empty="Unknown" />
            <PersonChip label="Assignee" person={assignee} empty="Unassigned" />
            {when || due ? (
              <span className={cn("shrink-0 text-[12px] font-medium", late ? "text-coral" : "text-teal")}>
                {when && due ? `${when} · ${due}` : when || due}
              </span>
            ) : null}
          </OverflowStrip>
          {note ? <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">{note}</p> : null}
          {onMove ? (
            <div className="pointer-events-auto">
              <StatusMoveControl status={task.status} onMove={onMove} />
            </div>
          ) : (
            <div className="mt-2.5">
              <StatusMark status={task.status} label={TASK_STATUS_LABELS[task.status]} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export const taskRowGrid =
  "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_5.5rem_minmax(7.5rem,10rem)_minmax(7.5rem,10rem)_6rem_6.75rem_2rem] md:gap-x-3";

export function TaskRowHeader() {
  return (
    <div className={cn("hidden items-center px-4 py-2 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase md:grid", taskRowGrid)}>
      <span>Task</span>
      <span>Priority</span>
      <span>From</span>
      <span>Assignee</span>
      <span>Due</span>
      <span>Status</span>
      <span />
    </div>
  );
}

function PersonCell({ person, empty }: { person?: Profile | null; empty: string }) {
  const name = person ? displayName(person) : empty;
  return (
    <span title={name} className="pointer-events-none relative z-[1] hidden min-w-0 items-center gap-2 text-[13px] text-ink md:inline-flex">
      <Avatar name={name} src={avatarSrc(person)} size="sm" className="shrink-0" />
      <span className="truncate font-medium">{person ? displayName(person) : "—"}</span>
    </span>
  );
}

function dueCellLabel(when: string | null, due: string | null, late: boolean) {
  if (late) return "Overdue";
  if (when === "Due today") return "Today";
  if (when === "Due tomorrow") return "Tomorrow";
  if (due) return due;
  if (when?.startsWith("Due in ")) return when.replace("Due in ", "");
  return "—";
}

export function TaskListRow({
  task,
  href,
  requester,
  assignee,
  members,
  spaceName,
  onMove,
  onEdit,
  onDelete,
}: {
  task: Task;
  href: string;
  requester?: Profile | null;
  assignee?: Profile | null;
  members?: Profile[];
  spaceName?: string;
  onMove?: (status: TaskStatus) => void;
  onEdit?: (values: TaskDraft) => Promise<boolean>;
  onDelete?: () => Promise<void> | void;
}) {
  const due = formatDueDate(task.due_date);
  const when = dueWhenLabel(task.due_date, task.status);
  const late = isOverdue(task.due_date, task.status);
  const [editing, setEditing] = useState(false);

  if (editing && onEdit && members) {
    return (
      <div className="border-t border-border px-3 py-3">
        <TaskForm
          members={members}
          initial={draftFromTask(task)}
          submitLabel="Save task"
          busyLabel="Saving…"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            const ok = await onEdit(values);
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative grid min-h-[68px] items-center border-t border-border px-4 py-2.5 transition duration-150 hover:bg-surface-2",
        taskRowGrid
      )}
    >
      <Link href={href} aria-label={task.title} className="absolute inset-0 z-0" />
      <div className="pointer-events-none relative z-[1] min-w-0">
        <p title={task.title} className="truncate text-[14px] leading-5 font-semibold tracking-[-0.01em] text-ink">
          {task.title}
        </p>
        {spaceName ? (
          <p title={spaceName} className="truncate text-[12px] leading-4 text-muted">
            {spaceName}
          </p>
        ) : null}
        <span className="mt-1.5 inline-flex md:hidden">
          <PriorityMark priority={taskPriority(task.priority)} />
        </span>
        <p className="mt-0.5 truncate text-[12px] text-muted md:hidden">
          {requester ? displayName(requester) : "Unknown"} → {assignee ? displayName(assignee) : "Unassigned"}
        </p>
      </div>
      <span className="pointer-events-none relative z-[1] hidden md:inline-flex">
        <PriorityMark priority={taskPriority(task.priority)} />
      </span>
      <PersonCell person={requester} empty="Unknown" />
      <PersonCell person={assignee} empty="Unassigned" />
      <span
        title={when && due ? `${when} · ${due}` : when || due || "No due date"}
        className={cn(
          "pointer-events-none relative z-[1] hidden truncate text-[13px] font-medium md:block",
          late ? "text-coral" : due || when ? "text-ink" : "text-muted"
        )}
      >
        {dueCellLabel(when, due, late)}
      </span>
      <div className={cn("relative z-[2] hidden min-w-0 md:block", !onMove && "pointer-events-none")}>
        {onMove ? (
          <div className="pointer-events-auto">
            <StatusMoveControl status={task.status} onMove={onMove} className="mt-0" />
          </div>
        ) : (
          <StatusMark status={task.status} label={TASK_STATUS_LABELS[task.status]} />
        )}
      </div>
      <div className="pointer-events-auto relative z-[2] flex justify-end">
        {onDelete || onEdit ? (
          <ConfirmDelete
            label="Delete task"
            title="Delete this task?"
            description="The task, comments, and files will be removed."
            onConfirm={onDelete}
            showDelete={Boolean(onDelete)}
            extra={
              onEdit
                ? [
                    {
                      label: "Edit task",
                      icon: <PencilSimple size={18} />,
                      onSelect: () => setEditing(true),
                    },
                  ]
                : undefined
            }
          />
        ) : null}
      </div>
    </div>
  );
}
