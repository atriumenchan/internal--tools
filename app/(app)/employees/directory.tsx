"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { isIgnoredEmployee } from "@/lib/admin";
import type { Employee } from "@/lib/types";

export function EmployeeDirectory({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const employee_code = String(form.get("employee_code") || "").trim();
    const full_name = String(form.get("full_name") || "").trim();
    if (isIgnoredEmployee(employee_code, full_name)) {
      setError("Ryan Ray is excluded and cannot be added.");
      return;
    }
    const supabase = createClient();
    const { error: err } = await supabase.from("employees").insert({
      employee_code,
      full_name,
      email: String(form.get("email") || "").trim() || null,
      department: String(form.get("department") || "").trim() || null,
      designation: String(form.get("designation") || "").trim() || null,
      joining_date: String(form.get("joining_date") || "") || null,
    });
    if (err) {
      setError(err.message);
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  async function toggle(employee: Employee) {
    const supabase = createClient();
    await supabase.from("employees").update({ is_active: !employee.is_active }).eq("id", employee.id);
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
      <form onSubmit={add} className="space-y-3 rounded-xl border border-rule bg-cream shadow-card p-5">
        <h2 className="font-semibold tracking-tight text-xl">Add a person</h2>
        <Field label="Employee code">
          <Input name="employee_code" required placeholder="A001" />
        </Field>
        <Field label="Full name">
          <Input name="full_name" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" />
        </Field>
        <Field label="Department">
          <Input name="department" />
        </Field>
        <Field label="Designation">
          <Input name="designation" />
        </Field>
        <Field label="Joining date">
          <DatePicker name="joining_date" placeholder="Joining date" />
        </Field>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit">Save</Button>
      </form>
      <div className="overflow-hidden rounded-xl border border-rule bg-cream shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id} className="border-t border-rule/70">
                <td className="px-4 py-3 font-mono text-xs">{employee.employee_code}</td>
                <td className="px-4 py-3">
                  {employee.full_name}
                  <p className="text-xs text-ink-soft">{employee.email}</p>
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {[employee.designation, employee.department].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-3 text-xs text-ink-soft">{employee.user_id ? "Has login" : "No login yet"}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs font-medium text-blue-soft hover:text-blue" onClick={() => toggle(employee)}>
                    {employee.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
