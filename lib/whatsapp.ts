import { createAdminClient } from "@/lib/supabase/admin";
import { isIgnoredEmployee } from "@/lib/admin";
import { isOverdue, kolkataTodayKey } from "@/lib/datetime";
import { displayName } from "@/lib/spaces";

const DEFAULT_PHONE_ID = "1269726706235216";
const DEFAULT_WABA_ID = "1438727304857568";
const FALLBACK_WABA_IDS = ["1438727304857568", "4130948003709192"];
const DEFAULT_TEMPLATE = "admexo_workspace_alert";
const DEFAULT_TEMPLATE_LANG = "en";

export function whatsappConfig() {
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || DEFAULT_PHONE_ID).trim();
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    wabaId: (process.env.WHATSAPP_WABA_ID || DEFAULT_WABA_ID).trim(),
    templateName: (process.env.WHATSAPP_TEMPLATE_NAME || DEFAULT_TEMPLATE).trim(),
    templateLang: (process.env.WHATSAPP_TEMPLATE_LANG || DEFAULT_TEMPLATE_LANG).trim(),
  };
}

/** Meta template parameters cannot contain newlines or long runs of spaces. */
export function sanitizeTemplateParam(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 1024);
}

/** Title + remaining lines for the two-variable utility template. */
export function templateParamsFromText(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = sanitizeTemplateParam(lines[0] || "ADMEXO Workspace");
  const detail = sanitizeTemplateParam(lines.slice(1).join(" — ") || heading);
  return { heading, detail };
}

/** India 10-digit mobiles become 91XXXXXXXXXX. Other E.164 digits stay as-is. */
export function normalizeWhatsAppPhone(value: string | null | undefined) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function stripWhatsAppLinks(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^https?:\/\//i.test(line) && !/\.vercel\.app/i.test(line) && !/workspace\.admexo\.us/i.test(line))
    .join("\n");
}

/** Task title and who created it. No app links. */
export function whatsappTaskText(input: { title: string; byName?: string | null; overdue?: boolean }) {
  const title = String(input.title || "").trim() || "Untitled";
  const from = String(input.byName || "").trim();
  const lines = input.overdue ? ["This task is overdue", title] : [title];
  if (from) lines.push(`From ${from}`);
  return lines.join("\n");
}

/** Inbox pings (chat, tasks, comments, mentions, announcements) all go to WhatsApp. */
export function shouldSendWhatsAppNotification(_type?: string | null) {
  return true;
}

export function notificationText(input: { title?: string | null; body?: string | null; href?: string | null; origin?: string }) {
  const lines = [String(input.title || "").trim() || "ADMEXO"].filter(Boolean);
  const body = String(input.body || "").trim();
  if (body) lines.push(body);
  return stripWhatsAppLinks(lines.join("\n"));
}

type GraphError = { error?: { message?: string; error_data?: { details?: string } } };

async function graphJson(config: NonNullable<ReturnType<typeof whatsappConfig>>, path: string, body?: unknown) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text().catch(() => "");
  let parsed: GraphError & Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as GraphError & Record<string, unknown>;
  } catch {
    parsed = { error: { message: raw.slice(0, 240) } };
  }
  const detail =
    parsed.error?.error_data?.details || parsed.error?.message || (res.ok ? "" : raw.slice(0, 240));
  return { ok: res.ok, parsed, error: detail };
}

type TemplateRow = { name?: string; status?: string; language?: string; category?: string };
type ListedTemplates = {
  listed: { ok: boolean; parsed: Record<string, unknown>; error: string };
  rows: TemplateRow[];
};

let templateListCache: { at: number; result: ListedTemplates } | null = null;

