"use client";

import { useRef } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import {
  displayName,
  TASK_COLUMNS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  taskPriority,
} from "@/lib/spaces";
import { formatDueDate, isOverdue } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Profile, Task, TaskPriority, TaskStatus } from "@/lib/types";

export function taskBadgeTone(task: Pick<Task, "status" | "due_date">) {
  if (task.status === "done") return "ok" as const;
  if (isOverdue(task.due_date, task.status)) return "danger" as const;
  if (task.status === "in_progress") return "info" as const;
  return "neutral" as const;
}

export function taskStatusClass(status: TaskStatus, active = false) {
  if (status === "done") {
    return active
      ? "bg-success/15 text-success ring-1 ring-success/30"
      : "text-muted hover:bg-success/10 hover:text-success";
  }
  if (status === "in_progress") {
    return active
      ? "bg-blue/15 text-blue-soft ring-1 ring-blue/30"
      : "text-muted hover:bg-blue/10 hover:text-blue-soft";
  }
  return active
    ? "bg-white/[0.08] text-ink ring-1 ring-rule"
    : "text-muted hover:bg-white/5 hover:text-ink";
}

export function priorityTone(value: TaskPriority | string | null | undefined): "neutral" | "info" | "warn" | "danger" {
  const key = taskPriority(value);
  if (key === "urgent") return "danger";
  if (key === "high") return "warn";
  if (key === "low") return "neutral";
  return "info";
}

export function TaskCard({
  task,
  href,
  spaceName,
  assignee,
  onMove,
  onDelete,
}: {
  task: Task;
  href: string;
  spaceName?: string;
  assignee?: Profile | null;
  onMove?: (status: TaskStatus) => void;
  onDelete?: () => Promise<void> | void;
}) {
  const due = formatDueDate(task.due_date);
  const late = isOverdue(task.due_date, task.status);
  const priority = taskPriority(task.priority);
  const dragged = useRef(false);
  const comment = (task.description || "").trim();

  return (
    <article
      draggable={Boolean(onMove)}
      onDragStart={(e) => {
        if (!onMove) return;
        dragged.current = true;
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          dragged.current = false;
        }, 50);
      }}
      className={cn(
        "rounded-[12px] border border-rule bg-elevated p-3 shadow-card transition duration-200 hover:border-line-hover hover:bg-cream",
        onMove && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="flex items-start gap-2">
        {onMove ? <GripVertical size={14} className="mt-0.5 shrink-0 text-muted" /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={href}
              onClick={(e) => {
                if (dragged.current) e.preventDefault();
              }}
              className="font-medium leading-snug text-ink hover:text-blue-soft"
            >
              {task.title}
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              <Badge tone={priorityTone(priority)}>{TASK_PRIORITY_LABELS[priority]}</Badge>
              {onDelete ? (
                <ConfirmDelete
                  iconOnly
                  label="Delete task"
                  title="Delete this task?"
                  description="The task, comments, and files will be removed."
                  onConfirm={onDelete}
                />
              ) : null}
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
            {spaceName ? <span>{spaceName}</span> : null}
            <span>{assignee ? displayName(assignee) : "Unassigned"}</span>
            {due ? <span className={cn(late && "font-medium text-danger")}>{late ? `Overdue · ${due}` : due}</span> : null}
          </div>
          {comment ? <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">{comment}</p> : null}
          {onMove ? (
            <div className="mt-2.5 grid grid-cols-3 gap-1">
              {TASK_COLUMNS.map((col) => (
                <button
                  key={col.status}
                  type="button"
                  title={`Move to ${TASK_STATUS_LABELS[col.status]}`}
                  className={cn("rounded-md px-1.5 py-1 text-[11px] font-semibold transition duration-200", taskStatusClass(col.status, task.status === col.status))}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (task.status !== col.status) onMove(col.status);
                  }}
                >
                  {TASK_STATUS_LABELS[col.status]}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2">
              <Badge tone={taskBadgeTone(task)}>{TASK_STATUS_LABELS[task.status]}</Badge>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
