export type ApiBalanceStatus = "ok" | "low" | "depleted";

export type ApiBalance = {
  provider: string;
  label: string;
  status: ApiBalanceStatus;
  balance: string | null;
  message: string | null;
  updated_at: string;
};

export function balanceProviderKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function balanceStatus(value: unknown): ApiBalanceStatus | null {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (["depleted", "empty", "out", "ended", "recharge", "exhausted"].includes(key)) return "depleted";
  if (["low", "warning", "warn"].includes(key)) return "low";
  if (["ok", "funded", "active", "healthy"].includes(key)) return "ok";
  return null;
}

export function classifyCredit(amount: number, available = true): ApiBalanceStatus {
  if (!available || !Number.isFinite(amount) || amount <= 0) return "depleted";
  if (amount < 5) return "low";
  return "ok";
}

export function balanceNeedsAttention(status: ApiBalanceStatus) {
  return status === "low" || status === "depleted";
}

export function seesApiBalances(person: { full_name?: string | null; email?: string | null } | null | undefined) {
  const name = (person?.full_name || "").trim().toLowerCase();
  const email = (person?.email || "").trim().toLowerCase();
  return name === "gaurav mishra" || email.startsWith("gaurav@");
}

export function balanceHeadline(label: string, status: ApiBalanceStatus) {
  if (status === "depleted") return `${label} needs a recharge`;
  if (status === "low") return `${label} is running low`;
  return `${label} is funded`;
}
