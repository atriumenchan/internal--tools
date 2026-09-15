"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { useAppState } from "@/components/app-frame";
import { PageFallback } from "@/components/app-nav";
import { STATUS_LABELS, type OfferLetter, type OfferStatus } from "@/lib/types";

const TONE: Record<OfferStatus, "neutral" | "warn" | "ok" | "danger" | "info"> = {
  draft: "neutral",
  awaiting_signature: "info",
  signed: "ok",
  revoked: "danger",
  expired: "warn",
};

export default function OffersPage() {
  const app = useAppState();
  const router = useRouter();
  const [offers, setOffers] = useState<OfferLetter[] | null>(null);

  useEffect(() => {
    if (app && !app.operator) router.replace("/home");
  }, [app, router]);

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("offer_letters")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setOffers((data ?? []) as OfferLetter[]));
  }, []);

  if (app && !app.operator) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="Hiring"
        title="Offer letters"
        description="A letter is only sent when the candidate signs. Until then the shared link is a private draft."
        actions={
          <Link href="/offers/new">
            <Button>New offer</Button>
          </Link>
        }
      />
      {!offers ? (
        <PageFallback />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-rule bg-cream">
          <table className="w-full text-sm">
            <thead className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {offers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-soft">
                    No offers yet. Create one, then share the signing link.
                  </td>
                </tr>
              ) : (
                offers.map((offer) => (
                  <tr key={offer.id} className="border-t border-rule/70">
                    <td className="px-4 py-3">
                      <Link href={`/offers/${offer.id}`} className="font-medium hover:underline">
                        {offer.candidate_name}
                      </Link>
                      <p className="text-xs text-ink-soft">{offer.candidate_email}</p>
                    </td>
                    <td className="px-4 py-3">{offer.position}</td>
                    <td className="px-4 py-3 text-ink-soft">{formatDate(offer.created_at)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={TONE[offer.status]}>{STATUS_LABELS[offer.status]}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
