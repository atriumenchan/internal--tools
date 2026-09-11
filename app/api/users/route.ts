import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser, isIgnoredEmployee } from "@/lib/admin";
import { ensureAdminFromEnv } from "@/lib/ensure-admin";
import type { AppRole } from "@/lib/types";

async function requireAdmin() {
  await ensureAdminFromEnv();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user.id).maybeSingle();
  if (!isAdminUser({ email: user.email ?? profile?.email, role: profile?.role })) {
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

    const { data: employees } = await admin
      .from("employees")
      .select("*")
      .order("employee_code");

    return NextResponse.json({
      users: data.users.map((u) => {
        const profile = profileMap.get(u.id);
        const employee = (employees ?? []).find((e) => e.user_id === u.id);
        return {
          id: u.id,
          email: u.email,
          full_name: profile?.full_name || u.user_metadata?.full_name || "",
          role: (profile?.role as AppRole) || "hr",
          employee_code: employee?.employee_code ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        };
      }),
      employees: (employees ?? []).filter((e) => !e.ignored && e.is_active !== false),
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
  const employeeId = String(body.employee_id || "").trim();
  const role: AppRole = "hr";

  if (!email || password.length < 6 || !employeeId) {
    return NextResponse.json(
      { error: "Pick a person, then email and a 6+ character password" },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data: employee, error: empErr } = await admin
      .from("employees")
      .select("*")
      .eq("id", employeeId)
      .maybeSingle();
    if (empErr || !employee) {
      return NextResponse.json({ error: "Employee not found in Supabase" }, { status: 404 });
    }
    if (employee.ignored || isIgnoredEmployee(employee.employee_code, employee.full_name)) {
      return NextResponse.json({ error: "This person is excluded and cannot have a login" }, { status: 400 });
    }
    if (employee.user_id) {
      return NextResponse.json({ error: "This person already has a login" }, { status: 400 });
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: employee.full_name,
        role,
        employee_code: employee.employee_code,
      },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (data.user) {
      await admin
        .from("profiles")
        .update({
          full_name: employee.full_name,
          role,
          email,
        })
        .eq("id", data.user.id);
      await admin.from("employees").update({ user_id: data.user.id, email }).eq("id", employee.id);
    }

    return NextResponse.json({
      id: data.user?.id,
      email: data.user?.email,
      employee_code: employee.employee_code,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create user" },
      { status: 500 }
    );
  }
}
