import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isManagerUser } from "@/lib/roles";
import { asciiFileName, deleteFromR2, presignR2, r2Config, storageKey } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_MAX = 8 * 1024 * 1024;
const R2_MAX = 50 * 1024 * 1024;

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user.id).maybeSingle();
  return {
    supabase,
    id: user.id,
    email: user.email ?? profile?.email ?? null,
    role: profile?.role ?? null,
  };
}

function mbLabel(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Where to put a new task file, and a one-time upload URL when R2 holds it. */
export async function POST(request: Request) {
  const me = await actor();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let payload: { taskId?: string; fileName?: string; fileSize?: number };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const taskId = String(payload.taskId || "");
  const fileName = String(payload.fileName || "").trim();
  const fileSize = Number(payload.fileSize || 0);
  if (!taskId || !fileName) return NextResponse.json({ error: "Missing task or file name" }, { status: 400 });

  const { data: task, error } = await me.supabase
    .from("tasks")
    .select("id, created_by, assignee_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const allowed =
    task.created_by === me.id || task.assignee_id === me.id || isManagerUser({ email: me.email, role: me.role });
  if (!allowed) {
    return NextResponse.json(
      { error: "Only the requester, the assignee, or a manager can add files." },
      { status: 403 }
    );
  }

  const config = r2Config();
  const limit = config ? R2_MAX : SUPABASE_MAX;
  if (fileSize > limit) {
    return NextResponse.json({ error: `Each file must be ${mbLabel(limit)} or smaller.` }, { status: 400 });
  }

  const path = storageKey(taskId, fileName);
  if (!config) return NextResponse.json({ storage: "supabase", path });
  return NextResponse.json({ storage: "r2", path, url: presignR2(config, "PUT", path, 600) });
}

/** Opens a file. Redirects to a short-lived R2 link. */
export async function GET(request: Request) {
  const me = await actor();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const { data: file } = await me.supabase
    .from("task_files")
    .select("id, path, file_name, storage")
    .eq("id", id)
    .maybeSingle();
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const config = r2Config();
  if (!config) return NextResponse.json({ error: "Cloud storage is not set up on this deployment." }, { status: 500 });

  const url = presignR2(config, "GET", file.path, 120, {
    "response-content-disposition": `inline; filename="${asciiFileName(file.file_name)}"`,
  });
  return NextResponse.redirect(url, 302);
}

/** Removes the row, then the object behind it. */
export async function DELETE(request: Request) {
  const me = await actor();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let payload: { id?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const id = String(payload.id || "");
  if (!id) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const { data: file } = await me.supabase.from("task_files").select("id, path").eq("id", id).maybeSingle();
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const { error } = await me.supabase.from("task_files").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      {
        error:
          error.message.includes("row-level security") || error.message.includes("policy")
            ? "Could not delete this file. Paste supabase/task-files-r2.sql in the Supabase SQL editor, then try again."
            : error.message,
      },
      { status: 400 }
    );
  }

  const config = r2Config();
  if (config) await deleteFromR2(config, file.path);
  return NextResponse.json({ ok: true });
}
