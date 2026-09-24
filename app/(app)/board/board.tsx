"use client";

import { useMemo, useState } from "react";
import { Badge, Card, Input, Segmented, Select } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { DAY_STATUS_LABELS, type AttendanceDay, type DayStatus, type Employee, type MonthlySummary } from "@/lib/types";
import { isIgnoredEmployee } from "@/lib/admin";
import { formatClock, formatWorkDate, hoursLabel } from "@/lib/datetime";

const TONE: Record<DayStatus, "neutral" | "warn" | "ok" | "danger" | "info"> = {
  present: "ok",
  absent: "danger",
  half_day: "warn",
  leave: "info",
  week_off: "neutral",
  holiday: "neutral",
  unmatched: "warn",
};

export function AttendanceBoard({
  employees,
  summaries,
  days,
  lastUploadLabel,
}: {
  employees: Employee[];
  summaries: MonthlySummary[];
  days: AttendanceDay[];
  lastUploadLabel: string | null;
}) {
  const visiblePeople = useMemo(
    () =>
      employees.filter((e) => !e.ignored && !isIgnoredEmployee(e.employee_code, e.full_name) && e.is_active),
    [employees]
  );
  const departments = useMemo(
    () => [...new Set(visiblePeople.map((e) => e.department).filter(Boolean))] as string[],
    [visiblePeople]
  );

  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [person, setPerson] = useState("all");
  const [status, setStatus] = useState<"all" | DayStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<"people" | "days">("people");

  const filteredDays = useMemo(() => {
    return days.filter((day) => {
      if (isIgnoredEmployee(day.employee_code, day.employee_name)) return false;
      if (from && day.work_date < from) return false;
      if (to && day.work_date > to) return false;
      if (status !== "all" && day.status !== status) return false;
      if (person !== "all" && (day.employee_code ?? "") !== person && day.employee_name !== person) return false;
      const emp = visiblePeople.find(
        (e) => e.employee_code === day.employee_code || e.full_name === day.employee_name
      );
      if (department !== "all" && emp?.department !== department) return false;
      const q = query.trim().toLowerCase();
      if (
        q &&
        !(day.employee_name || "").toLowerCase().includes(q) &&
        !(day.employee_code ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [days, from, to, status, person, department, query, visiblePeople]);

  const filteredSummaries = useMemo(() => {
    return summaries.filter((row) => {
      if (isIgnoredEmployee(row.employee_code, row.employee_name)) return false;
      if (person !== "all" && row.employee_code !== person && row.employee_name !== person) return false;
      const emp = visiblePeople.find(
        (e) => e.employee_code === row.employee_code || e.full_name === row.employee_name
      );
      if (department !== "all" && emp?.department !== department) return false;
      const q = query.trim().toLowerCase();
      if (
        q &&
        !(row.employee_name || "").toLowerCase().includes(q) &&
        !(row.employee_code ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [summaries, person, department, query, visiblePeople]);

  const totals = useMemo(() => {
    const present = filteredDays.filter((d) => d.status === "present").length;
    const absent = filteredDays.filter((d) => d.status === "absent").length;
    const leave = filteredDays.filter((d) => d.status === "leave").length;
    const late = filteredDays.filter((d) => d.is_late).length;
    const hours = filteredDays.reduce((sum, d) => sum + Number(d.hours_worked || 0), 0);
    return { present, absent, leave, late, hours };
  }, [filteredDays]);

  const daysByDate = useMemo(() => {
    const map = new Map<string, AttendanceDay[]>();
    for (const day of filteredDays) {
      if (!map.has(day.work_date)) map.set(day.work_date, []);
      map.get(day.work_date)!.push(day);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredDays]);

  const daysByPerson = useMemo(() => {
    const map = new Map<string, AttendanceDay[]>();
    for (const day of filteredDays) {
      const key = `${day.employee_code ?? ""}::${day.employee_name}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(day);
    }
    map.forEach((list) => list.sort((a, b) => a.work_date.localeCompare(b.work_date)));
    return map;
  }, [filteredDays]);

  return (
    <div className="space-y-6">
      {lastUploadLabel ? (
        <p className="text-sm text-ink-soft">Latest Excel in Supabase: {lastUploadLabel}. Upload a new week anytime — this board reads live from the database.</p>
      ) : (
        <p className="text-sm text-ink-soft">No attendance file in Supabase yet. Ryan Ritabrata can upload the weekly month-performance Excel.</p>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        <Stat label="Present days" value={totals.present} />
        <Stat label="Absent days" value={totals.absent} />
        <Stat label="Leave days" value={totals.leave} />
        <Stat label="Late marks" value={totals.late} />
        <Stat label="Hours" value={hoursLabel(totals.hours)} />
      </div>

      <div className="flex flex-wrap gap-3 rounded-md border border-border bg-surface p-4 shadow-card">
        <Input className="max-w-xs" placeholder="Search name or code" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select className="max-w-xs" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="all">All people</option>
          {visiblePeople.map((e) => (
            <option key={e.id} value={e.employee_code}>
              {e.employee_code} · {e.full_name}
            </option>
          ))}
        </Select>
        <Select className="max-w-xs" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Select
          className="max-w-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | DayStatus)}
        >
          <option value="all">All statuses</option>
          {Object.entries(DAY_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        <DatePicker className="w-[13.5rem]" value={from || null} onChange={(v) => setFrom(v || "")} placeholder="From date" />
        <DatePicker className="w-[13.5rem]" value={to || null} onChange={(v) => setTo(v || "")} placeholder="To date" />
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { id: "people", label: "By person" },
            { id: "days", label: "By day" },
          ]}
        />
      </div>

      {view === "people" ? (
        <div className="grid gap-3">
          {filteredSummaries.map((row) => {
            const key = `${row.employee_code ?? ""}::${row.employee_name}`;
            const personDays = daysByPerson.get(key) ?? [];
            return (
              <Card key={key}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{row.employee_name}</p>
                    <p className="font-mono text-xs text-muted">
                      {row.employee_code} · {visiblePeople.find((e) => e.employee_code === row.employee_code)?.department || "—"}
                    </p>
                  </div>
                  <dl className="grid grid-cols-3 gap-x-5 text-sm md:grid-cols-6">
                    <Metric label="Hours" value={hoursLabel(Number(row.total_hours))} />
                    <Metric label="Present" value={row.present_days} />
                    <Metric label="Absent" value={row.absent_days} />
                    <Metric label="Leave" value={row.leave_days} />
                    <Metric label="WO" value={row.week_offs} />
                    <Metric label="Late" value={row.late_days} />
                  </dl>
                </div>
                <div className="mt-4 overflow-x-auto border-t border-border pt-3">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] font-semibold text-faint">
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
                        <tr key={day.id} className="border-t border-border hover:bg-surface-2">
                          <td className="py-1.5">{formatWorkDate(day.work_date)}</td>
                          <td>{formatClock(day.punch_in)}</td>
                          <td>{formatClock(day.punch_out)}</td>
                          <td>{day.hours_worked ? hoursLabel(Number(day.hours_worked)) : "—"}</td>
                          <td>
                            <Badge tone={TONE[day.status] ?? "neutral"}>
                              {DAY_STATUS_LABELS[day.status] ?? day.status}
                              {day.is_late ? " · late" : ""}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
          {filteredSummaries.length === 0 ? <p className="text-sm text-faint">No rows match these filters.</p> : null}
        </div>
      ) : (
        <div className="space-y-4">
          {daysByDate.map(([date, rows]) => (
            <Card key={date}>
              <h3 className="font-display text-lg font-medium tracking-tight">{formatWorkDate(date, "long")}</h3>
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-[11px] font-semibold text-faint">
                  <tr>
                    <th className="py-1">Code</th>
                    <th>Name</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice()
                    .sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""))
                    .map((day) => (
                      <tr key={day.id} className="border-t border-border hover:bg-surface-2">
                        <td className="py-1.5 font-mono text-xs">{day.employee_code}</td>
                        <td>{day.employee_name}</td>
                        <td>{formatClock(day.punch_in)}</td>
                        <td>{formatClock(day.punch_out)}</td>
                        <td>{day.hours_worked ? hoursLabel(Number(day.hours_worked)) : "—"}</td>
                        <td>
                          <Badge tone={TONE[day.status] ?? "neutral"}>
                            {DAY_STATUS_LABELS[day.status] ?? day.status}
                            {day.is_late ? " · late" : ""}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          ))}
          {daysByDate.length === 0 ? <p className="text-sm text-faint">No days match these filters.</p> : null}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-card">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="tabular mt-2 text-[28px] font-semibold leading-none">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string | number; value: string | number }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-faint">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
