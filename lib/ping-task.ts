/** WhatsApp (and Telegram) as soon as a task exists or changes assignee. */
export function pingNewTask(taskId: string | null | undefined) {
  if (!taskId) return;
  void fetch("/api/telegram/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "task", taskId }),
  }).catch(() => {});
}

export function pingTaskAssigned(payload: {
  title: string;
  assigneeName: string;
  byName: string;
  spaceName?: string;
  due?: string | null;
  path?: string;
  assigneeId?: string | null;
}) {
  const fromPath = payload.path ? /\/tasks\/([^/?#]+)/.exec(payload.path)?.[1] : null;
  if (fromPath) {
    pingNewTask(fromPath);
    return;
  }
  void fetch("/api/telegram/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "task_assigned", ...payload }),
  }).catch(() => {});
}
