"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DatePicker } from "@/components/date-picker";
import { isIgnoredEmployee, normalizeEmpCode } from "@/lib/admin";
import { useWorkspaceCache } from "@/components/app-frame";
import type { Employee } from "@/lib/types";

export function EmployeeDirectory({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const cache = useWorkspaceCache();
  const [rows, setRows] = useState(employees);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setRows(employees);
  }, [employees]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const employee_code = String(form.get("employee_code") || "").trim();
    const full_name = String(form.get("full_name") || "").trim();
    if (isIgnoredEmployee(employee_code, full_name)) {
      setError("Ryan Ray is excluded and cannot be added.");
      return;
    }
    const taken = rows.find((row) => normalizeEmpCode(row.employee_code) === normalizeEmpCode(employee_code));
    if (taken) {
      setError(`Employee code ${taken.employee_code} is already used by ${taken.full_name}. Pick another code.`);
      return;
    }

    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("employees")
      .insert({
        employee_code,
        full_name,
        email: String(form.get("email") || "").trim() || null,
        department: String(form.get("department") || "").trim() || null,
        designation: String(form.get("designation") || "").trim() || null,
        joining_date: String(form.get("joining_date") || "") || null,
      })
      .select("*")
      .single();
    if (err) {
      setError(
        err.code === "23505" || /duplicate key/i.test(err.message)
          ? `Employee code ${employee_code} is already on People. If you do not see them, they may be inactive — pick another code.`
          : err.message
      );
      return;
    }
    formEl.reset();
    if (data) {
      setRows((prev) =>
        [...prev, data as Employee].sort((a, b) => a.employee_code.localeCompare(b.employee_code, undefined, { numeric: true }))
      );
    }
    setMsg(`Created ${full_name} (${employee_code}). They are on People. Open Staff to create their login if they need access.`);
    await cache?.refreshStaff();
    router.refresh();
  }

  async function toggle(employee: Employee) {
    const supabase = createClient();
    await supabase.from("employees").update({ is_active: !employee.is_active }).eq("id", employee.id);
    setRows((prev) => prev.map((row) => (row.id === employee.id ? { ...row, is_active: !employee.is_active } : row)));
  }

  async function remove(employee: Employee) {
    const supabase = createClient();
    const { error: err } = await supabase.from("employees").delete().eq("id", employee.id);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((prev) => prev.filter((row) => row.id !== employee.id));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
      <form onSubmit={add} className="space-y-3 rounded-md border border-border bg-surface p-5 shadow-card">
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
        {msg ? <p className="text-sm text-teal">{msg}</p> : null}
        {error ? <p className="text-sm text-coral">{error}</p> : null}
        <Button type="submit">Save</Button>
      </form>
      <div className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-[11px] font-semibold text-faint">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((employee) => (
              <tr key={employee.id} className="border-t border-border hover:bg-surface-2">
                <td className="px-4 py-3 font-mono text-xs">{employee.employee_code}</td>
                <td className="px-4 py-3">
                  {employee.full_name}
                  <p className="text-xs text-muted">{employee.email}</p>
                </td>
                <td className="px-4 py-3 text-muted">
                  {[employee.designation, employee.department].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-3 text-xs text-muted">{employee.user_id ? "Has login" : "No login yet"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="text-xs font-medium text-teal hover:text-teal-soft" onClick={() => toggle(employee)}>
                      {employee.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                    <ConfirmDelete
                      label="Delete person"
                      title="Delete this person?"
                      description="They will be removed from People. Attendance history is kept."
                      onConfirm={() => remove(employee)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
