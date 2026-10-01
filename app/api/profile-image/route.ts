import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { R2_PREFIX, avatarKey } from "@/lib/avatar";
import { deleteFromR2, presignR2, r2Config } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "avatars";
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

function patchHint(message: string) {
  return /avatar_url/i.test(message)
    ? "Profile photos need a SQL patch. Paste supabase/profile-photo.sql in the Supabase SQL editor, then try again."
    : message;
}

/** Saves a new profile photo. R2 holds it when configured, Supabase Storage otherwise. */
export async function POST(request: Request) {
  const me = await signedIn();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a photo first." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Use a photo of 3 MB or smaller." }, { status: 400 });
  }
  const ext = TYPES[(file.type || "").toLowerCase()];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG, WebP, or GIF image." }, { status: 400 });

  const key = `avatars/${me.user.id}-${Date.now()}.${ext}`;
  const body = new Uint8Array(await file.arrayBuffer());
  const config = r2Config();
  let avatarUrl: string;

  if (config) {
    const put = await fetch(presignR2(config, "PUT", key, 300), {
      method: "PUT",
      body,
      headers: { "content-type": file.type },
    });
    if (!put.ok) {
      return NextResponse.json({ error: "Could not reach cloud storage. Check the R2 keys on Vercel." }, { status: 502 });
    }
    avatarUrl = `${R2_PREFIX}${key}`;
  } else {
    const admin = createAdminClient();
    const { error } = await admin.storage.from(BUCKET).upload(key, body, { contentType: file.type, upsert: true });
    if (error) {
      return NextResponse.json(
        {
          error: /bucket/i.test(error.message)
            ? "Photo storage is not set up yet. Paste supabase/profile-photo.sql in the Supabase SQL editor."
            : error.message,
        },
        { status: 400 }
      );
    }
    avatarUrl = admin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  }

  const { data: previous } = await me.supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", me.user.id)
    .maybeSingle();

  const { error } = await me.supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", me.user.id);
  if (error) return NextResponse.json({ error: patchHint(error.message) }, { status: 400 });

  const oldKey = avatarKey((previous as { avatar_url?: string | null } | null)?.avatar_url);
  if (config && oldKey) await deleteFromR2(config, oldKey);

  return NextResponse.json({ ok: true, avatar_url: avatarUrl });
}

/** Serves a photo kept in R2, behind a short-lived signed link. */
export async function GET(request: Request) {
  const me = await signedIn();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing person" }, { status: 400 });

  const { data } = await me.supabase.from("profiles").select("avatar_url").eq("id", id).maybeSingle();
  const key = avatarKey((data as { avatar_url?: string | null } | null)?.avatar_url);
  if (!key) return NextResponse.json({ error: "No photo" }, { status: 404 });

  const config = r2Config();
  if (!config) return NextResponse.json({ error: "Cloud storage is not set up here." }, { status: 500 });

  return NextResponse.redirect(presignR2(config, "GET", key, 600), {
    status: 302,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}

/** Drops your photo and falls back to initials. */
export async function DELETE() {
  const me = await signedIn();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data } = await me.supabase.from("profiles").select("avatar_url").eq("id", me.user.id).maybeSingle();
  const { error } = await me.supabase.from("profiles").update({ avatar_url: null }).eq("id", me.user.id);
  if (error) return NextResponse.json({ error: patchHint(error.message) }, { status: 400 });

  const key = avatarKey((data as { avatar_url?: string | null } | null)?.avatar_url);
  const config = r2Config();
  if (config && key) await deleteFromR2(config, key);

  return NextResponse.json({ ok: true });
}