async function listedTemplates(config: NonNullable<ReturnType<typeof whatsappConfig>>) {
  if (templateListCache && Date.now() - templateListCache.at < 120_000) return templateListCache.result;
  const ids = [...new Set([config.wabaId, ...FALLBACK_WABA_IDS].filter(Boolean))];
  let listed = { ok: false as boolean, parsed: {} as Record<string, unknown>, error: "" };
  let rows: TemplateRow[] = [];
  for (const wabaId of ids) {
    listed = await graphJson(
      config,
      `${wabaId}/message_templates?name=${encodeURIComponent(config.templateName)}&fields=name,status,language,category&limit=10`
    );
    rows = ((listed.parsed.data as TemplateRow[] | undefined) ?? []).filter((row) => row.name === config.templateName);
    if (rows.length) break;
  }
  const result = { listed, rows };
  templateListCache = { at: Date.now(), result };
  return result;
}

export async function ensureWhatsAppTemplate() {
  const config = whatsappConfig();
  if (!config) return { ok: false as const, status: "missing" as const, error: "WhatsApp is not set on this deployment." };

  const { listed, rows } = await listedTemplates(config);
  const approved = rows.find((row) => String(row.status || "").toUpperCase() === "APPROVED");
  if (approved) {
    return { ok: true as const, status: "approved" as const, language: approved.language || config.templateLang };
  }
  const pending = rows.find((row) => {
    const status = String(row.status || "").toUpperCase();
    return status === "PENDING" || status === "IN_APPEAL";
  });
  if (pending) {
    return { ok: false as const, status: "pending" as const, error: "Meta is still reviewing the WhatsApp template." };
  }

  const payload = {
    name: config.templateName,
    language: config.templateLang,
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Admexo workspace: {{1}} - {{2}}. Open the app for the full task.",
        example: {
          body_text: [["Ryan assigned you a task", "Close the books"]],
        },
      },
    ],
  };
  let created = await graphJson(config, `${config.wabaId}/message_templates`, {
    ...payload,
    parameter_format: "positional",
  });
  if (!created.ok && /parameter_format/i.test(created.error)) {
    created = await graphJson(config, `${config.wabaId}/message_templates`, payload);
  }
  if (created.ok) {
    return { ok: false as const, status: "pending" as const, error: "One-way template submitted to Meta. Alerts go out after they approve it." };
  }
  const already = /already exists|duplicate/i.test(created.error);
  if (already) {
    const again = await listedTemplates(config);
    const live = again.rows.find((row) => String(row.status || "").toUpperCase() === "APPROVED");
    if (live) return { ok: true as const, status: "approved" as const, language: live.language || config.templateLang };
    return { ok: false as const, status: "pending" as const, error: created.error };
  }
  return { ok: false as const, status: "missing" as const, error: created.error || listed.error };
}

