import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin";
import { HANDBOOK_PDF } from "@/lib/handbook";
import { ensureAdminFromEnv } from "@/lib/ensure-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "handbook";
const OBJECT = "current.pdf";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: Request) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(BUCKET).download(OBJECT);
    if (!error && data) {
      const buffer = Buffer.from(await data.arrayBuffer());
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename="ADMEXO-handbook.pdf"`,
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    }
  } catch {
    // fall through to the bundled PDF
  }

  return NextResponse.redirect(new URL(HANDBOOK_PDF, request.url), 302);
}

export async function POST(request: Request) {
  await ensureAdminFromEnv();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user.id).maybeSingle();
  if (!isAdminUser({ email: user.email ?? profile?.email, role: profile?.role })) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const version = String(form.get("version") || "").trim();
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a PDF of the new handbook." }, { status: 400 });
  }
  if (!version) {
    return NextResponse.json({ error: "Give this handbook a version, for example 2.1." }, { status: 400 });
  }
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (!type.includes("pdf") && !name.endsWith(".pdf")) {
    return NextResponse.json({ error: "Upload a PDF file." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 20 * 1024 * 1024 });
  } catch {
    // bucket may already exist
  }

  try {
    const admin = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from(BUCKET).upload(OBJECT, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) {
      return NextResponse.json(
        {
          error: upErr.message.includes("Bucket")
            ? "Handbook storage is not set up yet. Paste supabase/handbook-publish.sql in the Supabase SQL editor, then try again."
            : upErr.message,
        },
        { status: 400 }
      );
    }

    const { error: setErr } = await admin
      .from("company_settings")
      .update({ handbook_version: version })
      .eq("id", 1);
    if (setErr) return NextResponse.json({ error: setErr.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      version,
      note: "Staff must sign this version on next login. Tasks, chat, attendance, and logins are unchanged.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not publish the handbook" },
      { status: 500 }
    );
  }
}
