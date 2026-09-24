import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser, isIgnoredEmployee, normalizeEmpCode } from "@/lib/admin";
import { rehomeStaffWork } from "@/lib/delete-staff";
import { parseAppRole } from "@/lib/roles";
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
          role: (profile?.role as AppRole) || "employee",
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
  const employeeCode = String(body.employee_code || "").trim();
  const fullName = String(body.full_name || body.name || "").trim();
  const role = parseAppRole(body.role);
  if (role === "admin") {
    return NextResponse.json({ error: "Create a normal login. Ryan Ritabrata's account stays as-is." }, { status: 400 });
  }

  if (!email || password.length < 6 || !employeeCode || !fullName) {
    return NextResponse.json(
      { error: "Name, employee code, email ID, and a 6+ character password are required" },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data: people, error: empErr } = await admin.from("employees").select("*");
    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 400 });
    const wanted = normalizeEmpCode(employeeCode);
    let employee = (people ?? []).find(
      (row) => normalizeEmpCode(row.employee_code) === wanted || String(row.employee_code).trim() === employeeCode
    );

    if (employee?.ignored || isIgnoredEmployee(employee?.employee_code, employee?.full_name || fullName)) {
      return NextResponse.json({ error: "This person is excluded and cannot have a login" }, { status: 400 });
    }
    if (employee?.user_id) {
      return NextResponse.json({ error: "This employee code already has a login" }, { status: 400 });
    }

    if (!employee) {
      const created = await admin
        .from("employees")
        .insert({
          employee_code: employeeCode,
          full_name: fullName,
          email,
          is_active: true,
        })
        .select("*")
        .single();
      if (created.error || !created.data) {
        return NextResponse.json({ error: created.error?.message || "Could not save this employee code" }, { status: 400 });
      }
      employee = created.data;
    } else if (fullName && fullName !== employee.full_name) {
      await admin.from("employees").update({ full_name: fullName, email }).eq("id", employee.id);
      employee = { ...employee, full_name: fullName, email };
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

export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const password = String(body.password || "");
  const role = body.role != null ? parseAppRole(body.role) : null;
  if (!id) {
    return NextResponse.json({ error: "User is required" }, { status: 400 });
  }
  if (!password && !role) {
    return NextResponse.json({ error: "Password or role is required" }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ error: "Use a 6+ character password" }, { status: 400 });
  }
  if (id === gate.user.id && password) {
    return NextResponse.json({ error: "Reset other people’s passwords here — not your own." }, { status: 400 });
  }
  if (role === "admin") {
    return NextResponse.json({ error: "Do not give another login Ryan Ritabrata's access here." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: target } = await admin.from("profiles").select("id, email, role").eq("id", id).maybeSingle();
    if (target && isAdminUser({ email: target.email, role: target.role })) {
      return NextResponse.json({ error: "Ryan Ritabrata's login cannot be changed from here." }, { status: 400 });
    }
    if (password) {
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (role) {
      const { error } = await admin.from("profiles").update({ role }).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reset password" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  if (id === gate.user.id) {
    return NextResponse.json({ error: "You cannot delete your own login." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: target } = await admin.from("profiles").select("id, email, role").eq("id", id).maybeSingle();
    if (target && isAdminUser({ email: target.email, role: target.role })) {
      return NextResponse.json({ error: "Ryan Ritabrata's login cannot be deleted." }, { status: 400 });
    }
    await admin.rpc("prepare_staff_delete", {
      p_user_id: id,
      p_successor_id: gate.user.id,
    });
    await rehomeStaffWork(admin, id, gate.user.id);

    await admin.from("profiles").delete().eq("id", id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      await rehomeStaffWork(admin, id, gate.user.id);
      await admin.from("profiles").delete().eq("id", id);
      const retry = await admin.auth.admin.deleteUser(id);
      if (retry.error) {
        return NextResponse.json(
          { error: retry.error.message.replace(/Database error deleting user/i, "Could not remove this login. Their boards or tasks are still attached.") },
          { status: 400 }
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete login" },
      { status: 500 }
    );
  }
}
