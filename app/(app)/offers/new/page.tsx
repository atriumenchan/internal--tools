"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { OfferForm } from "./offer-form";
import { useAppState } from "@/components/app-frame";
import { PageFallback } from "@/components/app-nav";

export default function NewOfferPage() {
  const app = useAppState();
  const router = useRouter();

  useEffect(() => {
    if (app && !app.operator) router.replace("/home");
  }, [app, router]);

  if (!app?.operator) return <PageFallback />;

  return (
    <div>
      <PageHeader
        eyebrow="Hiring"
        title="Draft an offer"
        description="Save the letter first. You will get a signing link on the next screen — the offer is sent only after they sign."
      />
      <OfferForm createdBy={app.userId} validityDays={7} />
    </div>
  );
}
