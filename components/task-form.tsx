"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { displayName, TASK_PRIORITIES, TASK_PRIORITY_LABELS, taskPriority } from "@/lib/spaces";
import { dueDateKey } from "@/lib/datetime";
import type { Profile, Task, TaskPriority } from "@/lib/types";

export type TaskDraft = {
  title: string;
  assigneeId: string;
  dueDate: string;
  priority: TaskPriority;
  comment: string;
  criteria: string;
};

export function draftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    assigneeId: task.assignee_id || "",
    dueDate: dueDateKey(task.due_date) || "",
    priority: taskPriority(task.priority),
    comment: task.description || "",
    criteria: task.completion_criteria || "",
  };
}

export function TaskForm({
  members,
  initial,
  submitLabel,
  busyLabel,
  onCancel,
  onSubmit,
}: {
  members: Profile[];
  initial?: Partial<TaskDraft>;
  submitLabel: string;
  busyLabel: string;
  onCancel: () => void;
  onSubmit: (values: TaskDraft) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId || "");
  const [dueDate, setDueDate] = useState(initial?.dueDate || "");
  const [priority, setPriority] = useState<TaskPriority>(taskPriority(initial?.priority));
  const [comment, setComment] = useState(initial?.comment || "");
  const [criteria, setCriteria] = useState(initial?.criteria || "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!title.trim() || busy) return;
        setBusy(true);
        const ok = await onSubmit({
          title,
          assigneeId,
          dueDate,
          priority: taskPriority(priority),
          comment,
          criteria,
        });
        if (!ok) setBusy(false);
      }}
      className="space-y-2.5 rounded-[10px] border border-rule bg-surface p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]"
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
      <Field label="Notes">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="min-h-[4.5rem]"
          placeholder="What this is, and any links"
        />
      </Field>
      <Field label="Done looks like">
        <Textarea
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          rows={2}
          className="min-h-[3.5rem]"
          placeholder="What should be true when this is finished?"
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
