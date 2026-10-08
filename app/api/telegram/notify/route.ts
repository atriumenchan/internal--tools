import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin";
import { appOrigin, normalizeTelegramId, sendTelegram, taskAssignedText } from "@/lib/telegram";
import { drainWhatsAppNotifications, normalizeWhatsAppPhone, sendWhatsApp, sendWhatsAppToUser } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role, email, full_name").eq("id", user.id).maybeSingle();
  return { user, profile };
}

export async function POST(request: Request) {
  const session = await signedIn();
  if ("error" in session && session.error) return session.error;
  const { user, profile } = session;

  const body = (await request.json().catch(() => null)) as {
    kind?: string;
    title?: string;
    assigneeName?: string;
    byName?: string;
    spaceName?: string;
    due?: string | null;
    path?: string;
    workDate?: string | null;
    assigneeId?: string | null;
  } | null;

  if (body?.kind === "test") {
    if (!isAdminUser({ email: user.email ?? profile?.email, role: profile?.role })) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const text = [
      "ADMEXO Workspace test",
      "If you got this, task and chat pings will reach this number too.",
    ].join("\n");
    const group = await sendTelegram(text);
    const admin = createAdminClient();
    const { data: rows, error } = await admin.from("profiles").select("id, full_name, telegram_id, whatsapp_phone");
    if (error) {
      return NextResponse.json({
        ok: group.ok,
        group,
        dms: [],
        whatsapp: [],
        hint: error.message.includes("whatsapp_phone")
          ? "Paste supabase/whatsapp-phones.sql in the Supabase SQL editor, then save each person’s WhatsApp on Staff."
          : error.message.includes("telegram_id")
            ? "Paste supabase/telegram-ids.sql in the Supabase SQL editor, then save each person’s Telegram id on Staff."
            : error.message,
      });
    }
    const dms: { name: string; ok: boolean; skipped?: boolean; error?: string }[] = [];
    const whatsapp: { name: string; ok: boolean; skipped?: boolean; error?: string }[] = [];
    for (const row of rows ?? []) {
      const name = String(row.full_name || row.id);
      const id = normalizeTelegramId((row as { telegram_id?: string | null }).telegram_id);
      if (!id) dms.push({ name, ok: false, skipped: true });
      else {
        const sent = await sendTelegram(text, id);
        dms.push({ name, ok: sent.ok, skipped: sent.skipped, error: "error" in sent ? sent.error : undefined });
      }
      const phone = normalizeWhatsAppPhone((row as { whatsapp_phone?: string | null }).whatsapp_phone);
      if (!phone) whatsapp.push({ name, ok: false, skipped: true });
      else {
        const sent = await sendWhatsApp(phone, text);
        whatsapp.push({ name, ok: sent.ok, skipped: sent.skipped, error: "error" in sent ? sent.error : undefined });
      }
    }
    return NextResponse.json({
      ok: group.ok || dms.some((d) => d.ok) || whatsapp.some((d) => d.ok),
      group,
      dms,
      whatsapp,
    });
  }

  if (body?.kind === "wfh_request") {
    const workDate = String(body.workDate || "").slice(0, 10);
    const byName = (body.byName || profile?.full_name || "Someone").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }
    const text = [`${byName} sent WFH for approval`, workDate, "Approve it on WFH"].join("\n");
    const group = await sendTelegram(text);
    const admin = createAdminClient();
    const { data: rows } = await admin.from("profiles").select("email, role, telegram_id, whatsapp_phone");
    const dms = [];
    const whatsapp = [];
    for (const row of rows ?? []) {
      if (!isAdminUser({ email: row.email, role: row.role })) continue;
      const id = normalizeTelegramId((row as { telegram_id?: string | null }).telegram_id);
      if (id) dms.push(await sendTelegram(text, id));
      const phone = normalizeWhatsAppPhone((row as { whatsapp_phone?: string | null }).whatsapp_phone);
      if (phone) whatsapp.push(await sendWhatsApp(phone, text));
    }
    return NextResponse.json({ ok: group.ok || dms.some((d) => d.ok) || whatsapp.some((d) => d.ok), group, dms, whatsapp });
  }

  if (!body || body.kind !== "task_assigned" || !body.title?.trim() || !body.assigneeName?.trim()) {
    return NextResponse.json({ error: "Missing task details" }, { status: 400 });
  }

  const origin = appOrigin(request.url);
  const path = body.path?.startsWith("/") ? body.path : "";
  const text = taskAssignedText({
    title: body.title,
    assigneeName: body.assigneeName,
    byName: (body.byName || "Someone").trim(),
    spaceName: body.spaceName,
    due: body.due,
    url: origin && path ? `${origin}${path}` : undefined,
  });

  let dmId: string | null = null;
  if (body.assigneeId) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.from("profiles").select("telegram_id").eq("id", body.assigneeId).maybeSingle();
      dmId = normalizeTelegramId((data as { telegram_id?: string | null } | null)?.telegram_id);
    } catch {
      dmId = null;
    }
  }

  const dm = dmId ? await sendTelegram(text, dmId) : { ok: false as const, skipped: true };
  const wa = body.assigneeId ? await sendWhatsAppToUser(body.assigneeId, text) : { ok: false as const, skipped: true as const };
  const group = await sendTelegram(text);
  void drainWhatsAppNotifications().catch(() => {});
  return NextResponse.json({ ok: dm.ok || group.ok || wa.ok, dm, group, whatsapp: wa });
}
