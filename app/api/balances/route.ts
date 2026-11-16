import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  balanceHeadline,
  balanceNeedsAttention,
  balanceProviderKey,
  balanceStatus,
  type ApiBalanceStatus,
} from "@/lib/api-balances";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const admin = createAdminClient();

  const { data: previous, error: readError } = await admin
    .from("api_balances")
    .select("status")
    .eq("provider", provider)
    .maybeSingle();
  if (readError) {
    const missing = /api_balances|schema cache|does not exist/i.test(readError.message);
    return NextResponse.json(
      {
        error: missing
          ? "Paste supabase/api-balances.sql in the Supabase SQL editor, then try again."
          : readError.message,
      },
      { status: missing ? 503 : 500 }
    );
  }

  const row = {
    provider,
    label,
    status,
    balance,
    message,
    updated_at: new Date().toISOString(),
  };
  const { error: writeError } = await admin.from("api_balances").upsert(row, { onConflict: "provider" });
  if (writeError) {
    return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  const previousStatus = (previous?.status as ApiBalanceStatus | undefined) ?? null;
  const changed = previousStatus !== status;
  let notified = 0;
  if (changed && balanceNeedsAttention(status)) {
    const { data: people } = await admin.from("profiles").select("id");
    const title = balanceHeadline(label, status);
    const detail = [balance ? `Balance ${balance}` : null, message].filter(Boolean).join(" · ");
    const notes = (people ?? []).map((person) => ({
      user_id: person.id as string,
      actor_id: null,
      type: "api_balance",
      title,
      body: detail || null,
      href: "/dashboard#api-balances",
    }));
    if (notes.length) {
      const { error: noteError } = await admin.from("notifications").insert(notes);
      if (!noteError) notified = notes.length;
    }
  }

  return NextResponse.json({ ok: true, provider, status, notified });
}
