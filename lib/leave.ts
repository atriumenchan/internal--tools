export type LeaveType = "casual" | "sick" | "earned" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";

export const LEAVE_TYPES: LeaveType[] = ["casual", "sick", "earned", "unpaid"];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  casual: "Casual",
  sick: "Sick",
  earned: "Earned",
  unpaid: "Unpaid",
};

export type LeaveBalance = {
  user_id: string;
  casual_days: number;
  sick_days: number;
  earned_days: number;
  unpaid_used: number;
};

export type LeaveRequest = {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export function leaveDayCount(start: string | null | undefined, end: string | null | undefined) {
  const a = (start || "").slice(0, 10);
  const b = (end || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || b < a) return 0;
  const from = Date.parse(`${a}T00:00:00Z`);
  const to = Date.parse(`${b}T00:00:00Z`);
  return Math.round((to - from) / 86400000) + 1;
}

export function remainingForType(balance: LeaveBalance | null | undefined, type: LeaveType) {
  if (!balance) return type === "unpaid" ? Infinity : 0;
  if (type === "casual") return Number(balance.casual_days);
  if (type === "sick") return Number(balance.sick_days);
  if (type === "earned") return Number(balance.earned_days);
  return Infinity;
}

export function canSubmitLeave(input: {
  start: string;
  end: string;
  type: LeaveType;
  balance: LeaveBalance | null | undefined;
  pendingDays?: number;
}) {
  const days = leaveDayCount(input.start, input.end);
  if (days <= 0) return { ok: false as const, days, error: "Pick an end date on or after the start date." };
  if (input.type === "unpaid") return { ok: true as const, days };
  const left = remainingForType(input.balance, input.type) - (input.pendingDays || 0);
  if (days > left) {
    return { ok: false as const, days, error: `Only ${Math.max(0, left)} day(s) left on this type.` };
  }
  return { ok: true as const, days };
}

export function canDecideLeave(input: { applicantId: string; actorId: string; actorIsManager: boolean }) {
  if (!input.actorIsManager) return { ok: false as const, error: "Only a manager can approve leave." };
  if (input.applicantId === input.actorId) return { ok: false as const, error: "You cannot approve your own leave." };
  return { ok: true as const };
}

export function applyLeaveDecision(
  request: Pick<LeaveRequest, "status" | "leave_type" | "days">,
  balance: LeaveBalance,
  decision: "approved" | "rejected"
): { balance: LeaveBalance; error?: string } {
  if (request.status !== "pending") {
    return { balance, error: "This request is already decided." };
  }
  if (decision === "rejected") return { balance };
  const next = { ...balance };
  if (request.leave_type === "casual") next.casual_days = Number(next.casual_days) - Number(request.days);
  if (request.leave_type === "sick") next.sick_days = Number(next.sick_days) - Number(request.days);
  if (request.leave_type === "earned") next.earned_days = Number(next.earned_days) - Number(request.days);
  if (request.leave_type === "unpaid") next.unpaid_used = Number(next.unpaid_used) + Number(request.days);
  if (request.leave_type !== "unpaid" && remainingForType(next, request.leave_type) < 0) {
    return { balance, error: "Not enough balance left for this type." };
  }
  return { balance: next };
}
