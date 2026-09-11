import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/types";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: profiles } = await admin.from("profiles").select("id, full_name, role, email");
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return NextResponse.json({
      users: data.users.map((u) => {
        const profile = profileMap.get(u.id);
        return {
          id: u.id,
          email: u.email,
          full_name: profile?.full_name || u.user_metadata?.full_name || "",
          role: (profile?.role as AppRole) || "hr",
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        };
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not list users" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");
  const fullName = String(body.full_name || "").trim();
  const role: AppRole = body.role === "admin" ? "admin" : "hr";

  if (!email || password.length < 6) {
    return NextResponse.json({ error: "Email and a 6+ character password are required" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email.split("@")[0], role },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (data.user) {
      await admin
        .from("profiles")
        .update({
          full_name: fullName || data.user.email?.split("@")[0] || "",
          role,
        })
        .eq("id", data.user.id);
    }

    return NextResponse.json({ id: data.user?.id, email: data.user?.email, role });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create user" },
      { status: 500 }
    );
  }
}
