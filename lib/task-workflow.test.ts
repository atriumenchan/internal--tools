import { describe, expect, it } from "vitest";
import { applyTaskStatus, canManageSpace, canManageTask, canMoveTask } from "./task-workflow";

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

  it("does not let the assignee edit or delete", () => {
    expect(canManageTask(requested, { id: "b", role: "employee" })).toBe(false);
  });
});

describe("canMoveTask", () => {
  it("lets the assignee move status", () => {
    expect(canMoveTask(requested, { id: "b", role: "employee" })).toBe(true);
  });

  it("blocks a stranger", () => {
    expect(canMoveTask(requested, { id: "z", role: "employee" })).toBe(false);
  });
});

describe("canManageSpace", () => {
  const board = { created_by: "a" };

  it("lets the creator delete their board", () => {
    expect(canManageSpace(board, { id: "a", role: "employee" })).toBe(true);
  });

  it("lets a manager delete someone else's board", () => {
    expect(canManageSpace(board, { id: "m", role: "manager" })).toBe(true);
  });

  it("lets admin delete someone else's board", () => {
    expect(canManageSpace(board, { id: "x", role: "admin" })).toBe(true);
  });

  it("blocks a random employee", () => {
    expect(canManageSpace(board, { id: "b", role: "employee" })).toBe(false);
  });
});

describe("applyTaskStatus", () => {
  it("lets the creator move status", () => {
    expect(applyTaskStatus(requested, "done", "a")).toEqual({ status: "done" });
  });

  it("lets a manager move status", () => {
    expect(applyTaskStatus(requested, "done", "m", { role: "manager" })).toEqual({ status: "done" });
  });

  it("lets the assignee move status", () => {
    expect(applyTaskStatus(requested, "done", "b", { role: "employee" })).toEqual({ status: "done" });
  });

  it("blocks a stranger", () => {
    expect(applyTaskStatus(requested, "cancelled", "z").error).toMatch(/assignee/i);
  });
});
