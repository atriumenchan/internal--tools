import { isClosedToday, isOpenWork, isOverdue } from "@/lib/datetime";
import { visibleSpaceTasks } from "@/lib/spaces";
import type { Task } from "@/lib/types";

export type TaskSlice = "left" | "closed" | "overdue";

export function parseTaskSlice(value: string | null | undefined): TaskSlice {
  if (value === "closed" || value === "done") return "closed";
  if (value === "overdue") return "overdue";
  return "left";
}

export function tasksForPerson<T extends { assignee_id: string | null; created_by: string }>(
  tasks: T[],
  person: string,
  myId: string | undefined
) {
  if (!myId) return [];
  if (person === "all") return tasks;
  return visibleSpaceTasks(tasks, person === myId ? "me" : person, myId);
}

export function sliceTasks<T extends Pick<Task, "status" | "due_date" | "updated_at" | "created_at">>(
  tasks: T[],
  slice: TaskSlice,
  today?: string
) {
  if (slice === "closed") return tasks.filter((task) => isClosedToday(task, today));
  if (slice === "overdue") return tasks.filter((task) => isOverdue(task.due_date, task.status, today));
  return tasks.filter((task) => isOpenWork(task.status));
}

export function taskSliceCounts<T extends Pick<Task, "status" | "due_date" | "updated_at" | "created_at">>(
  tasks: T[],
  today?: string
) {
  return {
    left: tasks.filter((task) => isOpenWork(task.status)).length,
    closed: tasks.filter((task) => isClosedToday(task, today)).length,
    overdue: tasks.filter((task) => isOverdue(task.due_date, task.status, today)).length,
  };
}
