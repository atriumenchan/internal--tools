import { describe, expect, it } from "vitest";
import {
  filterTasksByDue,
  matchTaskQuery,
  paginate,
  parseTaskSlice,
  sliceTasks,
  taskSliceCounts,
  tasksForPerson,
} from "./task-overview";

const today = "2026-09-25";
const mine = {
  assignee_id: "me",
  created_by: "boss",
  status: "open" as const,
  due_date: "2026-09-24",
  updated_at: "2026-09-24T06:30:00.000Z",
  created_at: "2026-09-20T06:30:00.000Z",
};
const closed = {
  ...mine,
  status: "done" as const,
  due_date: "2026-09-25",
  updated_at: "2026-09-25T06:30:00.000Z",
};
const theirs = { ...mine, assignee_id: "them", due_date: "2026-09-26" };

describe("parseTaskSlice", () => {
  it("maps today by default, then all, left, closed, overdue", () => {
    expect(parseTaskSlice(null)).toBe("today");
    expect(parseTaskSlice("today")).toBe("today");
    expect(parseTaskSlice("all")).toBe("all");
    expect(parseTaskSlice("left")).toBe("left");
    expect(parseTaskSlice("closed")).toBe("closed");
    expect(parseTaskSlice("done")).toBe("closed");
    expect(parseTaskSlice("overdue")).toBe("overdue");
  });
});

describe("tasksForPerson", () => {
  it("lets admin see everyone or one person", () => {
    expect(tasksForPerson([mine, theirs], "all", "me")).toEqual([mine, theirs]);
    expect(tasksForPerson([mine, theirs], "them", "me")).toEqual([theirs]);
  });
});

describe("sliceTasks", () => {
  it("splits left, closed today, and overdue", () => {
    expect(sliceTasks([mine, closed, theirs], "left", today)).toEqual([mine, theirs]);
    expect(sliceTasks([mine, closed, theirs], "closed", today)).toEqual([closed]);
    expect(sliceTasks([mine, closed, theirs], "overdue", today)).toEqual([mine]);
  });

  it("keeps finished and cancelled work in all", () => {
    const cancelled = { ...mine, status: "cancelled" as const };
    expect(sliceTasks([mine, closed, cancelled], "all", today)).toEqual([mine, closed, cancelled]);
  });

  it("today is due, created, or closed on that day", () => {
    const dueToday = { ...theirs, due_date: today };
    expect(sliceTasks([mine, closed, dueToday], "today", today)).toEqual([closed, dueToday]);
  });
});

describe("taskSliceCounts", () => {
  it("counts the slices for the selected people", () => {
    expect(taskSliceCounts([mine, closed, theirs], today)).toEqual({ today: 1, all: 3, left: 2, closed: 1, overdue: 1 });
  });
});

describe("filterTasksByDue", () => {
  it("keeps only that due date", () => {
    expect(filterTasksByDue([mine, theirs], "2026-09-26")).toEqual([theirs]);
    expect(filterTasksByDue([mine], "")).toEqual([mine]);
  });
});

describe("matchTaskQuery", () => {
  it("matches title, space, and people on every word", () => {
    const task = { title: "September Full Month Report", description: "CPL numbers" };
    expect(matchTaskQuery(task, "sept report", { spaceName: "Kartik (CPS)" })).toBe(true);
    expect(matchTaskQuery(task, "gaurav", { assignee: "Kartik Dhyani" })).toBe(false);
  });
});

describe("paginate", () => {
  it("clips to a page and never goes past the last one", () => {
    const rows = Array.from({ length: 45 }, (_, i) => i);
    expect(paginate(rows, 1, 20)).toMatchObject({ page: 1, pages: 3, start: 1, end: 20, rows: rows.slice(0, 20) });
    expect(paginate(rows, 3, 20)).toMatchObject({ page: 3, pages: 3, start: 41, end: 45 });
    expect(paginate(rows, 9, 20).page).toBe(3);
  });
});
