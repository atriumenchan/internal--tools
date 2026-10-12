/** Pushes leftover in-app pings to WhatsApp and returns what happened. */
export async function pingWhatsApp(href?: string) {
  try {
    const res = await fetch("/api/whatsapp/drain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(href ? { href } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      sent?: number;
      error?: string;
      errors?: string[];
    };
    if (!res.ok || json.error || (json.errors && json.errors.length)) {
      console.error("[whatsapp] drain", res.status, json);
    }
    return { ok: res.ok && json.ok !== false, sent: json.sent ?? 0, error: json.error, errors: json.errors ?? [] };
  } catch (e) {
    const error = e instanceof Error ? e.message : "WhatsApp drain failed";
    console.error("[whatsapp] drain", error);
    return { ok: false, sent: 0, error, errors: [error] };
  }
}

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
