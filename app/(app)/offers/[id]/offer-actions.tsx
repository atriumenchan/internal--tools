"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";

export function OfferActions({
  offerId,
  status,
  signingUrl,
  validityDays,
}: {
  offerId: string;
  status: string;
  signingUrl: string;
  validityDays: number;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openForSignature() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const expires = new Date();
    expires.setDate(expires.getDate() + validityDays);
    const { error: err } = await supabase
      .from("offer_letters")
      .update({
        status: "awaiting_signature",
        sent_for_signature_at: new Date().toISOString(),
        token_expires_at: expires.toISOString(),
      })
      .eq("id", offerId);
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    await supabase.from("offer_events").insert({
      offer_id: offerId,
      event_type: "opened_for_signature",
      note: "Signing link created. Offer is not sent until the candidate signs.",
    });
    setBusy(false);
    router.refresh();
  }

  async function revoke() {
    if (!confirm("Revoke this signing link?")) return;
    const supabase = createClient();
    await supabase.from("offer_letters").update({ status: "revoked" }).eq("id", offerId);
    await supabase.from("offer_events").insert({
      offer_id: offerId,
      event_type: "revoked",
      note: "Link revoked before signature.",
    });
    router.refresh();
  }

  async function remove() {
    const supabase = createClient();
    const { error: err } = await supabase.from("offer_letters").delete().eq("id", offerId);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/offers");
  }

  async function copy() {
    await navigator.clipboard.writeText(signingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {status === "draft" ? (
        <Button onClick={openForSignature} disabled={busy}>
          {busy ? "Opening…" : "Open for signature"}
        </Button>
      ) : null}
      {status === "awaiting_signature" ? (
        <>
          <Button onClick={copy}>{copied ? "Copied" : "Copy signing link"}</Button>
          <Button variant="secondary" onClick={() => window.open(signingUrl, "_blank")}>
            Preview link
          </Button>
          <Button variant="danger" onClick={revoke}>
            Revoke
          </Button>
        </>
      ) : null}
      {status === "signed" ? (
        <Button variant="secondary" onClick={() => window.print()}>
          Print / save PDF
        </Button>
      ) : null}
      <ConfirmDelete
        label="Delete offer"
        title="Delete this offer?"
        description="The letter and signing link will be removed."
        onConfirm={() => remove()}
      />
      {error ? <p className="w-full text-sm text-coral">{error}</p> : null}
    </div>
  );
}
