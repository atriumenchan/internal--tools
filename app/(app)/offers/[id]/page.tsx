"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, PageHeader } from "@/components/ui";
import { OfferDocument } from "@/components/offer-document";
import { OfferActions } from "./offer-actions";
import { formatDate } from "@/lib/utils";
import { useAppState } from "@/components/app-frame";
import { PageFallback } from "@/components/app-nav";
import { STATUS_LABELS, type CompanySettings, type OfferLetter, type OfferStatus } from "@/lib/types";

const TONE: Record<OfferStatus, "neutral" | "warn" | "ok" | "danger" | "info"> = {
  draft: "neutral",
  awaiting_signature: "info",
  signed: "ok",
  revoked: "danger",
  expired: "warn",
};

type OfferEvent = { id: string; event_type: string; created_at: string; note: string | null };

export default function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const app = useAppState();
  const router = useRouter();
  const [row, setRow] = useState<OfferLetter | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [events, setEvents] = useState<OfferEvent[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (app && !app.operator) router.replace("/dashboard");
  }, [app, router]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    void Promise.all([
      supabase.from("offer_letters").select("*").eq("id", id).maybeSingle(),
      supabase.from("company_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("offer_events").select("*").eq("offer_id", id).order("created_at", { ascending: false }),
    ]).then(([offerRes, settingsRes, eventsRes]) => {
      if (!offerRes.data) {
        setMissing(true);
        return;
      }
      setRow(offerRes.data as OfferLetter);
      setCompany(settingsRes.data as CompanySettings | null);
      setEvents((eventsRes.data ?? []) as OfferEvent[]);
    });
  }, [id]);

  if (app && !app.operator) return <PageFallback />;
  if (missing) return <p className="text-sm text-ink-soft">Offer not found.</p>;
  if (!row) return <PageFallback />;

  const signingUrl = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/sign/${row.signing_token}`;

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
          company_name: company?.company_name ?? "ADMEXO",
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
          {events.map((event) => (
            <li key={event.id}>
              <span className="font-medium text-ink">{event.event_type}</span> ·{" "}
              {formatDate(event.created_at, { hour: "2-digit", minute: "2-digit" })}
              {event.note ? ` — ${event.note}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
