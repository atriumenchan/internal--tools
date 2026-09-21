"use client";

import { useMemo, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { useWorkspaceCache } from "@/components/app-frame";
import { isAdminUser } from "@/lib/admin";
import { parseAppRole, WORKSPACE_ROLE_LABELS, workspaceRole } from "@/lib/roles";
import type { Employee, StaffUser } from "@/lib/types";

export function TeamPanel() {
  const cache = useWorkspaceCache();
  const users = cache?.staffUsers ?? [];
  const employees = cache?.employees ?? [];
  const loading = Boolean(cache && !cache.ready && users.length === 0);
  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "manager">("employee");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(cache?.staffError ?? null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const openCodes = useMemo(
    () => employees.filter((e) => !e.user_id).sort((a, b) => a.employee_code.localeCompare(b.employee_code, undefined, { numeric: true })),
    [employees]
  );

  function pickPerson(person: Employee | undefined) {
    if (!person) {
      setEmployeeCode("");
      setName("");
      setEmail("");
      return;
    }
    setEmployeeCode(person.employee_code);
    setName(person.full_name);
    setEmail(person.email || "");
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          employee_code: employeeCode,
          email,
          password,
          role,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      setMsg(`Login created for ${json.employee_code} (${json.email}).`);
      setName("");
      setEmployeeCode("");
      setEmail("");
      setPassword("");
      setRole("employee");
      await cache?.refreshStaff();
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
      setMsg("Password updated.");
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
      if (!res.ok) throw new Error(json.error || "Could not change access level");
      await cache?.refreshStaff();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not change access level");
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
      setMsg("Login deleted.");
      await cache?.refreshStaff();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <form onSubmit={createUser} className="space-y-3 rounded-md border border-border bg-surface p-5 shadow-card">
        <h2 className="font-display text-xl font-medium tracking-tight">New login</h2>
        <Field label="Employee code">
          <Select
            value={employeeCode}
            required
            onChange={(e) => {
              const code = e.target.value;
              pickPerson(openCodes.find((p) => p.employee_code === code));
            }}
          >
            <option value="">
              {openCodes.length === 0 ? "No codes left. Add a person on People first." : "Select a code"}
            </option>
            {openCodes.map((person) => (
              <option key={person.id} value={person.employee_code}>
                {person.employee_code} · {person.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Access level">
          <Select value={role} onChange={(e) => setRole(e.target.value === "manager" ? "manager" : "employee")}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
          </Select>
        </Field>
        <Field label="Email ID">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        </Field>
        {msg ? <p className="text-sm text-sage">{msg}</p> : null}
        {err || cache?.staffError ? <p className="text-sm text-coral">{err || cache?.staffError}</p> : null}
        <Button type="submit" disabled={busy || password.length < 6 || !employeeCode.trim() || !name.trim() || openCodes.length === 0}>
          {busy ? "Creating…" : "Create login"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-faint">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[11px] font-semibold text-faint">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email ID</th>
                <th className="px-4 py-3">Access level</th>
                <th className="px-4 py-3">Password</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-border hover:bg-surface-2">
                  <td className="px-4 py-3 font-mono text-xs">{user.employee_code || "—"}</td>
                  <td className="px-4 py-3 font-medium">{user.full_name || "—"}</td>
                  <td className="px-4 py-3 text-muted">{user.email}</td>
                  <td className="px-4 py-3">
                    {isAdminUser({ email: user.email, role: user.role }) ? (
                      <span className="text-xs text-muted">Admin</span>
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
                      <p className="text-xs text-muted">Kept</p>
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
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setResetId(null);
                              setResetPassword("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setResetId(user.id)}>
                          Reset
                        </Button>
                        <ConfirmDelete
                          label="Delete login"
                          title="Delete this login?"
                          description="You can create a new one with the same employee code after this."
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
