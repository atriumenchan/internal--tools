import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_PHONE_ID = "1269726706235216";
const DEFAULT_WABA_ID = "4130948003709192";
const DEFAULT_TEMPLATE = "admexo_workspace_alert";
const DEFAULT_TEMPLATE_LANG = "en_US";

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

export function notificationText(input: { title?: string | null; body?: string | null; href?: string | null; origin?: string }) {
  const lines = [String(input.title || "").trim() || "ADMEXO"].filter(Boolean);
  const body = String(input.body || "").trim();
  if (body) lines.push(body);
  const href = String(input.href || "").trim();
  const origin = (input.origin || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (href.startsWith("http")) lines.push(href);
  else if (href.startsWith("/") && origin) lines.push(`${origin}${href}`);
  return lines.join("\n");
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

let templateStatus: "approved" | "pending" | "missing" | null = null;

export async function ensureWhatsAppTemplate() {
  const config = whatsappConfig();
  if (!config) return { ok: false as const, status: "missing" as const, error: "WhatsApp is not set on this deployment." };
  if (templateStatus === "approved") return { ok: true as const, status: "approved" as const };

  const listed = await graphJson(
    config,
    `${config.wabaId}/message_templates?name=${encodeURIComponent(config.templateName)}&limit=5`
  );
  const rows = (listed.parsed.data as { name?: string; status?: string }[] | undefined) ?? [];
  const mine = rows.find((row) => row.name === config.templateName);
  const status = String(mine?.status || "").toUpperCase();
  if (status === "APPROVED") {
    templateStatus = "approved";
    return { ok: true as const, status: "approved" as const };
  }
  if (status === "PENDING" || status === "IN_APPEAL") {
    templateStatus = "pending";
    return { ok: false as const, status: "pending" as const, error: "Meta is still approving the one-way WhatsApp template." };
  }

  const payload = {
    name: config.templateName,
    language: config.templateLang,
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "{{1}}\n{{2}}",
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
    templateStatus = "pending";
    return { ok: false as const, status: "pending" as const, error: "One-way template submitted to Meta. Alerts go out after they approve it." };
  }
  const already = /already exists|duplicate/i.test(created.error);
  if (already) {
    templateStatus = "pending";
    return { ok: false as const, status: "pending" as const, error: created.error };
  }
  templateStatus = "missing";
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
  const ready = await ensureWhatsAppTemplate();
  if (!ready.ok) return ready;
  const { heading, detail } = templateParamsFromText(text);
  return graphJson(config, `${config.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: heading },
            { type: "text", text: detail },
          ],
        },
      ],
    },
  });
}

export async function sendWhatsApp(to: string, text: string) {
  const config = whatsappConfig();
  const phone = normalizeWhatsAppPhone(to);
  if (!config) return { ok: false as const, skipped: true as const };
  if (!phone) return { ok: false as const, skipped: true as const, error: "Need a mobile number" };
  if (!text.trim()) return { ok: false as const, skipped: true as const };

  const templated = await sendWhatsAppTemplate(phone, text, config);
  if (templated.ok) return { ok: true as const, skipped: false as const, via: "template" as const };

  const session = await sendWhatsAppSession(phone, text, config);
  if (session.ok) return { ok: true as const, skipped: false as const, via: "session" as const };

  const error = templated.error || session.error || "WhatsApp did not send";
  return { ok: false as const, skipped: false as const, error };
}

export async function sendWhatsAppToUser(userId: string, text: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("whatsapp_phone").eq("id", userId).maybeSingle();
  const phone = normalizeWhatsAppPhone((data as { whatsapp_phone?: string | null } | null)?.whatsapp_phone);
  if (!phone) return { ok: false as const, skipped: true as const };
  return sendWhatsApp(phone, text);
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
  title: string;
  body: string | null;
  href: string | null;
};

/** Sends new in-app alerts over WhatsApp, then marks them so they are not sent twice. */
export async function drainWhatsAppNotifications(limit = 25) {
  if (!whatsappConfig()) return { ok: false, sent: 0, error: "WhatsApp is not set on this deployment." };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("id, user_id, title, body, href")
    .is("whatsapp_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    return {
      ok: false,
      sent: 0,
      error: error.message.includes("whatsapp_sent_at")
        ? "WhatsApp phones need a SQL patch. Paste supabase/whatsapp-phones.sql in the Supabase SQL editor."
        : error.message,
    };
  }

  let sent = 0;
  for (const row of (data ?? []) as PendingNote[]) {
    const text = notificationText(row);
    const result = await sendWhatsAppToUser(row.user_id, text);
    if (result.ok || result.skipped) {
      await admin.from("notifications").update({ whatsapp_sent_at: new Date().toISOString() }).eq("id", row.id);
      if (result.ok) sent += 1;
    }
  }
  return { ok: true, sent };
}
