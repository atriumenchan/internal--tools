export async function sendTelegram(text: string, chatId?: string | null) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const to = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !to) return { ok: false as const, skipped: true };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: to,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false as const, skipped: false, error: body.slice(0, 200) };
  }
  return { ok: true as const, skipped: false };
}

export function normalizeTelegramId(value: string | null | undefined) {
  const text = String(value || "").trim().replace(/\s/g, "");
  if (!text) return null;
  if (!/^-?\d{5,20}$/.test(text)) return null;
  return text;
}

export function taskAssignedText(input: {
  title: string;
  assigneeName: string;
  byName: string;
  spaceName?: string;
  due?: string | null;
  url?: string;
}) {
  const lines = [`${input.assigneeName} has a new task`, input.title.trim() || "Untitled"];
  if (input.spaceName) lines.push(`Board: ${input.spaceName}`);
  if (input.due) lines.push(`Due: ${input.due}`);
  lines.push(`From ${input.byName}`);
  if (input.url) lines.push(input.url);
  return lines.join("\n");
}

export function appOrigin(requestUrl: string) {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (env) return env;
  try {
    return new URL(requestUrl).origin;
  } catch {
    return "";
  }
}
