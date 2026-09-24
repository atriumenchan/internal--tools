import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appOrigin, normalizeTelegramId, sendTelegram, taskAssignedText } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

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
