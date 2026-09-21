"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  extractDailyRows,
  extractPunches,
  type ColumnKey,
  type ColumnMapping,
  type ParsedSheet,
} from "@/lib/excel-rows";
import { monthPerformanceToAttendance, type MonthPerformanceReport } from "@/lib/month-performance";
import { computeAttendance, type ComputedSummary } from "@/lib/attendance";
import { isIgnoredEmployee } from "@/lib/admin";
import { normalizeSettings } from "@/lib/settings";
import { formatWorkDate, hoursLabel, kolkataTodayKey } from "@/lib/datetime";
import { Button, Field, Input, Select } from "@/components/ui";
import { FileDrop } from "@/components/file-drop";
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
  const resolvedSettings = normalizeSettings(settings);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<MonthPerformanceReport | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createMissing, setCreateMissing] = useState(true);

  const preview = useMemo(() => {
    try {
      if (report) {
        return monthPerformanceToAttendance(report, employees, resolvedSettings, holidays);
      }
      if (!sheet || !mapping.employee_name) return null;
      const punches = mapping.punch_in || mapping.punch_out ? [] : extractPunches(sheet, mapping);
      const daily = mapping.punch_in || mapping.punch_out ? extractDailyRows(sheet, mapping) : [];
      return computeAttendance({
        month,
        year,
        settings: resolvedSettings,
        employees,
        holidays,
        punches,
        daily,
      });
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [report, sheet, mapping, month, year, resolvedSettings, employees, holidays]);

  async function onFile(file: File) {
    setError(null);
    setFileName(file.name);
    setReport(null);
    setSheet(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/attendance/parse", { method: "POST", body: form });
      const data = (await res.json()) as {
        kind?: "month-performance" | "sheet";
        report?: MonthPerformanceReport;
        sheet?: ParsedSheet;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not read this file");
      if (data.kind === "month-performance" && data.report) {
        setReport(data.report);
        setMonth(data.report.month);
        setYear(data.report.year);
        return;
      }
      if (data.kind === "sheet" && data.sheet) {
        setSheet(data.sheet);
        setMapping(data.sheet.suggested);
        return;
      }
      throw new Error("Could not read this file");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file");
    }
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const periodMonth = report?.month ?? month;
    const periodYear = report?.year ?? year;

    try {
      const employeeList = [...employees];
      if (createMissing) {
        const missing = preview.summaries.filter(
          (s) => !s.employee_id && !isIgnoredEmployee(s.employee_code, s.employee_name)
        );
        for (const person of missing) {
          const fromFile = report?.people.find(
            (p) =>
              p.employee_code === person.employee_code ||
              p.employee_name.toLowerCase() === person.employee_name.toLowerCase()
          );
          const code =
            person.employee_code ||
            `E${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
          const { data, error: empErr } = await supabase
            .from("employees")
            .insert({
              employee_code: code,
              full_name: person.employee_name,
              department: fromFile?.department || null,
              is_active: true,
            })
            .select("*")
            .single();
          if (empErr) throw empErr;
          employeeList.push(data as Employee);
        }
      }

      const recomputed = report
        ? monthPerformanceToAttendance(report, employeeList, resolvedSettings, holidays)
        : computeAttendance({
            month: periodMonth,
            year: periodYear,
            settings: resolvedSettings,
            employees: employeeList,
            holidays,
            punches: mapping.punch_in || mapping.punch_out ? [] : extractPunches(sheet!, mapping),
            daily: mapping.punch_in || mapping.punch_out ? extractDailyRows(sheet!, mapping) : [],
          });

      const { data: upload, error: upErr } = await supabase
        .from("attendance_uploads")
        .insert({
          uploaded_by: userId,
          file_name: fileName,
          period_month: periodMonth,
          period_year: periodYear,
          row_count: recomputed.days.length,
        })
        .select("id")
        .single();
      if (upErr) throw upErr;

      const start = `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
      const endDate = new Date(periodYear, periodMonth, 0).getDate();
      const end = `${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;

      await supabase.from("attendance_days").delete().gte("work_date", start).lte("work_date", end);
      await supabase.from("monthly_summaries").delete().eq("period_month", periodMonth).eq("period_year", periodYear);

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

      router.push(`/attendance/${periodYear}/${periodMonth}`);
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
          <FileDrop
            accept=".xlsx,.xls,.csv"
            hint="Month-performance .xls, .xlsx, or .csv"
            label="Drop the Excel file or click to choose"
            onFile={(file) => void onFile(file)}
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            const { downloadSampleWorkbook } = await import("@/lib/excel");
            downloadSampleWorkbook();
          }}
        >
          Sample punch log
        </Button>
      </div>

      {report ? (
        <p className="rounded-xl border border-sage/20 bg-sage-soft px-4 py-3 text-sm text-sage">
          Detected biometric <strong>month performance</strong> report
          {report.company ? ` for ${report.company}` : ""}. {report.people.length} people · IN / OUT / WORK /
          Status blocks. Counted through {formatWorkDate(kolkataTodayKey())}. Saturday, Sunday, and handbook
          holidays are offs — not absences.
        </p>
      ) : null}

      {sheet && !report ? (
        <div className="rounded-md border border-border bg-surface p-5 shadow-card">
          <h3 className="font-display text-xl font-medium tracking-tight">Map columns</h3>
          <p className="mt-1 text-sm text-muted">
            This file is not the month-performance layout. Map Emp Code, Name, Date, and Time (or In / Out).
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {FIELDS.map((field) => (
              <Field key={field.key} label={`${field.label} · ${field.hint}`}>
                <Select
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
                </Select>
              </Field>
            ))}
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="rounded-md border border-border bg-surface p-5 shadow-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold tracking-tight text-xl">
              Preview · {preview.summaries.length} people · through {formatWorkDate(kolkataTodayKey())}
            </h3>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
              Create people who are not in the directory yet
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] font-semibold text-faint">
                <tr>
                  <th className="py-2">Code</th>
                  <th>Name</th>
                  <th>Hours</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Leave</th>
                  <th>WO</th>
                  <th>Holiday</th>
                  <th>Late</th>
                  <th>OT</th>
                </tr>
              </thead>
              <tbody>
                {preview.summaries.map((row: ComputedSummary) => (
                  <tr key={`${row.employee_code}-${row.employee_name}`} className="border-t border-border hover:bg-surface-2">
                    <td className="py-2 font-mono text-xs">{row.employee_code}</td>
                    <td>
                      {row.employee_name}
                      {!row.employee_id ? <span className="ml-2 text-xs text-amber">new</span> : null}
                    </td>
                    <td>{hoursLabel(row.total_hours)}</td>
                    <td>{row.present_days}</td>
                    <td>{row.absent_days}</td>
                    <td>{row.leave_days}</td>
                    <td>{row.week_offs}</td>
                    <td>{row.holidays}</td>
                    <td>{row.late_days}</td>
                    <td>{hoursLabel(row.overtime_hours)}</td>
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

      {error ? <p className="text-sm text-coral">{error}</p> : null}
    </div>
  );
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
