import { describe, expect, it } from "vitest";
import { applyLeaveDecision, canDecideLeave, canSubmitLeave, leaveDayCount } from "./leave";

const balance = {
  user_id: "u",
  casual_days: 4,
  sick_days: 2,
  earned_days: 10,
  unpaid_used: 0,
};

describe("leave", () => {
  it("counts inclusive days", () => {
    expect(leaveDayCount("2026-09-17", "2026-09-19")).toBe(3);
    expect(leaveDayCount("2026-09-19", "2026-09-17")).toBe(0);
  });

  it("blocks a request bigger than remaining casual days", () => {
    const result = canSubmitLeave({
      start: "2026-09-17",
      end: "2026-09-22",
      type: "casual",
      balance,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/left/i);
  });

  it("blocks self-approval", () => {
    expect(canDecideLeave({ applicantId: "u", actorId: "u", actorIsManager: true }).ok).toBe(false);
    expect(canDecideLeave({ applicantId: "u", actorId: "m", actorIsManager: true }).ok).toBe(true);
    expect(canDecideLeave({ applicantId: "u", actorId: "m", actorIsManager: false }).ok).toBe(false);
  });

  it("decrements balance only on approve", () => {
    const req = { status: "pending" as const, leave_type: "casual" as const, days: 2 };
    expect(applyLeaveDecision(req, balance, "approved").balance.casual_days).toBe(2);
    expect(applyLeaveDecision(req, balance, "rejected").balance.casual_days).toBe(4);
    expect(applyLeaveDecision({ ...req, status: "approved" }, balance, "approved").error).toMatch(/already decided/i);
  });
});
