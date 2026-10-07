import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { asciiFileName, deleteFromR2, presignR2, r2Config } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_MAX = 8 * 1024 * 1024;
const R2_MAX = 50 * 1024 * 1024;

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, id: user.id } : null;
}

function mbLabel(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function pathFor(conversationId: string, fileName: string) {
  return `chat/${conversationId}/${Date.now()}-${fileName.replace(/[^\w.-]+/g, "_").slice(0, 120)}`;
}

/** One-time upload URL for a chat photo or file. */
export async function POST(request: Request) {
  const me = await actor();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let payload: { conversationId?: string; fileName?: string; fileSize?: number };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const conversationId = String(payload.conversationId || "");
  const fileName = String(payload.fileName || "").trim();
  const fileSize = Number(payload.fileSize || 0);
  if (!conversationId || !fileName) return NextResponse.json({ error: "Missing chat or file name" }, { status: 400 });

  const { data: member } = await me.supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", me.id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Not in this chat." }, { status: 403 });

  const config = r2Config();
  const limit = config ? R2_MAX : SUPABASE_MAX;
  if (fileSize > limit) {
    return NextResponse.json({ error: `Each file must be ${mbLabel(limit)} or smaller.` }, { status: 400 });
  }

  const path = pathFor(conversationId, fileName);
  if (!config) return NextResponse.json({ storage: "supabase", path });
  return NextResponse.json({ storage: "r2", path, url: presignR2(config, "PUT", path, 600) });
}

/** Opens a chat file. Redirects to a short-lived link. */
export async function GET(request: Request) {
  const me = await actor();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const { data: file } = await me.supabase
    .from("messages")
    .select("id, conversation_id, file_path, file_name, storage")
    .eq("id", id)
    .maybeSingle();
  if (!file?.file_path) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const { data: member } = await me.supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", file.conversation_id)
    .eq("user_id", me.id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Not in this chat." }, { status: 403 });

  if (file.storage === "r2") {
    const config = r2Config();
    if (!config) return NextResponse.json({ error: "Cloud storage is not set up on this deployment." }, { status: 500 });
    const url = presignR2(config, "GET", file.file_path, 120, {
      "response-content-disposition": `inline; filename="${asciiFileName(file.file_name || "file")}"`,
    });
    return NextResponse.redirect(url, 302);
  }

  const { data, error } = await me.supabase.storage.from("chat-files").createSignedUrl(file.file_path, 120);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || "Could not open file." }, { status: 400 });
  return NextResponse.redirect(data.signedUrl, 302);
}

export async function DELETE(request: Request) {
  const me = await actor();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let payload: { path?: string; storage?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const path = String(payload.path || "");
  if (!path) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const config = r2Config();
  if (payload.storage === "r2" && config) await deleteFromR2(config, path);
  else await me.supabase.storage.from("chat-files").remove([path]);
  return NextResponse.json({ ok: true });
}
