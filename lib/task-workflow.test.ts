import { describe, expect, it } from "vitest";
import { applyTaskStatus } from "./task-workflow";

const self = {
  created_by: "a",
  assignee_id: "a",
  reviewer_id: null,
  status: "in_progress" as const,
};

const requested = {
  created_by: "a",
  assignee_id: "b",
  reviewer_id: "a",
  status: "in_progress" as const,
};

describe("applyTaskStatus", () => {
  it("lets someone mark their own task done", () => {
    expect(applyTaskStatus(self, "done", "a")).toEqual({ status: "done" });
  });

  it("turns an assignee Done click into In review when someone else requested the work", () => {
    expect(applyTaskStatus(requested, "done", "b")).toEqual({ status: "in_review" });
  });

  it("rejects Done from the assignee when they try to skip review via a forced check", () => {
    const result = applyTaskStatus(requested, "in_review", "b");
    expect(result.status).toBe("in_review");
    expect(applyTaskStatus({ ...requested, status: "in_review" }, "done", "b").error).toMatch(/reviewer/i);
  });

  it("lets the reviewer approve", () => {
    expect(applyTaskStatus({ ...requested, status: "in_review" }, "done", "a")).toEqual({ status: "done" });
  });

  it("blocks a stranger from cancelling", () => {
    expect(applyTaskStatus(requested, "cancelled", "z").error).toMatch(/requester or assignee/i);
  });
});
