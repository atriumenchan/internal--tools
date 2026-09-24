import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, sendTelegram, taskAssignedText } from "@/lib/telegram";

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
  } | null;

  if (!body || body.kind !== "task_assigned" || !body.title?.trim() || !body.assigneeName?.trim()) {
    return NextResponse.json({ error: "Missing task details" }, { status: 400 });
  }

  const origin = appOrigin(request.url);
  const path = body.path?.startsWith("/") ? body.path : "";
  const result = await sendTelegram(
    taskAssignedText({
      title: body.title,
      assigneeName: body.assigneeName,
      byName: (body.byName || "Someone").trim(),
      spaceName: body.spaceName,
      due: body.due,
      url: origin && path ? `${origin}${path}` : undefined,
    })
  );
  return NextResponse.json(result);
}
