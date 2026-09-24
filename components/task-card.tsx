"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { DotsSixVertical } from "@phosphor-icons/react/dist/ssr/DotsSixVertical";
import { PencilSimple } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { Badge } from "@/components/ui";
import { OverflowStrip } from "@/components/overflow-strip";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Avatar } from "@/components/avatar";
import { TaskForm, draftFromTask, type TaskDraft } from "@/components/task-form";
import {
  displayName,
  TASK_COLUMNS,
  TASK_PRIORITY_LABELS,
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
    return active ? "bg-violet-dim text-violet" : "text-muted hover:text-violet hover:bg-violet-dim";
  }
  if (status === "in_progress") {
    return active ? "bg-amber-dim text-amber" : "text-muted hover:text-amber hover:bg-amber-dim";
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
          "flex w-full min-w-0 items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-[12px] font-medium",
          taskStatusClass(status, true)
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="min-w-0 truncate">{TASK_STATUS_LABELS[status]}</span>
        <span className="shrink-0 text-[11px] opacity-70">More</span>
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

export function TaskCard({
  task,
  href,
  spaceName,
  assignee,
  members,
  onMove,
  onEdit,
  onDelete,
}: {
  task: Task;
  href: string;
  spaceName?: string;
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
        submitLabel="Save"
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
            <DotsSixVertical size={18} weight="light" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p title={task.title} className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-snug tracking-tight text-ink">
              {task.title}
            </p>
            <div className="pointer-events-auto relative z-[2] flex shrink-0 items-center gap-1">
              {onDelete ? (
                <ConfirmDelete
                  label="Delete task"
                  title="Delete this task?"
                  description="The task, comments, and files will be removed."
                  onConfirm={onDelete}
                  extra={
                    onEdit
                      ? [
                          {
                            label: "Edit task",
                            icon: <PencilSimple size={18} weight="light" />,
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
            <Badge tone={priorityTone(priority)} dot>
              {TASK_PRIORITY_LABELS[priority]}
            </Badge>
            {spaceName ? <span className="shrink-0 text-muted">{spaceName}</span> : null}
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <Avatar name={assignee ? displayName(assignee) : "Unassigned"} size="sm" className="h-5 w-5 text-[9px]" />
              {assignee ? displayName(assignee) : "Unassigned"}
            </span>
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
              <Badge tone={taskBadgeTone(task)} dot>
                {TASK_STATUS_LABELS[task.status]}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function TaskListRow({
  task,
  href,
  assignee,
  members,
  onMove,
  onEdit,
  onDelete,
}: {
  task: Task;
  href: string;
  assignee?: Profile | null;
  members?: Profile[];
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
          submitLabel="Save"
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
    <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-3 py-2.5 transition duration-150 hover:bg-surface-2 md:grid-cols-[minmax(0,1.4fr)_8rem_7rem_8.5rem_2.25rem]">
      <Link href={href} aria-label={task.title} className="absolute inset-0 z-0" />
      <p title={task.title} className="relative z-[1] min-w-0 truncate text-[14px] font-medium tracking-tight text-ink">
        {task.title}
      </p>
      <span className="relative z-[1] hidden min-w-0 items-center gap-1.5 text-[12px] text-muted md:inline-flex">
        <Avatar name={assignee ? displayName(assignee) : "Unassigned"} size="sm" className="h-5 w-5 text-[9px]" />
        <span className="truncate">{assignee ? displayName(assignee) : "—"}</span>
      </span>
      <span className={cn("relative z-[1] hidden text-[12px] font-medium md:block", late ? "text-coral" : "text-teal")}>
        {when && due ? `${when} · ${due}` : when || due || "—"}
      </span>
      <div className="relative z-[1] hidden min-w-0 md:block">
        {onMove ? (
          <div className="pointer-events-auto">
            <StatusMoveControl status={task.status} onMove={onMove} className="mt-0" />
          </div>
        ) : (
          <Badge tone={taskBadgeTone(task)} dot>
            {TASK_STATUS_LABELS[task.status]}
          </Badge>
        )}
      </div>
      <div className="pointer-events-auto relative z-[2] flex justify-end">
        {onDelete || onEdit ? (
          <ConfirmDelete
            label="Delete task"
            title="Delete this task?"
            description="The task, comments, and files will be removed."
            onConfirm={onDelete ?? (async () => undefined)}
            extra={
              onEdit
                ? [
                    {
                      label: "Edit task",
                      icon: <PencilSimple size={18} weight="light" />,
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
