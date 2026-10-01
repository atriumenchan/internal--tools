import { dueDateKey, isOverdue, kolkataDateKeyFromInstant, kolkataTodayKey } from "@/lib/datetime";

export type MetricTask = {
  status?: string | null;
  assignee_id?: string | null;
  created_by?: string | null;
  due_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  space_id?: string | null;
};

export type TaskOutcome = "on_time" | "late" | "overdue" | "left" | "cancelled";

export type TaskMetrics = {
  assigned: number;
  done: number;
  onTime: number;
  late: number;
  overdue: number;
  left: number;
  cancelled: number;
  /** Share of finished tasks that beat the due date. Null when nothing is finished. */
  onTimeRate: number | null;
};

export function closedDateKey(task: MetricTask) {
  return kolkataDateKeyFromInstant(task.updated_at || task.created_at);
}

export function taskOutcome(task: MetricTask, today = kolkataTodayKey()): TaskOutcome {
  if (task.status === "cancelled") return "cancelled";
  if (task.status === "done") {
    const due = dueDateKey(task.due_date);
    if (!due) return "on_time";
    const closed = closedDateKey(task);
    return closed && closed > due ? "late" : "on_time";
  }
  return isOverdue(task.due_date, task.status, today) ? "overdue" : "left";
}

export function taskMetrics<T extends MetricTask>(tasks: T[], today = kolkataTodayKey()): TaskMetrics {
  const counts = { on_time: 0, late: 0, overdue: 0, left: 0, cancelled: 0 };
  for (const task of tasks) counts[taskOutcome(task, today)] += 1;
  const done = counts.on_time + counts.late;
  return {
    assigned: tasks.length,
    done,
    onTime: counts.on_time,
    late: counts.late,
    overdue: counts.overdue,
    left: counts.left,
    cancelled: counts.cancelled,
    onTimeRate: done === 0 ? null : counts.on_time / done,
  };
}

/** Tasks the person has to do. `all` keeps every task. */
export function assignedTo<T extends MetricTask>(tasks: T[], person: string) {
  if (person === "all") return tasks;
  return tasks.filter((task) => task.assignee_id === person);
}

/** Tasks the person handed to someone else. */
export function givenByPerson<T extends MetricTask>(tasks: T[], person: string) {
  if (person === "all") return [];
  return tasks.filter((task) => task.created_by === person && task.assignee_id && task.assignee_id !== person);
}

export function personMetricRows<T extends MetricTask>(
  tasks: T[],
  personIds: string[],
  today = kolkataTodayKey()
) {
  return personIds
    .map((id) => ({ id, metrics: taskMetrics(assignedTo(tasks, id), today) }))
    .filter((row) => row.metrics.assigned > 0)
    .sort((a, b) => b.metrics.assigned - a.metrics.assigned || b.metrics.done - a.metrics.done);
}

export function spaceMetricRows<T extends MetricTask>(tasks: T[], today = kolkataTodayKey()) {
  const ids: string[] = [];
  for (const task of tasks) {
    const id = task.space_id || "";
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids
    .map((id) => ({ id, metrics: taskMetrics(tasks.filter((task) => task.space_id === id), today) }))
    .sort((a, b) => b.metrics.assigned - a.metrics.assigned);
}

/** Monday that starts the week holding this IST date key. */
export function weekStartKey(dateKey: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const back = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

export function weekLabel(startKey: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startKey);
  if (!m) return startKey;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

/** Given out vs finished, week by week, oldest first. */
export function weeklyTaskTrend<T extends MetricTask>(tasks: T[], weeks = 8, today = kolkataTodayKey()) {
  const thisWeek = weekStartKey(today);
  if (!thisWeek) return [];
  const starts: string[] = [];
  const cursor = new Date(`${thisWeek}T00:00:00.000Z`);
  for (let i = 0; i < weeks; i += 1) {
    starts.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return starts.map((start) => {
    let assigned = 0;
    let done = 0;
    for (const task of tasks) {
      const createdKey = kolkataDateKeyFromInstant(task.created_at);
      if (createdKey && weekStartKey(createdKey) === start) assigned += 1;
      if (task.status === "done") {
        const closed = closedDateKey(task);
        if (closed && weekStartKey(closed) === start) done += 1;
      }
    }
    return { start, label: weekLabel(start), assigned, done };
  });
}
