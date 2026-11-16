import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { seesApiBalances } from "@/lib/api-balances";
import { opsAlertText } from "@/lib/ops-alert";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = (process.env.NOTIFY_SECRET || process.env.BALANCE_ALERT_SECRET || "").trim();
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Anyone with the secret can ping Gaurav.
 * Authorization: Bearer $BALANCE_ALERT_SECRET
 * { "title": "WordPress is down", "message": "Homepage returned 500" }
 */
export async function POST(request: Request) {
  const expected = (process.env.NOTIFY_SECRET || process.env.BALANCE_ALERT_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "BALANCE_ALERT_SECRET is not set on the server." }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const alert = opsAlertText(body);
  if (!alert) {
    return NextResponse.json({ error: "Send a title or a message." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: people, error: peopleError } = await admin.from("profiles").select("id, full_name, email");
  if (peopleError) return NextResponse.json({ error: peopleError.message }, { status: 500 });
  const owner = (people ?? []).find((person) => seesApiBalances(person));
  if (!owner) return NextResponse.json({ error: "Gaurav Mishra was not found." }, { status: 404 });

  const { error } = await admin.from("notifications").insert({
    user_id: owner.id as string,
    actor_id: null,
    type: "ops_alert",
    title: alert.title,
    body: alert.message || null,
    href: "/dashboard#ops-alerts",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
