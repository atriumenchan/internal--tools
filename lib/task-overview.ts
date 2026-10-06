import { dueDateKey, isClosedToday, isOpenWork, isOverdue, kolkataDateKeyFromInstant, kolkataTodayKey } from "@/lib/datetime";
import { visibleSpaceTasks } from "@/lib/spaces";
import type { Task } from "@/lib/types";

export type TaskSlice = "today" | "all" | "left" | "closed" | "overdue";

export const TASKS_PAGE_SIZE = 20;

export function parseTaskSlice(value: string | null | undefined): TaskSlice {
  if (value === "left" || value === "open") return "left";
  if (value === "all" || value === "everything") return "all";
  if (value === "closed" || value === "done") return "closed";
  if (value === "overdue") return "overdue";
  return "today";
}

/** Due this IST day, created this day, or closed this day. */
export function isOnDay(
  task: Pick<Task, "due_date" | "created_at" | "updated_at" | "status">,
  day = kolkataTodayKey()
) {
  if (dueDateKey(task.due_date) === day) return true;
  if (kolkataDateKeyFromInstant(task.created_at) === day) return true;
  return isClosedToday(task, day);
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
  if (slice === "all") return tasks;
  if (slice === "today") return tasks.filter((task) => isOnDay(task, today));
  if (slice === "closed") return tasks.filter((task) => isClosedToday(task, today));
  if (slice === "overdue") return tasks.filter((task) => isOverdue(task.due_date, task.status, today));
  return tasks.filter((task) => isOpenWork(task.status));
}

export function taskSliceCounts<T extends Pick<Task, "status" | "due_date" | "updated_at" | "created_at">>(
  tasks: T[],
  today?: string
) {
  return {
    today: tasks.filter((task) => isOnDay(task, today)).length,
    all: tasks.length,
    left: tasks.filter((task) => isOpenWork(task.status)).length,
    closed: tasks.filter((task) => isClosedToday(task, today)).length,
    overdue: tasks.filter((task) => isOverdue(task.due_date, task.status, today)).length,
  };
}

export function filterTasksByDue<T extends { due_date?: string | null }>(tasks: T[], due?: string | null) {
  const key = dueDateKey(due);
  if (!key) return tasks;
  return tasks.filter((task) => dueDateKey(task.due_date) === key);
}

export function matchTaskQuery<T extends { title?: string | null; description?: string | null }>(
  task: T,
  query: string,
  extra: { spaceName?: string; assignee?: string; requester?: string } = {}
) {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = [task.title, task.description, extra.spaceName, extra.assignee, extra.requester]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

export function paginate<T>(rows: T[], page: number, pageSize = TASKS_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize;
  return { page: current, pages, start: start + 1, end: Math.min(start + pageSize, rows.length), rows: rows.slice(start, start + pageSize) };
}
