"use client";

import { useMemo, useState } from "react";
import { exportSummariesWorkbook } from "@/lib/excel";
import { Badge, Button, Card, Input } from "@/components/ui";
import { DAY_STATUS_LABELS, type AttendanceDay, type DayStatus, type MonthlySummary } from "@/lib/types";
import { format } from "date-fns";

const TONE: Record<DayStatus, "neutral" | "warn" | "ok" | "danger" | "info"> = {
  present: "ok",
  absent: "danger",
  half_day: "warn",
  leave: "info",
  week_off: "neutral",
  holiday: "neutral",
  unmatched: "warn",
};

export function MonthReport({
  monthLabel,
  summaries,
  days,
}: {
  monthLabel: string;
  summaries: MonthlySummary[];
  days: AttendanceDay[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter(
      (s) =>
        s.employee_name.toLowerCase().includes(q) ||
        (s.employee_code ?? "").toLowerCase().includes(q)
    );
  }, [summaries, query]);

  const daysByPerson = useMemo(() => {
    const map = new Map<string, AttendanceDay[]>();
    for (const day of days) {
      const key = `${day.employee_code ?? ""}::${day.employee_name}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(day);
    }
    map.forEach((list) => list.sort((a, b) => a.work_date.localeCompare(b.work_date)));
    return map;
  }, [days]);

  function exportFile() {
    exportSummariesWorkbook(
      `attendance-${monthLabel.replace(/\s+/g, "-")}.xlsx`,
      filtered.map((s) => ({
        Code: s.employee_code ?? "",
        Name: s.employee_name,
        "Working days": s.working_days,
        Present: s.present_days,
        Absent: s.absent_days,
        Leave: s.leave_days,
        "Half days": s.half_days,
        Late: s.late_days,
        Hours: s.total_hours,
        Overtime: s.overtime_hours,
      }))
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search a person"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="secondary" onClick={exportFile}>
          Export Excel
        </Button>
      </div>
      <div className="grid gap-4">
        {filtered.map((summary) => {
          const key = `${summary.employee_code ?? ""}::${summary.employee_name}`;
          const personDays = daysByPerson.get(key) ?? [];
          const expanded = open === key;
          return (
            <Card key={key}>
              <button
                className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
                onClick={() => setOpen(expanded ? null : key)}
              >
                <div>
                  <p className="font-medium">{summary.employee_name}</p>
                  <p className="text-xs text-ink-soft">{summary.employee_code || "No code"}</p>
                </div>
                <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm md:grid-cols-6">
                  <Metric label="Hours" value={summary.total_hours} />
                  <Metric label="Present" value={summary.present_days} />
                  <Metric label="Absent" value={summary.absent_days} />
                  <Metric label="Leave" value={summary.leave_days} />
                  <Metric label="Late" value={summary.late_days} />
                  <Metric label="OT" value={summary.overtime_hours} />
                </dl>
              </button>
              {expanded ? (
                <div className="mt-4 overflow-x-auto border-t border-rule pt-4">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-ink-soft">
                      <tr>
                        <th className="py-1">Date</th>
                        <th>In</th>
                        <th>Out</th>
                        <th>Hours</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {personDays.map((day) => (
                        <tr key={day.id} className="border-t border-rule/60">
                          <td className="py-1.5">{format(new Date(day.work_date), "EEE d MMM")}</td>
                          <td>{day.punch_in ? format(new Date(day.punch_in), "HH:mm") : "—"}</td>
                          <td>{day.punch_out ? format(new Date(day.punch_out), "HH:mm") : "—"}</td>
                          <td>{day.hours_worked || "—"}</td>
                          <td>
                            <Badge tone={TONE[day.status]}>
                              {DAY_STATUS_LABELS[day.status]}
                              {day.is_late ? " · late" : ""}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
