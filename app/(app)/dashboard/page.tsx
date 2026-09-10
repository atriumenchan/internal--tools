import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { OfferLetter } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ count: people }, { count: pending }, { count: signed }, { data: recent }, { data: lastUpload }] =
    await Promise.all([
      supabase.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("offer_letters").select("*", { count: "exact", head: true }).eq("status", "awaiting_signature"),
      supabase.from("offer_letters").select("*", { count: "exact", head: true }).eq("status", "signed"),
      supabase.from("offer_letters").select("*").order("created_at", { ascending: false }).limit(5),
      supabase.from("attendance_uploads").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  const offers = (recent ?? []) as OfferLetter[];

  return (
    <div>
      <PageHeader
        eyebrow="Today"
        title="What needs a hand"
        description="Offers stay unofficial until the candidate signs the link. Attendance is rebuilt from the in/out Excel you upload."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Stat href="/offers" label="Awaiting signature" value={pending ?? 0} hint="Links sent, not yet signed" />
        <Stat href="/offers" label="Signed & sent" value={signed ?? 0} hint="Finalized letters" />
        <Stat href="/employees" label="Active people" value={people ?? 0} hint="Matched in attendance" />
        <Stat
          href="/attendance"
          label="Last attendance file"
          value={lastUpload ? `${lastUpload.period_month}/${lastUpload.period_year}` : "—"}
          hint={lastUpload ? lastUpload.file_name : "Upload an Excel to begin"}
        />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-xl">Recent offers</h2>
            <Link href="/offers/new" className="text-sm text-terracotta">
              New offer
            </Link>
          </div>
          <ul className="divide-y divide-rule">
            {offers.length === 0 ? (
              <li className="py-6 text-sm text-ink-soft">No letters yet.</li>
            ) : (
              offers.map((offer) => (
                <li key={offer.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/offers/${offer.id}`} className="font-medium hover:underline">
                      {offer.candidate_name}
                    </Link>
                    <p className="text-xs text-ink-soft">
                      {offer.position} · {formatDate(offer.created_at)}
                    </p>
                  </div>
                  <OfferBadge status={offer.status} />
                </li>
              ))
            )}
          </ul>
        </Card>
        <Card className="bg-ink text-cream">
          <h2 className="font-serif text-xl">How signing works</h2>
          <ol className="mt-4 space-y-3 text-sm text-cream/75">
            <li>1. Draft the letter. Nothing is sent.</li>
            <li>2. Open it for signature and copy the private link.</li>
            <li>3. The candidate reads and signs. Only then is the offer marked sent.</li>
            <li>4. You can print or download the signed original.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Link href={href} className="rounded-2xl border border-rule bg-cream p-5 transition hover:border-ink/20">
      <p className="text-xs uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-2 font-serif text-3xl">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{hint}</p>
    </Link>
  );
}

function OfferBadge({ status }: { status: OfferLetter["status"] }) {
  const tone =
    status === "signed" ? "ok" : status === "awaiting_signature" ? "info" : status === "draft" ? "neutral" : "danger";
  const label =
    status === "signed"
      ? "Signed & sent"
      : status === "awaiting_signature"
        ? "Awaiting signature"
        : status;
  return <Badge tone={tone}>{label}</Badge>;
}
