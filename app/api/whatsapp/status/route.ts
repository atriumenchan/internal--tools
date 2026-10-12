import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { inspectWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const diag = new URL(request.url).searchParams.get("diag");
  if (diag === "1") {
    const result = await inspectWhatsApp();
    return NextResponse.json({
      ok: result.ok,
      hasToken: result.hasToken,
      tokenLength: "tokenLength" in result ? result.tokenLength : 0,
      phoneIsNumeric: "phoneIsNumeric" in result ? result.phoneIsNumeric : false,
      error: result.error || null,
      templates: "templates" in result ? result.templates : [],
    });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user.id).maybeSingle();
  if (!isAdminUser({ email: user.email ?? profile?.email, role: profile?.role })) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const result = await inspectWhatsApp();
  return NextResponse.json(result, { status: result.ok || result.hasToken ? 200 : 400 });
}
