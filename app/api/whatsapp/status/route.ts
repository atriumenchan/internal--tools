import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { inspectWhatsApp, normalizeWhatsAppPhone, sendWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminOnly() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user.id).maybeSingle();
  if (!isAdminUser({ email: user.email ?? profile?.email, role: profile?.role })) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return null;
}

/** Sends one test to a single number and returns Meta's own answer. */
export async function POST(request: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { phone?: string } | null;
  const phone = normalizeWhatsAppPhone(body?.phone);
  if (!phone) return NextResponse.json({ ok: false, error: "Enter a 10-digit mobile number." }, { status: 400 });
  const sent = await sendWhatsApp(phone, "ADMEXO Workspace test\nIf you can read this, WhatsApp pings reach this number.");
  return NextResponse.json({
    ok: sent.ok,
    to: `…${phone.slice(-4)}`,
    via: "via" in sent ? sent.via : null,
    status: "status" in sent ? sent.status : null,
    messageId: "messageId" in sent ? sent.messageId : null,
    error: "error" in sent ? sent.error || null : null,
  });
}

export async function GET() {
  const denied = await adminOnly();
  if (denied) return denied;
  const result = await inspectWhatsApp();
  return NextResponse.json(result, { status: result.ok || result.hasToken ? 200 : 400 });
}
