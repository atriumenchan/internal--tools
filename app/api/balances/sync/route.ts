import { NextResponse } from "next/server";
import { seesApiBalances } from "@/lib/api-balances";
import { fetchWatchedBalances } from "@/lib/provider-balances";
import { recordApiBalance } from "@/lib/record-api-balance";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function allowed(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const header = request.headers.get("authorization") || "";
  if (secret && header === `Bearer ${secret}`) return true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
  return seesApiBalances(profile);
}

/** Reads fal.ai and DeepSeek and stores the live credit balance. */
export async function GET(request: Request) {
  if (!(await allowed(request))) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const watched = await fetchWatchedBalances();
  const saved: { provider: string; status: string; balance: string }[] = [];
  let tableError: string | null = null;
  for (const item of watched.readings) {
    const result = await recordApiBalance({
      provider: item.provider,
      label: item.reading.label,
      status: item.reading.status,
      balance: item.reading.balance,
      message: item.reading.message,
    });
    if (!result.ok) {
      tableError = result.error;
      break;
    }
    saved.push({ provider: item.provider, status: item.reading.status, balance: item.reading.balance });
  }

  return NextResponse.json(
    { ok: !tableError, saved, missing: watched.missing, errors: watched.errors, error: tableError },
    { status: tableError ? 503 : 200 }
  );
}
