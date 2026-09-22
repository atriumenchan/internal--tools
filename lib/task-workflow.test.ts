import { describe, expect, it } from "vitest";
import { applyTaskStatus, canManageTask } from "./task-workflow";

const requested = {
  created_by: "a",
  assignee_id: "b",
  reviewer_id: "a",
  status: "in_progress" as const,
};

describe("canManageTask", () => {
  it("lets the creator manage the task", () => {
    expect(canManageTask(requested, { id: "a", role: "employee" })).toBe(true);
  });

  it("lets a manager manage someone else's task", () => {
    expect(canManageTask(requested, { id: "m", role: "manager" })).toBe(true);
  });

  it("blocks a random employee", () => {
    expect(canManageTask(requested, { id: "b", role: "employee" })).toBe(false);
  });
});

describe("applyTaskStatus", () => {
  it("lets the creator move status", () => {
    expect(applyTaskStatus(requested, "done", "a")).toEqual({ status: "done" });
  });

  it("lets a manager move status", () => {
    expect(applyTaskStatus(requested, "done", "m", { role: "manager" })).toEqual({ status: "done" });
  });

  it("blocks the assignee from changing status", () => {
    expect(applyTaskStatus(requested, "done", "b", { role: "employee" }).error).toMatch(/created this task/i);
  });

  it("blocks a stranger", () => {
    expect(applyTaskStatus(requested, "cancelled", "z").error).toMatch(/created this task/i);
  });
});
