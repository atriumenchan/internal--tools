import { formatCurrency, formatDate } from "@/lib/utils";
import { EMPLOYMENT_LABELS, type EmploymentType, type OfferStatus } from "@/lib/types";

export type OfferDocumentData = {
  company_name: string;
  legal_name?: string | null;
  address?: string | null;
  city?: string | null;
  website?: string | null;
  offer_footer?: string | null;
  candidate_name: string;
  candidate_email: string;
  position: string;
  department?: string | null;
  employment_type: EmploymentType;
  location?: string | null;
  ctc_annual?: number | null;
  ctc_currency?: string;
  joining_date?: string | null;
  reporting_manager?: string | null;
  probation_months?: number | null;
  notice_period_days?: number | null;
  custom_body?: string | null;
  benefits?: string | null;
  status?: OfferStatus;
  signed_at?: string | null;
  signer_name?: string | null;
  signature_data?: string | null;
};

export function OfferDocument({ offer, letterDate }: { offer: OfferDocumentData; letterDate?: string }) {
  const pending = offer.status === "awaiting_signature" || offer.status === "draft";
  const signed = offer.status === "signed";

  return (
    <article className="letter-sheet relative overflow-hidden rounded-sm px-8 py-10 md:px-14 md:py-14">
      {pending ? <div className="watermark">Unsigned</div> : null}
      {signed ? <div className="watermark" style={{ color: "rgba(63,92,74,0.08)" }}>Signed</div> : null}

      <header className="border-b border-rule pb-6">
        <p className="font-serif text-3xl tracking-tight">{offer.company_name}</p>
        {offer.legal_name ? <p className="mt-1 text-sm text-ink-soft">{offer.legal_name}</p> : null}
        <p className="mt-3 text-sm text-ink-soft">
          {[offer.address, offer.city].filter(Boolean).join(", ")}
        </p>
        {offer.website ? <p className="text-sm text-ink-soft">{offer.website}</p> : null}
      </header>

      <p className="mt-8 text-sm text-ink-soft">{formatDate(letterDate ?? new Date().toISOString())}</p>

      <h1 className="mt-6 font-serif text-3xl leading-tight">Offer of employment</h1>
      <p className="mt-4 text-[15px] leading-7">
        Dear {offer.candidate_name},
      </p>
      <p className="mt-3 text-[15px] leading-7">
        We are pleased to offer you the position of <strong>{offer.position}</strong>
        {offer.department ? <> in {offer.department}</> : null}
        {offer.location ? <> , based in {offer.location}</> : null}. This is a{" "}
        {EMPLOYMENT_LABELS[offer.employment_type].toLowerCase()} role
        {offer.joining_date ? <> with a proposed joining date of {formatDate(offer.joining_date)}</> : null}.
      </p>

      {offer.custom_body ? (
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7">{offer.custom_body}</p>
      ) : (
        <p className="mt-4 text-[15px] leading-7">
          We believe your experience will strengthen the team, and we look forward to working with you.
          This letter sets out the principal terms of the offer. A detailed employment agreement will
          follow on joining.
        </p>
      )}

      <dl className="mt-8 grid gap-3 border-y border-rule py-6 text-sm md:grid-cols-2">
        <Row label="Compensation" value={formatCurrency(offer.ctc_annual, offer.ctc_currency ?? "INR") + " CTC / year"} />
        <Row label="Employment type" value={EMPLOYMENT_LABELS[offer.employment_type]} />
        <Row label="Reporting to" value={offer.reporting_manager || "—"} />
        <Row label="Probation" value={`${offer.probation_months ?? 3} months`} />
        <Row label="Notice period" value={`${offer.notice_period_days ?? 30} days`} />
        <Row label="Candidate email" value={offer.candidate_email} />
      </dl>

      {offer.benefits ? (
        <section className="mt-6">
          <h2 className="font-serif text-lg">Benefits</h2>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7">{offer.benefits}</p>
        </section>
      ) : null}

      <p className="mt-8 text-[15px] leading-7">
        This offer is valid only once you sign below. Until then it is not an executed letter and has
        not been sent as a binding offer. Signing finalizes and sends the letter to {offer.company_name}.
      </p>

      <div className="mt-12 grid gap-10 md:grid-cols-2">
        <div>
          <p className="text-xs text-muted">For {offer.company_name}</p>
          <div className="mt-10 border-t border-ink pt-2 text-sm">Authorized signatory</div>
        </div>
        <div>
          <p className="text-xs text-muted">Accepted by candidate</p>
          {offer.signature_data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={offer.signature_data} alt="Signature" className="mt-2 h-16 object-contain" />
          ) : (
            <div className="mt-2 h-16 border-b border-dashed border-rule" />
          )}
          <p className="mt-2 text-sm">{offer.signer_name || offer.candidate_name}</p>
          {offer.signed_at ? (
            <p className="text-xs text-ink-soft">Signed {formatDate(offer.signed_at, { hour: "2-digit", minute: "2-digit" })}</p>
          ) : (
            <p className="text-xs text-ink-soft">Awaiting signature</p>
          )}
        </div>
      </div>

      {offer.offer_footer ? (
        <p className="mt-12 text-xs leading-5 text-ink-soft">{offer.offer_footer}</p>
      ) : null}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
