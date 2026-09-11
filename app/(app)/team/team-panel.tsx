"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { AppRole } from "@/lib/types";

type StaffUser = {
  id: string;
  email: string | null;
  full_name: string;
  role: AppRole;
  created_at: string;
  last_sign_in_at: string | null;
};

export function TeamPanel() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("hr");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load users");
      setUsers(json.users);
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
        body: JSON.stringify({ email, password, full_name: fullName, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      setMsg(`Account created for ${json.email}. Share the password with them — they can sign in immediately.`);
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("hr");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
      <form onSubmit={createUser} className="space-y-3 rounded-2xl border border-rule bg-cream p-5">
        <h2 className="font-serif text-xl">Create a staff account</h2>
        <p className="text-sm text-ink-soft">Same as the invoice admin portal. No confirmation email — they sign in with this password.</p>
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Work email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Temporary password">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        </Field>
        <Field label="Role">
          <select
            className="w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
          >
            <option value="hr">HR</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        {msg ? <p className="text-sm text-sage">{msg}</p> : null}
        {err ? <p className="text-sm text-red-800">{err}</p> : null}
        <Button type="submit" disabled={busy || password.length < 6}>
          {busy ? "Creating…" : "Create account"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-rule bg-cream">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-ink-soft">Loading staff…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-rule/70">
                  <td className="px-4 py-3">
                    <p className="font-medium">{user.full_name || user.email}</p>
                    <p className="text-xs text-ink-soft">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize">{user.role}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "Never"}
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
