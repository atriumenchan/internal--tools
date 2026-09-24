export function pingTaskAssigned(payload: {
  title: string;
  assigneeName: string;
  byName: string;
  spaceName?: string;
  due?: string | null;
  path?: string;
}) {
  void fetch("/api/telegram/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "task_assigned", ...payload }),
  }).catch(() => {});
}
