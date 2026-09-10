import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { OfferForm } from "./offer-form";

export default async function NewOfferPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: settings } = await supabase
    .from("company_settings")
    .select("offer_validity_days")
    .eq("id", 1)
    .maybeSingle();

  return (
    <div>
      <PageHeader
        eyebrow="Hiring"
        title="Draft an offer"
        description="Save the letter first. You will get a signing link on the next screen — the offer is sent only after they sign."
      />
      <OfferForm createdBy={user!.id} validityDays={settings?.offer_validity_days ?? 7} />
    </div>
  );
}
