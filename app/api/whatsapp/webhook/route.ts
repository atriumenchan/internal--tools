import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyToken() {
  return process.env.WHATSAPP_VERIFY_TOKEN || "admexo-whatsapp-verify";
}

/** Meta checks this URL with a GET before Production setup will continue. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken() && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

type WaError = { code?: number; title?: string; message?: string; error_data?: { details?: string } };
type WaStatus = { status?: string; recipient_id?: string; errors?: WaError[] };

/** Meta posts delivery receipts here. A failed receipt is the reason the phone stayed empty. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    entry?: { changes?: { value?: { statuses?: WaStatus[] } }[] }[];
  } | null;
  const failed: { phone: string; text: string }[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (status.status !== "failed") continue;
        const err = status.errors?.[0];
        const text = [err?.code, err?.title, err?.message, err?.error_data?.details].filter(Boolean).join(" — ");
        const phone = normalizeWhatsAppPhone(status.recipient_id);
        console.error("[whatsapp] not delivered", phone ? `…${phone.slice(-4)}` : "unknown", text);
        if (phone && text) failed.push({ phone, text });
      }
    }
  }
  if (failed.length) {
    try {
      const admin = createAdminClient();
      const { data: people } = await admin.from("profiles").select("id, full_name, email, role, whatsapp_phone");
      const admins = (people ?? []).filter((row) => isAdminUser({ email: row.email, role: row.role }));
      const rows: { user_id: string; type: string; title: string; body: string; href: string }[] = [];
      for (const item of failed) {
        const person = (people ?? []).find((row) => normalizeWhatsAppPhone(row.whatsapp_phone) === item.phone);
        const who = person?.full_name || `…${item.phone.slice(-4)}`;
        const targets = new Set([...(person ? [person.id] : []), ...admins.map((row) => row.id)]);
        for (const userId of targets) {
          rows.push({
            user_id: userId,
            type: "whatsapp_delivery",
            title: `WhatsApp did not deliver to ${who}`,
            body: item.text.slice(0, 280),
            href: "/team",
          });
        }
      }
      if (rows.length) await admin.from("notifications").insert(rows);
    } catch (e) {
      console.error("[whatsapp] could not store delivery error", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ ok: true });
}
