import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin";
import { appOrigin, normalizeTelegramId, sendTelegram, taskAssignedText } from "@/lib/telegram";

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
    assigneeId?: string | null;
  } | null;

  if (body?.kind === "test") {
    if (!isAdminUser({ email: user.email ?? profile?.email, role: profile?.role })) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const text = [
      "Telegram test from ADMEXO Workspace",
      "If you got this, task pings will reach you too.",
      "Group messages still go to Workspace notifications.",
    ].join("\n");
    const group = await sendTelegram(text);
    const admin = createAdminClient();
    const { data: rows, error } = await admin.from("profiles").select("id, full_name, telegram_id");
    if (error) {
      return NextResponse.json({
        ok: group.ok,
        group,
        dms: [],
        hint: error.message.includes("telegram_id")
          ? "Paste supabase/telegram-ids.sql in the Supabase SQL editor, then save each person’s Telegram id on Staff."
          : error.message,
      });
    }
    const dms: { name: string; ok: boolean; skipped?: boolean; error?: string }[] = [];
    for (const row of rows ?? []) {
      const id = normalizeTelegramId((row as { telegram_id?: string | null }).telegram_id);
      if (!id) {
        dms.push({ name: String(row.full_name || row.id), ok: false, skipped: true });
        continue;
      }
      const sent = await sendTelegram(text, id);
      dms.push({
        name: String(row.full_name || row.id),
        ok: sent.ok,
        skipped: sent.skipped,
        error: "error" in sent ? sent.error : undefined,
      });
    }
    return NextResponse.json({
      ok: group.ok || dms.some((d) => d.ok),
      group,
      dms,
    });
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
  const group = await sendTelegram(text);
  return NextResponse.json({ ok: dm.ok || group.ok, dm, group });
}
