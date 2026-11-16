import {
  balanceHeadline,
  balanceNeedsAttention,
  seesApiBalances,
  type ApiBalanceStatus,
} from "@/lib/api-balances";
import { createAdminClient } from "@/lib/supabase/admin";

export async function recordApiBalance(input: {
  provider: string;
  label: string;
  status: ApiBalanceStatus;
  balance: string | null;
  message: string | null;
}) {
  const admin = createAdminClient();
  const { data: previous, error: readError } = await admin
    .from("api_balances")
    .select("status")
    .eq("provider", input.provider)
    .maybeSingle();
  if (readError) {
    const missing = /api_balances|schema cache|does not exist/i.test(readError.message);
    return {
      ok: false as const,
      status: missing ? 503 : 500,
      error: missing ? "Paste supabase/api-balances.sql in the Supabase SQL editor, then try again." : readError.message,
    };
  }

  const { error: writeError } = await admin.from("api_balances").upsert(
    {
      provider: input.provider,
      label: input.label,
      status: input.status,
      balance: input.balance,
      message: input.message,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" }
  );
  if (writeError) return { ok: false as const, status: 500, error: writeError.message };

  let notified = 0;
  const previousStatus = (previous?.status as ApiBalanceStatus | undefined) ?? null;
  if (previousStatus !== input.status && balanceNeedsAttention(input.status)) {
    const { data: people } = await admin.from("profiles").select("id, full_name, email");
    const owner = (people ?? []).find((person) => seesApiBalances(person));
    if (owner) {
      await admin.from("notifications").delete().eq("type", "api_balance").neq("user_id", owner.id);
      const detail = [input.balance ? `Balance ${input.balance}` : null, input.message].filter(Boolean).join(" · ");
      const { error: noteError } = await admin.from("notifications").insert({
        user_id: owner.id as string,
        actor_id: null,
        type: "api_balance",
        title: balanceHeadline(input.label, input.status),
        body: detail || null,
        href: "/dashboard#api-balances",
      });
      if (!noteError) notified = 1;
    }
  }

  return { ok: true as const, notified };
}
