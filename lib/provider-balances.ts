import { classifyCredit, type ApiBalanceStatus } from "@/lib/api-balances";

export type ProviderReading = {
  label: string;
  status: ApiBalanceStatus;
  balance: string;
  message: string | null;
};

function money(amount: number, currency: string) {
  const value = (Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${value}` : value;
}

export function readDeepseekBalance(payload: {
  is_available?: boolean;
  balance_infos?: { currency?: string; total_balance?: string }[];
}): ProviderReading {
  const infos = payload.balance_infos ?? [];
  const picked = infos.find((row) => row.currency === "USD") ?? infos[0];
  const amount = Number(picked?.total_balance ?? "0");
  const currency = picked?.currency || "";
  const available = payload.is_available !== false && amount > 0;
  return {
    label: "DeepSeek",
    status: classifyCredit(amount, available),
    balance: money(amount, currency),
    message: available ? null : "This account cannot make calls until it is topped up.",
  };
}

export function readFalBalance(payload: { credits?: { current_balance?: number; currency?: string } }): ProviderReading {
  const amount = Number(payload.credits?.current_balance ?? 0);
  const currency = payload.credits?.currency || "USD";
  return {
    label: "fal.ai",
    status: classifyCredit(amount, amount > 0),
    balance: money(amount, currency),
    message: amount > 0 ? null : "Image credits are gone.",
  };
}

async function getJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 180) || `Request failed (${response.status})`);
  return JSON.parse(text) as unknown;
}

export async function fetchDeepseekBalance(apiKey: string) {
  const payload = (await getJson("https://api.deepseek.com/user/balance", {
    Authorization: `Bearer ${apiKey}`,
  })) as Parameters<typeof readDeepseekBalance>[0];
  return readDeepseekBalance(payload);
}

export async function fetchFalBalance(apiKey: string) {
  const payload = (await getJson("https://api.fal.ai/v1/account/billing?expand=credits", {
    Authorization: `Key ${apiKey}`,
  })) as Parameters<typeof readFalBalance>[0];
  return readFalBalance(payload);
}

export async function fetchWatchedBalances() {
  const deepseek = process.env.DEEPSEEK_API_KEY?.trim();
  const fal = (process.env.FAL_KEY || process.env.FAL_API_KEY)?.trim();
  const jobs: { provider: string; run: () => Promise<ProviderReading> }[] = [];
  if (deepseek) jobs.push({ provider: "deepseek", run: () => fetchDeepseekBalance(deepseek) });
  if (fal) jobs.push({ provider: "fal.ai", run: () => fetchFalBalance(fal) });

  const readings: { provider: string; reading: ProviderReading }[] = [];
  const errors: { provider: string; error: string }[] = [];
  for (const job of jobs) {
    try {
      readings.push({ provider: job.provider, reading: await job.run() });
    } catch (error) {
      errors.push({
        provider: job.provider,
        error: error instanceof Error ? error.message : "Could not read this balance.",
      });
    }
  }
  return {
    readings,
    errors,
    missing: [deepseek ? null : "DeepSeek", fal ? null : "fal.ai"].filter((name): name is string => Boolean(name)),
  };
}
