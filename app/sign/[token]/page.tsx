import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/utils";
import type { PublicOffer } from "@/lib/types";
import { SignOffer } from "./sign-offer";

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="font-serif text-3xl">Signing is not connected yet</h1>
        <p className="mt-3 text-ink-soft">Supabase keys are missing on the server.</p>
      </div>
    );
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_offer_for_signing", { p_token: token });
  const offer = (Array.isArray(data) ? data[0] : data) as PublicOffer | undefined;

  if (error || !offer) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="font-serif text-3xl">This link is not active</h1>
        <p className="mt-3 text-ink-soft">
          It may have expired, been revoked, or the offer was never opened for signature.
        </p>
      </div>
    );
  }

  return (
    <SignOffer
      token={token}
      offer={{
        company_name: offer.company_name,
        legal_name: offer.legal_name,
        address: offer.address,
        city: offer.city,
        website: offer.website,
        offer_footer: offer.offer_footer,
        candidate_name: offer.candidate_name,
        candidate_email: offer.candidate_email,
        position: offer.position,
        department: offer.department,
        employment_type: offer.employment_type,
        location: offer.location,
        ctc_annual: offer.ctc_annual,
        ctc_currency: offer.ctc_currency,
        joining_date: offer.joining_date,
        reporting_manager: offer.reporting_manager,
        probation_months: offer.probation_months,
        notice_period_days: offer.notice_period_days,
        custom_body: offer.custom_body,
        benefits: offer.benefits,
        status: offer.status,
        signed_at: offer.signed_at,
        signer_name: offer.signer_name,
        signature_data: offer.signature_data,
      }}
    />
  );
}
