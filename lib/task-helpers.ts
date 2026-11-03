import type { Task, TaskHelper } from "@/lib/types";

export const TASK_HELPERS_SQL_HINT =
  "The Involved list needs a SQL patch. Paste supabase/task-helpers.sql in the Supabase SQL editor, then refresh.";

export function missingHelpersTable(message: string | null | undefined) {
  const m = (message || "").toLowerCase();
  return (
    (m.includes("task_helpers") || m.includes("set_task_help_done")) &&
    (m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find"))
  );
}

export type HelpAsk = { helper: TaskHelper; task: Task };

/** Open asks for this person on tasks that are still live, newest ask first. */
export function openHelpAsks(helpers: readonly TaskHelper[], tasks: readonly Task[], userId: string): HelpAsk[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const rows: HelpAsk[] = [];
  for (const helper of helpers) {
    if (helper.user_id !== userId || helper.status !== "open") continue;
    const task = byId.get(helper.task_id);
    if (!task || task.status === "done" || task.status === "cancelled") continue;
    rows.push({ helper, task });
  }
  return rows.sort((a, b) => b.helper.created_at.localeCompare(a.helper.created_at));
}
