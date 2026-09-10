"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  downloadSampleWorkbook,
  extractDailyRows,
  extractPunches,
  parseWorkbook,
  type ColumnKey,
  type ColumnMapping,
  type ParsedSheet,
} from "@/lib/excel";
import { computeAttendance } from "@/lib/attendance";
import { Button, Field, Input } from "@/components/ui";
import type { CompanySettings, Employee, Holiday } from "@/lib/types";

const FIELDS: { key: ColumnKey; label: string; hint: string }[] = [
  { key: "employee_code", label: "Employee code", hint: "Emp Code / ID" },
  { key: "employee_name", label: "Name", hint: "Required" },
  { key: "date", label: "Date", hint: "Work date" },
  { key: "time", label: "Punch time", hint: "For in/out logs" },
  { key: "punch_in", label: "In time", hint: "If the sheet already has In / Out columns" },
  { key: "punch_out", label: "Out time", hint: "If the sheet already has In / Out columns" },
  { key: "status", label: "Status / leave", hint: "Optional: CL, SL, WO, HO, AB" },
];

export function AttendanceUploader({
  settings,
  employees,
  holidays,
  userId,
}: {
  settings: CompanySettings;
  employees: Employee[];
  holidays: Holiday[];
  userId: string;
}) {
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createMissing, setCreateMissing] = useState(true);

  const preview = useMemo(() => {
    if (!sheet || !mapping.employee_name) return null;
    try {
      const punches = mapping.punch_in || mapping.punch_out ? [] : extractPunches(sheet, mapping);
      const daily = mapping.punch_in || mapping.punch_out ? extractDailyRows(sheet, mapping) : [];
      return computeAttendance({
        month,
        year,
        settings,
        employees,
        holidays,
        punches,
        daily,
      });
    } catch {
      return null;
    }
  }, [sheet, mapping, month, year, settings, employees, holidays]);

  async function onFile(file: File) {
    setError(null);
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    try {
      const parsed = parseWorkbook(buffer);
      setSheet(parsed);
      setMapping(parsed.suggested);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file");
    }
  }

  async function save() {
    if (!preview || !sheet) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();

    try {
      const employeeList = [...employees];
      if (createMissing) {
        const missing = preview.summaries.filter((s) => !s.employee_id);
        for (const person of missing) {
          const code =
            person.employee_code ||
            `E${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
          const { data, error: empErr } = await supabase
            .from("employees")
            .insert({
              employee_code: code,
              full_name: person.employee_name,
              is_active: true,
            })
            .select("*")
            .single();
          if (empErr) throw empErr;
          employeeList.push(data as Employee);
        }
      }

      const punches = mapping.punch_in || mapping.punch_out ? [] : extractPunches(sheet, mapping);
      const daily = mapping.punch_in || mapping.punch_out ? extractDailyRows(sheet, mapping) : [];
      const recomputed = computeAttendance({
        month,
        year,
        settings,
        employees: employeeList,
        holidays,
        punches,
        daily,
      });

      const { data: upload, error: upErr } = await supabase
        .from("attendance_uploads")
        .insert({
          uploaded_by: userId,
          file_name: fileName,
          period_month: month,
          period_year: year,
          row_count: recomputed.days.length,
        })
        .select("id")
        .single();
      if (upErr) throw upErr;

      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).getDate();
      const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;

      await supabase.from("attendance_days").delete().gte("work_date", start).lte("work_date", end);
      await supabase.from("monthly_summaries").delete().eq("period_month", month).eq("period_year", year);

      const dayChunks = chunk(
        recomputed.days.map((d) => ({ ...d, upload_id: upload.id })),
        400
      );
      for (const part of dayChunks) {
        const { error: dayErr } = await supabase.from("attendance_days").insert(part);
        if (dayErr) throw dayErr;
      }

      const { error: sumErr } = await supabase.from("monthly_summaries").insert(recomputed.summaries);
      if (sumErr) throw sumErr;

      router.push(`/attendance/${year}/${month}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Month">
          <Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} />
        </Field>
        <Field label="Year">
          <Input type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </Field>
        <Field label="Excel file" className="min-w-56 flex-1">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </Field>
        <Button type="button" variant="secondary" onClick={downloadSampleWorkbook}>
          Sample Excel
        </Button>
      </div>

      {sheet ? (
        <div className="rounded-2xl border border-rule bg-cream p-5">
          <h3 className="font-serif text-xl">Map columns</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Detected {sheet.rows.length} rows. Punch-log files use Date + Time; daily sheets use In and Out.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {FIELDS.map((field) => (
              <Field key={field.key} label={`${field.label} · ${field.hint}`}>
                <select
                  className="w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-sm"
                  value={mapping[field.key] ?? ""}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [field.key]: e.target.value || undefined }))
                  }
                >
                  <option value="">— skip —</option>
                  {sheet.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
            Create people who are not in the directory yet
          </label>
        </div>
      ) : null}

      {preview ? (
        <div className="rounded-2xl border border-rule bg-white p-5">
          <h3 className="font-serif text-xl">Preview · {preview.summaries.length} people</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Hours</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Leave</th>
                  <th>Late</th>
                  <th>OT</th>
                </tr>
              </thead>
              <tbody>
                {preview.summaries.map((row) => (
                  <tr key={`${row.employee_code}-${row.employee_name}`} className="border-t border-rule">
                    <td className="py-2">
                      {row.employee_name}
                      {!row.employee_id ? <span className="ml-2 text-xs text-terracotta">new</span> : null}
                    </td>
                    <td>{row.total_hours}</td>
                    <td>{row.present_days}</td>
                    <td>{row.absent_days}</td>
                    <td>{row.leave_days}</td>
                    <td>{row.late_days}</td>
                    <td>{row.overtime_hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button className="mt-5" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save this month"}
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-800">{error}</p> : null}
    </div>
  );
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
