import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { balanceProviderKey, balanceStatus } from "@/lib/api-balances";
import { recordApiBalance } from "@/lib/record-api-balance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.BALANCE_ALERT_SECRET || "";
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * A colleague posts the state of a paid API.
 * Authorization: Bearer $BALANCE_ALERT_SECRET
 * { "provider": "fal.ai", "status": "depleted", "balance": "0", "message": "Image credits are gone" }
 * status: ok | low | depleted
 */
export async function POST(request: Request) {
  if (!process.env.BALANCE_ALERT_SECRET) {
    return NextResponse.json({ error: "BALANCE_ALERT_SECRET is not set on the server." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { provider?: unknown; status?: unknown; balance?: unknown; message?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const label = String(body.provider || "").trim().slice(0, 80);
  const provider = balanceProviderKey(label);
  const status = balanceStatus(body.status);
  if (!provider || !status) {
    return NextResponse.json(
      { error: "provider and status are required. status is ok, low, or depleted." },
      { status: 400 }
    );
  }

  const balance = body.balance == null || body.balance === "" ? null : String(body.balance).trim().slice(0, 80);
  const message = body.message == null || body.message === "" ? null : String(body.message).trim().slice(0, 280);
  const result = await recordApiBalance({ provider, label, status, balance, message });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, provider, status, notified: result.notified });
}
