import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, PageHeader } from "@/components/ui";
import { OfferDocument } from "@/components/offer-document";
import { OfferActions } from "./offer-actions";
import { formatDate } from "@/lib/utils";
import { STATUS_LABELS, type CompanySettings, type OfferLetter, type OfferStatus } from "@/lib/types";

const TONE: Record<OfferStatus, "neutral" | "warn" | "ok" | "danger" | "info"> = {
  draft: "neutral",
  awaiting_signature: "info",
  signed: "ok",
  revoked: "danger",
  expired: "warn",
};

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: offer } = await supabase.from("offer_letters").select("*").eq("id", id).maybeSingle();
  if (!offer) notFound();
  const row = offer as OfferLetter;
  const { data: settings } = await supabase.from("company_settings").select("*").eq("id", 1).maybeSingle();
  const company = settings as CompanySettings | null;
  const { data: events } = await supabase
    .from("offer_events")
    .select("*")
    .eq("offer_id", id)
    .order("created_at", { ascending: false });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const signingUrl = `${appUrl}/sign/${row.signing_token}`;

  return (
    <div>
      <PageHeader
        eyebrow="Offer letter"
        title={row.candidate_name}
        description={`${row.position} · ${row.candidate_email}`}
        actions={
          <div className="flex flex-col items-end gap-2">
            <Badge tone={TONE[row.status]}>{STATUS_LABELS[row.status]}</Badge>
            <OfferActions
              offerId={row.id}
              status={row.status}
              signingUrl={signingUrl}
              validityDays={company?.offer_validity_days ?? 7}
            />
          </div>
        }
      />

      {row.status === "awaiting_signature" ? (
        <p className="mb-6 rounded-2xl border border-terracotta/30 bg-orange-50 px-4 py-3 text-sm">
          Share this private link. The offer is <strong>not sent</strong> until they sign:{" "}
          <code className="break-all text-xs">{signingUrl}</code>
        </p>
      ) : null}
      {row.status === "signed" ? (
        <p className="mb-6 rounded-2xl bg-sage-soft px-4 py-3 text-sm text-sage">
          Signed {formatDate(row.signed_at, { hour: "2-digit", minute: "2-digit" })} by {row.signer_name}. The
          letter is now the official sent offer.
        </p>
      ) : null}

      <OfferDocument
        offer={{
          ...row,
          company_name: company?.company_name ?? "Atrium",
          legal_name: company?.legal_name,
          address: company?.address,
          city: company?.city,
          website: company?.website,
          offer_footer: company?.offer_footer,
        }}
        letterDate={row.created_at}
      />

      <section className="no-print mt-10">
        <h2 className="font-serif text-xl">Activity</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-soft">
          {(events ?? []).map((event) => (
            <li key={event.id}>
              <span className="font-medium text-ink">{event.event_type}</span> · {formatDate(event.created_at, { hour: "2-digit", minute: "2-digit" })}
              {event.note ? ` — ${event.note}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
