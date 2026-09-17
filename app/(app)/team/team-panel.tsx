"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { formatDate } from "@/lib/utils";
import { isAdminUser } from "@/lib/admin";
import { parseAppRole, WORKSPACE_ROLE_LABELS, workspaceRole } from "@/lib/roles";
import type { AppRole, Employee } from "@/lib/types";

type StaffUser = {
  id: string;
  email: string | null;
  full_name: string;
  role: AppRole;
  employee_code: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

export function TeamPanel() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "manager">("employee");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const available = useMemo(
    () => employees.filter((e) => !e.user_id && !e.ignored),
    [employees]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load users");
      setUsers(json.users);
      setEmployees(json.employees ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, email, password, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      setMsg(`Login created for ${json.employee_code} (${json.email}). Share this password with them.`);
      setEmail("");
      setPassword("");
      setEmployeeId("");
      setRole("employee");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetLogin() {
    if (!resetId || resetPassword.length < 6) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetId, password: resetPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Reset failed");
      setMsg("Password updated. Share the new password with them.");
      setResetId(null);
      setResetPassword("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  async function setUserRole(user: StaffUser, next: string) {
    const parsed = parseAppRole(next);
    if (parsed === "admin") return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, role: parsed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not change role");
      setUsers((prev) => prev.map((row) => (row.id === user.id ? { ...row, role: parsed } : row)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not change role");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLogin(user: StaffUser) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      setMsg("Login deleted. Pick them on the left to create a new one.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      <form onSubmit={createUser} className="space-y-3 rounded-xl border border-rule bg-cream shadow-card p-5">
        <h2 className="font-semibold tracking-tight text-xl">Give someone a login</h2>
        <p className="text-sm text-ink-soft">
          People come from Supabase. Pick one, set email and password. Ryan Ray cannot be given a login.
        </p>
        <Field label="Person">
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
            <option value="">Select</option>
            {available.map((person) => (
              <option key={person.id} value={person.id}>
                {person.employee_code} · {person.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Login email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value === "manager" ? "manager" : "employee")}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
          </Select>
        </Field>
        <Field label="Password">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        </Field>
        {msg ? <p className="text-sm text-sage">{msg}</p> : null}
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <Button type="submit" disabled={busy || password.length < 6 || !employeeId}>
          {busy ? "Creating…" : "Create login"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border border-rule bg-cream shadow-card">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-ink-soft">Loading from Supabase…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Last sign-in</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-rule/70">
                  <td className="px-4 py-3 font-mono text-xs">{user.employee_code || "—"}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{user.full_name || user.email}</p>
                    <p className="text-xs text-ink-soft">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {isAdminUser({ email: user.email, role: user.role }) ? (
                      <span className="text-xs text-ink-soft">Admin</span>
                    ) : (
                      <Select
                        value={workspaceRole(user) === "manager" ? "manager" : "employee"}
                        onChange={(e) => void setUserRole(user, e.target.value)}
                      >
                        <option value="employee">{WORKSPACE_ROLE_LABELS.employee}</option>
                        <option value="manager">{WORKSPACE_ROLE_LABELS.manager}</option>
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdminUser({ email: user.email, role: user.role }) ? (
                      <p className="text-xs text-ink-soft">Admin — kept</p>
                    ) : resetId === user.id ? (
                      <div className="flex min-w-[12rem] flex-col gap-2">
                        <Input
                          type="password"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="New password"
                          minLength={6}
                        />
                        <div className="flex gap-2">
                          <Button type="button" size="sm" disabled={busy || resetPassword.length < 6} onClick={() => void resetLogin()}>
                            Save
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => { setResetId(null); setResetPassword(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setResetId(user.id)}>
                          Reset password
                        </Button>
                        <ConfirmDelete
                          label="Delete login"
                          title="Delete this login?"
                          description="You can create a new one for them after this."
                          onConfirm={() => deleteLogin(user)}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