async function sendWhatsAppSession(phone: string, text: string, config: NonNullable<ReturnType<typeof whatsappConfig>>) {
  return graphJson(config, `${config.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { preview_url: true, body: text.slice(0, 4000) },
  });
}

async function sendWhatsAppTemplate(phone: string, text: string, config: NonNullable<ReturnType<typeof whatsappConfig>>) {
  const { rows } = await listedTemplates(config);
  const approved = rows.find((row) => String(row.status || "").toUpperCase() === "APPROVED");
  if (!approved && rows.some((row) => /PENDING|IN_APPEAL/i.test(String(row.status || "")))) {
    return { ok: false as const, error: "Meta is still reviewing the WhatsApp template." };
  }
  const { heading, detail } = templateParamsFromText(text);
  const langs = [...new Set([approved?.language, "en", config.templateLang, "en_US"].filter(Boolean) as string[])];
  const bodies = [
    [
      { type: "text", text: heading },
      { type: "text", text: detail },
    ],
    [
      { type: "text", parameter_name: "1", text: heading },
      { type: "text", parameter_name: "2", text: detail },
    ],
  ];
  let last = { ok: false as boolean, error: "WhatsApp template did not send" };
  for (const code of langs.slice(0, 2)) {
    for (const parameters of bodies) {
      const sent = await graphJson(config, `${config.phoneNumberId}/messages`, {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: config.templateName,
          language: { code },
          components: [{ type: "body", parameters }],
        },
      });
      if (sent.ok) return sent;
      last = sent;
    }
  }
  return last;
}

export async function inspectWhatsApp() {
  const config = whatsappConfig();
  if (!config) {
    return {
      ok: false as const,
      hasToken: false,
      error: "WHATSAPP_ACCESS_TOKEN is not set on Vercel Production. Add it, then Redeploy.",
    };
  }
  const { listed, rows } = await listedTemplates(config);
  const templates = rows.map((row) => ({
    name: row.name || config.templateName,
    status: row.status || "unknown",
    language: row.language || "",
    category: row.category || "",
  }));
  const approved = templates.find((row) => row.status.toUpperCase() === "APPROVED");
  return {
    ok: Boolean(approved),
    hasToken: true,
    phoneNumberId: config.phoneNumberId,
    wabaId: config.wabaId,
    templateName: config.templateName,
    templates,
    error: listed.ok
      ? approved
        ? undefined
        : templates.length
          ? `Template status is ${templates.map((row) => row.status).join(", ")}, not Active.`
          : "No admexo_workspace_alert template on this WABA."
      : listed.error,
  };
}

export async function sendWhatsApp(to: string, text: string) {
  const config = whatsappConfig();
  const phone = normalizeWhatsAppPhone(to);
  if (!config) {
    return {
      ok: false as const,
      skipped: true as const,
      error: "WHATSAPP_ACCESS_TOKEN is not set on Vercel Production. Add it, then Redeploy.",
    };
  }
  if (!phone) return { ok: false as const, skipped: true as const, error: "Need a mobile number" };
  const message = stripWhatsAppLinks(text);
  if (!message.trim()) return { ok: false as const, skipped: true as const };

  const templated = await sendWhatsAppTemplate(phone, message, config);
  if (templated.ok) return { ok: true as const, skipped: false as const, via: "template" as const };

  const session = await sendWhatsAppSession(phone, message, config);
  if (session.ok) return { ok: true as const, skipped: false as const, via: "session" as const };

  const error = templated.error || session.error || "WhatsApp did not send";
  return { ok: false as const, skipped: false as const, error };
}

export async function sendWhatsAppToUser(userId: string, text: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("whatsapp_phone").eq("id", userId).maybeSingle();
  if (error) {
    return {
      ok: false as const,
      skipped: true as const,
      error: error.message.includes("whatsapp_phone")
        ? "Paste supabase/whatsapp-phones.sql in the Supabase SQL editor, then save the number on Staff."
        : error.message,
    };
  }
  const phone = normalizeWhatsAppPhone((data as { whatsapp_phone?: string | null } | null)?.whatsapp_phone);
  if (!phone) {
    return { ok: false as const, skipped: true as const, error: "This person has no WhatsApp number on Staff." };
  }
  return sendWhatsApp(phone, text);
}

export function overdueTaskHref(spaceId: string, taskId: string) {
  return `/spaces/${spaceId}/tasks/${taskId}`;
}

/** One in-app + WhatsApp alert per overdue task, until it is pinged. */
export async function queueOverdueTaskNotices(limit = 25) {
  const admin = createAdminClient();
  const today = kolkataTodayKey();
  const { data: tasks, error } = await admin
    .from("tasks")
    .select("id, space_id, title, assignee_id, created_by, due_date, status")
    .not("assignee_id", "is", null);
  if (error || !tasks?.length) return { queued: 0 };

  const overdue = tasks.filter((task) => isOverdue(task.due_date, task.status, today) && task.assignee_id);
  if (!overdue.length) return { queued: 0 };

  const hrefs = overdue.map((task) => overdueTaskHref(task.space_id, task.id));
  const { data: existing } = await admin.from("notifications").select("href").eq("type", "task_overdue").in("href", hrefs);
  const already = new Set((existing ?? []).map((row) => row.href));

  const peopleIds = [...new Set(overdue.flatMap((task) => [task.assignee_id, task.created_by].filter(Boolean).map(String)))];
  const { data: people } = await admin.from("profiles").select("id, full_name, email, role").in("id", peopleIds);
  const profiles = Object.fromEntries((people ?? []).map((row) => [row.id, row]));

  const rows: {
    user_id: string;
    actor_id: string | null;
    type: string;
    title: string;
    body: string;
    href: string;
  }[] = [];
  for (const task of overdue) {
    const href = overdueTaskHref(task.space_id, task.id);
    if (already.has(href)) continue;
    if (isIgnoredEmployee(null, profiles[String(task.assignee_id)]?.full_name)) continue;
    const creator = task.created_by ? displayName(profiles[String(task.created_by)]) : "";
    const taskTitle = String(task.title || "Untitled").trim() || "Untitled";
    rows.push({
      user_id: String(task.assignee_id),
      actor_id: task.created_by && task.created_by !== task.assignee_id ? String(task.created_by) : null,
      type: "task_overdue",
      title: "This task is overdue",
      body: creator ? `${taskTitle}\nFrom ${creator}` : taskTitle,
      href,
    });
    if (rows.length >= limit) break;
  }
  if (!rows.length) return { queued: 0 };
  const { error: insertError } = await admin.from("notifications").insert(rows);
  if (insertError) return { queued: 0 };
  return { queued: rows.length };
}

/** After a live assignment ping, skip draining that same in-app row. */
export async function markTaskAssignedWhatsAppSent(userId: string) {
  const admin = createAdminClient();
  await admin
    .from("notifications")
    .update({ whatsapp_sent_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("type", "task_assigned")
    .is("whatsapp_sent_at", null);
}

type PendingNote = {
  id: string;
  user_id: string;
  type?: string | null;
  title: string;
  body: string | null;
  href: string | null;
};

/** Sends leftover in-app pings over WhatsApp. Cron can queue overdue; chat passes href to send that ping now. */
export async function drainWhatsAppNotifications(options?: { limit?: number; overdue?: boolean; href?: string | null }) {
  const href = options?.href?.trim() || "";
  const limit = options?.limit ?? (href ? 20 : 8);
  const overdue = options?.overdue ? await queueOverdueTaskNotices(limit).catch(() => ({ queued: 0 })) : { queued: 0 };
  if (!whatsappConfig()) {
    return { ok: false, sent: 0, queued: overdue.queued, errors: [] as string[], error: "WhatsApp is not set on this deployment." };
  }
  const admin = createAdminClient();
  let query = admin
    .from("notifications")
    .select("id, user_id, type, title, body, href")
    .order("created_at", { ascending: false })
    .limit(limit);
  query = href
    ? query.eq("href", href).gte("created_at", new Date(Date.now() - 3 * 60_000).toISOString())
    : query.is("whatsapp_sent_at", null);
  const { data, error } = await query;
  if (error) {
    return {
      ok: false,
      sent: 0,
      queued: overdue.queued,
      errors: [] as string[],
      error: error.message.includes("whatsapp_sent_at")
        ? "WhatsApp phones need a SQL patch. Paste supabase/whatsapp-phones.sql in the Supabase SQL editor."
        : error.message,
    };
  }

  const seen = new Set<string>();
  let sent = 0;
  const errors: string[] = [];
  for (const row of (data ?? []) as PendingNote[]) {
    if (!shouldSendWhatsAppNotification(row.type)) continue;
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    const text = notificationText(row);
    const result = await sendWhatsAppToUser(row.user_id, text);
    const noPhone = /no WhatsApp number/i.test(result.error || "");
    if (result.ok || (result.skipped && noPhone)) {
      await admin.from("notifications").update({ whatsapp_sent_at: new Date().toISOString() }).eq("id", row.id);
      if (result.ok) sent += 1;
      else if (result.error) errors.push(result.error);
      continue;
    }
    const detail = result.error || "WhatsApp did not send";
    console.error("[whatsapp] send failed", row.type, detail);
    errors.push(detail);
  }
  return { ok: true, sent, queued: overdue.queued, errors };
}
