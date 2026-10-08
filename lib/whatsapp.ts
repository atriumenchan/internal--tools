import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_PHONE_ID = "1269726706235216";

export function whatsappConfig() {
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || DEFAULT_PHONE_ID).trim();
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
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

export async function sendWhatsApp(to: string, text: string) {
  const config = whatsappConfig();
  const phone = normalizeWhatsAppPhone(to);
  if (!config) return { ok: false as const, skipped: true as const };
  if (!phone) return { ok: false as const, skipped: true as const, error: "Need a mobile number" };
  if (!text.trim()) return { ok: false as const, skipped: true as const };

  const res = await fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { preview_url: true, body: text.slice(0, 4000) },
    }),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let detail = raw.slice(0, 240);
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string; error_data?: { details?: string } } };
      detail = parsed.error?.error_data?.details || parsed.error?.message || detail;
    } catch {
      /* keep slice */
    }
    return { ok: false as const, skipped: false as const, error: detail };
  }
  return { ok: true as const, skipped: false as const };
}

export async function sendWhatsAppToUser(userId: string, text: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("whatsapp_phone").eq("id", userId).maybeSingle();
  const phone = normalizeWhatsAppPhone((data as { whatsapp_phone?: string | null } | null)?.whatsapp_phone);
  if (!phone) return { ok: false as const, skipped: true as const };
  return sendWhatsApp(phone, text);
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
