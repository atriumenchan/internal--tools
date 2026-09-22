"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, Badge, Button, Card } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState } from "@/components/app-frame";
import { formatClock, formatWorkDate, hoursLabel } from "@/lib/datetime";
import { rangeLabel } from "@/lib/periodic-attendance";
import { lastWeekBounds, latestUploadRange } from "@/lib/own-attendance";
import { DAY_STATUS_LABELS, type AttendanceDay, type DayStatus } from "@/lib/types";

const TONE: Record<DayStatus, "neutral" | "warn" | "ok" | "danger" | "info"> = {
  present: "ok",
  absent: "danger",
  half_day: "warn",
  leave: "info",
  week_off: "neutral",
  holiday: "neutral",
  unmatched: "warn",
};

export default function MyAttendancePage() {
  const app = useAppState();
  const [days, setDays] = useState<AttendanceDay[] | null>(null);
  const [linked, setLinked] = useState(true);

  useEffect(() => {
    if (!app) return;
    void (async () => {
      const res = await fetch("/api/attendance/mine");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLinked(false);
        setDays([]);
        return;
      }
      if (!json.linked) {
        setLinked(false);
        setDays([]);
        return;
      }
      setLinked(true);
      setDays((json.days ?? []) as AttendanceDay[]);
    })();
  }, [app]);

  const keys = useMemo(() => (days ?? []).map((d) => d.work_date).filter(Boolean), [days]);
  const week = lastWeekBounds(keys);
  const latest = latestUploadRange(keys);
  const weekDays = useMemo(() => {
    if (!days || !week) return [];
    return days.filter((d) => d.work_date >= week.start && d.work_date <= week.end);
  }, [days, week]);
  const latestDays = useMemo(() => {
    if (!days || !latest) return [];
    return days.filter((d) => d.work_date >= latest.start && d.work_date <= latest.end);
  }, [days, latest]);

  function download(rows: AttendanceDay[], filename: string) {
    void import("@/lib/excel").then(({ exportSummariesWorkbook }) => {
      exportSummariesWorkbook(
        filename,
        rows.map((day) => ({
          Date: day.work_date,
          In: day.punch_in ?? "",
          Out: day.punch_out ?? "",
          Hours: day.hours_worked ?? "",
          Status: DAY_STATUS_LABELS[day.status] ?? day.status,
          Late: day.is_late ? "Yes" : "",
        }))
      );
    });
  }

  if (!app || days === null) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="You"
        title="My attendance"
        description="Your punches from the weekly Excel. Last week is the Monday–Sunday of the newest date in your file."
      />
      {!linked ? (
        <p className="text-sm text-muted">Ask admin to link your login on Staff so this page can match your employee code.</p>
      ) : days.length === 0 ? (
        <p className="text-sm text-muted">No attendance in Supabase for you yet. It appears after the next weekly upload.</p>
      ) : (
        <div className="space-y-8">
          {week ? (
            <Card>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium tracking-wide text-faint uppercase">Last week</p>
                  <h2 className="font-display text-xl font-medium tracking-tight">{rangeLabel(week.start, week.end)}</h2>
                  <p className="mt-1 text-sm text-muted">{totalsLine(weekDays)}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => download(weekDays, `attendance-last-week-${week.start}.xlsx`)}
                >
                  Download last week
                </Button>
              </div>
              <DayTable rows={weekDays} />
            </Card>
          ) : null}

          {latest && (!week || latest.start !== week.start || latest.end !== week.end) ? (
            <Card>
              <div className="mb-4">
                <p className="text-[11px] font-medium tracking-wide text-faint uppercase">Latest file</p>
                <h2 className="font-display text-xl font-medium tracking-tight">{rangeLabel(latest.start, latest.end)}</h2>
                <p className="mt-1 text-sm text-muted">{totalsLine(latestDays)}</p>
              </div>
              <DayTable rows={latestDays} />
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

function totalsLine(rows: AttendanceDay[]) {
  const present = rows.filter((d) => d.status === "present" || d.status === "half_day").length;
  const absent = rows.filter((d) => d.status === "absent").length;
  const late = rows.filter((d) => d.is_late).length;
  const hours = rows.reduce((sum, d) => sum + Number(d.hours_worked || 0), 0);
  return `Present ${present} · Absent ${absent} · Late ${late} · ${hoursLabel(hours)}`;
}

function DayTable({ rows }: { rows: AttendanceDay[] }) {
  if (!rows.length) {
    return <p className="text-sm text-faint">No days in this window.</p>;
  }
  return (
    <div className="overflow-x-auto">
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
          {rows.map((day) => (
            <tr key={day.id} className="border-t border-rule/60">
              <td className="py-1.5">{formatWorkDate(day.work_date)}</td>
              <td>{formatClock(day.punch_in)}</td>
              <td>{formatClock(day.punch_out)}</td>
              <td>{day.hours_worked ? hoursLabel(day.hours_worked) : "—"}</td>
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
  );
}
