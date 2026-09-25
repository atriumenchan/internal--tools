import { describe, expect, it } from "vitest";
import { parseTaskSlice, sliceTasks, taskSliceCounts, tasksForPerson } from "./task-overview";

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
  it("maps closed and overdue, else left", () => {
    expect(parseTaskSlice("closed")).toBe("closed");
    expect(parseTaskSlice("done")).toBe("closed");
    expect(parseTaskSlice("overdue")).toBe("overdue");
    expect(parseTaskSlice("mine")).toBe("left");
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
});

describe("taskSliceCounts", () => {
  it("counts the three slices for the selected people", () => {
    expect(taskSliceCounts([mine, closed, theirs], today)).toEqual({ left: 2, closed: 1, overdue: 1 });
  });
});
