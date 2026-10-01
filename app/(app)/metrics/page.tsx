"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, PageHeader, Select } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { useAppState, useWorkspaceCache } from "@/components/app-frame";
import { Donut, StackedBars, StatTile, TrendBars } from "@/components/charts";
import { isAdminUser, isIgnoredEmployee } from "@/lib/admin";
import { displayName, missingSpacesSchema } from "@/lib/spaces";
import { kolkataTodayKey } from "@/lib/datetime";
import { useSilentLive } from "@/lib/silent-live";
import {
  assignedTo,
  givenByPerson,
  personMetricRows,
  spaceMetricRows,
  taskMetrics,
  weeklyTaskTrend,
} from "@/lib/task-metrics";
import type { Profile, Space, Task } from "@/lib/types";

const ON_TIME = "var(--teal)";
const LATE = "var(--amber)";
const OVERDUE = "var(--coral)";
const OPEN = "var(--text-faint)";
const GIVEN = "var(--violet)";

function percent(rate: number | null) {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function MetricsPageInner() {
  const app = useAppState();
  const cache = useWorkspaceCache();
  const router = useRouter();
  const search = useSearchParams();
  const admin = app ? isAdminUser(app.profile) : false;
  const personParam = search.get("person");
  const person = admin ? personParam || "all" : "me";
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const todayKey = kolkataTodayKey();

  const loadTasks = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("spaces").select("id, name, color, created_by, created_at").order("name"),
      supabase.from("profiles").select("*").order("full_name"),
    ]).then(([taskRes, spaceRes, peopleRes]) => {
      if (taskRes.error) {
        setError(
          missingSpacesSchema(taskRes.error.message)
            ? "Task boards are not set up yet. Paste supabase/spaces.sql in the Supabase SQL editor, then refresh."
            : taskRes.error.message
        );
      }
      setTasks((taskRes.data ?? []) as Task[]);
      setSpaces((spaceRes.data ?? []) as Space[]);
      setPeople((peopleRes.data ?? []) as Profile[]);
    });
  }, []);

  useSilentLive(() => void loadTasks(), "metrics");

  const peopleMap = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const spaceMap = useMemo(() => Object.fromEntries(spaces.map((s) => [s.id, s])), [spaces]);
  const ignoredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const employee of cache?.employees ?? []) {
      if (employee.user_id && isIgnoredEmployee(employee.employee_code, employee.full_name)) ids.add(employee.user_id);
    }
    return ids;
  }, [cache?.employees]);

  const peopleOptions = useMemo(() => {
    const rows: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    const myId = app?.userId;
    for (const employee of cache?.employees ?? []) {
      if (!employee.user_id || employee.user_id === myId || seen.has(employee.user_id)) continue;
      if (isIgnoredEmployee(employee.employee_code, employee.full_name)) continue;
      seen.add(employee.user_id);
      rows.push({ id: employee.user_id, label: `${employee.employee_code} · ${employee.full_name}` });
    }
    for (const profile of people) {
      if (!profile.id || profile.id === myId || seen.has(profile.id) || ignoredIds.has(profile.id)) continue;
      seen.add(profile.id);
      rows.push({ id: profile.id, label: displayName(profile) });
    }
    return rows;
  }, [cache?.employees, people, app?.userId, ignoredIds]);

  const personId = person === "me" ? app?.userId || "" : person;
  const scoped = useMemo(() => assignedTo(tasks ?? [], personId || "all"), [tasks, personId]);
  const metrics = useMemo(() => taskMetrics(scoped, todayKey), [scoped, todayKey]);
  const given = useMemo(
    () => taskMetrics(givenByPerson(tasks ?? [], personId || "all"), todayKey),
    [tasks, personId, todayKey]
  );
  const trend = useMemo(() => weeklyTaskTrend(scoped, 8, todayKey), [scoped, todayKey]);

  const barRows = useMemo(() => {
    const segments = (m: ReturnType<typeof taskMetrics>) => [
      { label: "Done on time", value: m.onTime, color: ON_TIME },
      { label: "Done late", value: m.late, color: LATE },
      { label: "Overdue", value: m.overdue, color: OVERDUE },
      { label: "Still open", value: m.left, color: OPEN },
    ];
    if (personId === "all") {
      const ids = people.filter((p) => !ignoredIds.has(p.id)).map((p) => p.id);
      return personMetricRows(tasks ?? [], ids, todayKey).map((row) => ({
        id: row.id,
        label: displayName(peopleMap[row.id]),
        total: row.metrics.assigned,
        segments: segments(row.metrics),
      }));
    }
    return spaceMetricRows(scoped, todayKey).map((row) => ({
      id: row.id,
      label: spaceMap[row.id]?.name || "Board",
      total: row.metrics.assigned,
      segments: segments(row.metrics),
    }));
  }, [personId, people, ignoredIds, tasks, todayKey, peopleMap, scoped, spaceMap]);

  function setPerson(next: string) {
    router.replace(next === "all" ? "/metrics" : `/metrics?person=${next}`);
  }

  if (!app || tasks === null) return <PageFallback />;

  const whose =
    personId === "all"
      ? "Everyone"
      : personId === app.userId
        ? "You"
        : displayName(peopleMap[personId]);
  const unassigned = personId === "all" ? (tasks ?? []).filter((task) => !task.assignee_id).length : 0;

  return (
    <div>
      <PageHeader
        title="Metrics"
        description={
          admin
            ? "How much work each person carries, and how much of it lands on time. Pick a person to see only theirs."
            : "Your tasks, and how many of them land on time."
        }
        actions={
          admin ? (
            <Select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              className="w-[14rem]"
              aria-label="Whose metrics"
            >
              <option value="all">Everyone</option>
              <option value="me">My metrics</option>
              {peopleOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
      {error ? <p className="mb-4 text-sm text-coral">{error}</p> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Assigned" value={String(metrics.assigned)} hint={personId === "all" ? "Every task on every board" : `Tasks given to ${whose.toLowerCase()}`} />
        <StatTile label="Done on time" value={String(metrics.onTime)} tone="ok" hint={`${percent(metrics.onTimeRate)} of finished work`} />
        <StatTile label="Done late" value={String(metrics.late)} tone="warn" hint="Finished after the due date" />
        <StatTile label="Overdue now" value={String(metrics.overdue)} tone="danger" hint="Past due and still open" />
        <StatTile label="Still open" value={String(metrics.left)} hint="Not finished, not late yet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-xl font-medium tracking-tight">Where the work stands</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            {metrics.assigned === 0 ? "No tasks yet." : `${whose} · ${metrics.assigned} task${metrics.assigned === 1 ? "" : "s"} in total.`}
          </p>
          <Donut
            centerValue={percent(metrics.onTimeRate)}
            centerHint="on time"
            slices={[
              { label: "Done on time", value: metrics.onTime, color: ON_TIME },
              { label: "Done late", value: metrics.late, color: LATE },
              { label: "Overdue now", value: metrics.overdue, color: OVERDUE },
              { label: "Still open", value: metrics.left, color: OPEN },
            ]}
          />
          {metrics.cancelled > 0 ? (
            <p className="mt-4 text-[12px] text-faint">{metrics.cancelled} cancelled, not counted above.</p>
          ) : null}
        </Card>

        <Card>
          <h2 className="font-display text-xl font-medium tracking-tight">
            {personId === "all" ? "Load per person" : "Load per board"}
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            {personId === "all"
              ? "Bar length is how many tasks they hold. Colour is how those ended."
              : `Boards ${whose.toLowerCase()} ${whose === "You" ? "work" : "works"} on.`}
          </p>
          <StackedBars rows={barRows} emptyLabel="No tasks assigned yet." />
          {unassigned > 0 ? (
            <p className="mt-4 text-[12px] text-faint">{unassigned} task{unassigned === 1 ? "" : "s"} with nobody assigned.</p>
          ) : null}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-display text-xl font-medium tracking-tight">Last 8 weeks</h2>
          <p className="mt-1 mb-4 text-sm text-muted">New tasks against tasks finished, week by week.</p>
          <TrendBars
            points={trend.map((point) => ({ label: point.label, a: point.assigned, b: point.done }))}
            seriesA={{ label: "New tasks", color: GIVEN }}
            seriesB={{ label: "Finished", color: ON_TIME }}
          />
        </Card>

        {personId !== "all" ? (
          <Card className="lg:col-span-2">
            <h2 className="font-display text-xl font-medium tracking-tight">Given to other people</h2>
            <p className="mt-1 mb-4 text-sm text-muted">
              Tasks {whose === "You" ? "you" : whose} handed to someone else, and how those are going.
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Handed out" value={String(given.assigned)} />
              <StatTile label="Done on time" value={String(given.onTime)} tone="ok" />
              <StatTile label="Done late" value={String(given.late)} tone="warn" />
              <StatTile label="Overdue now" value={String(given.overdue)} tone="danger" />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export default function MetricsPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <MetricsPageInner />
    </Suspense>
  );
}
