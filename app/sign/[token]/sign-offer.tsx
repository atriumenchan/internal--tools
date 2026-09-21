"use client";

import { useState } from "react";
import { OfferDocument, type OfferDocumentData } from "@/components/offer-document";
import { SignaturePad } from "@/components/signature-pad";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function SignOffer({
  token,
  offer,
}: {
  token: string;
  offer: OfferDocumentData;
}) {
  const [name, setName] = useState(offer.candidate_name);
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(offer.status === "signed");
  const [preview, setPreview] = useState(offer);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError("Please confirm you accept this offer.");
      return;
    }
    if (!signature) {
      setError("Type your name and pick a signature style.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("sign_offer", {
      p_token: token,
      p_signer_name: name,
      p_signature_data: signature,
      p_ip: null,
      p_user_agent: typeof navigator === "undefined" ? null : navigator.userAgent,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    if (data && (data as { ok?: boolean }).ok === false) {
      setError("Could not sign this offer.");
      setBusy(false);
      return;
    }
    setPreview({
      ...preview,
      status: "signed",
      signer_name: name,
      signature_data: signature,
      signed_at: new Date().toISOString(),
    });
    setDone(true);
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="no-print mb-8">
        <p className="text-xs font-medium text-amber">{preview.company_name}</p>
        <h1 className="font-display mt-1 text-4xl font-medium tracking-tight">
          {done ? "Offer signed and sent" : "Review and sign"}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          {done
            ? "Your signature finalized this letter. It is now the official sent offer."
            : "Read the letter. It is not sent to the company as an accepted offer until you sign."}
        </p>
      </div>

      <OfferDocument offer={preview} />

      {done ? (
        <div className="no-print mt-8 flex gap-3">
          <Button onClick={() => window.print()}>Download / print</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="no-print mt-10 space-y-5 rounded-md border border-border bg-surface p-6 shadow-card">
          <h2 className="font-display text-2xl font-medium tracking-tight">Sign to send</h2>
          <Field label="Type your name as you spell it">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Signature style">
            <SignaturePad name={name} onChange={setSignature} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            I have read this offer and accept its terms. Signing sends the executed letter to{" "}
            {preview.company_name}.
          </label>
          {error ? <p className="text-sm text-coral">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Sign and send offer"}
          </Button>
        </form>
      )}
    </div>
  );
}
