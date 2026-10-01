import { describe, expect, it } from "vitest";
import {
  assignedTo,
  givenByPerson,
  personMetricRows,
  taskMetrics,
  taskOutcome,
  weekStartKey,
  weeklyTaskTrend,
} from "./task-metrics";

const today = "2026-09-25";

const onTime = {
  assignee_id: "me",
  created_by: "boss",
  status: "done" as const,
  due_date: "2026-09-24",
  created_at: "2026-09-20T06:30:00.000Z",
  updated_at: "2026-09-24T06:30:00.000Z",
};
const late = { ...onTime, due_date: "2026-09-22" };
const overdue = { ...onTime, status: "open" as const, due_date: "2026-09-24", updated_at: undefined };
const left = { ...overdue, due_date: "2026-09-30" };
const noDue = { ...onTime, due_date: null };
const theirs = { ...left, assignee_id: "them" };

describe("taskOutcome", () => {
  it("splits on time, late, overdue, left, and cancelled", () => {
    expect(taskOutcome(onTime, today)).toBe("on_time");
    expect(taskOutcome(late, today)).toBe("late");
    expect(taskOutcome(overdue, today)).toBe("overdue");
    expect(taskOutcome(left, today)).toBe("left");
    expect(taskOutcome({ ...left, status: "cancelled" }, today)).toBe("cancelled");
  });

  it("counts a finished task with no due date as on time", () => {
    expect(taskOutcome(noDue, today)).toBe("on_time");
  });

  it("closing late on the due date in IST is still on time", () => {
    expect(taskOutcome({ ...onTime, due_date: "2026-09-24", updated_at: "2026-09-24T16:00:00.000Z" }, today)).toBe("on_time");
  });

  it("closing just after midnight IST counts as late", () => {
    expect(taskOutcome({ ...onTime, due_date: "2026-09-24", updated_at: "2026-09-24T18:35:00.000Z" }, today)).toBe("late");
  });
});

describe("taskMetrics", () => {
  it("totals the outcomes and the on-time rate", () => {
    expect(taskMetrics([onTime, late, overdue, left], today)).toEqual({
      assigned: 4,
      done: 2,
      onTime: 1,
      late: 1,
      overdue: 1,
      left: 1,
      cancelled: 0,
      onTimeRate: 0.5,
    });
  });

  it("leaves the rate empty when nothing is finished", () => {
    expect(taskMetrics([overdue, left], today).onTimeRate).toBeNull();
  });
});

describe("assignedTo and givenByPerson", () => {
  it("keeps the person's own work, or everything for all", () => {
    expect(assignedTo([onTime, theirs], "me")).toEqual([onTime]);
    expect(assignedTo([onTime, theirs], "all")).toEqual([onTime, theirs]);
  });

  it("counts only what the person handed to someone else", () => {
    expect(givenByPerson([onTime, theirs], "boss")).toEqual([onTime, theirs]);
    expect(givenByPerson([{ ...onTime, created_by: "me" }], "me")).toEqual([]);
  });
});

describe("personMetricRows", () => {
  it("drops people with no tasks and puts the busiest first", () => {
    const rows = personMetricRows([onTime, late, theirs], ["me", "them", "idle"], today);
    expect(rows.map((row) => row.id)).toEqual(["me", "them"]);
    expect(rows[0].metrics.assigned).toBe(2);
  });
});

describe("weekStartKey", () => {
  it("snaps to the Monday of that week", () => {
    expect(weekStartKey("2026-09-25")).toBe("2026-09-21");
    expect(weekStartKey("2026-09-21")).toBe("2026-09-21");
    expect(weekStartKey("not-a-date")).toBeNull();
  });
});

describe("weeklyTaskTrend", () => {
  it("buckets given out and finished by week, oldest first", () => {
    const trend = weeklyTaskTrend([onTime, late], 2, today);
    expect(trend).toHaveLength(2);
    expect(trend[0].start).toBe("2026-09-14");
    expect(trend[0].assigned).toBe(2);
    expect(trend[1].start).toBe("2026-09-21");
    expect(trend[1].done).toBe(2);
  });
});
