"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, PageHeader, Segmented } from "@/components/ui";
import { KnowledgeDocs } from "@/components/knowledge-docs";
import { HANDBOOK_PDF } from "@/lib/handbook";

export function HandbookHome() {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("tab") === "docs" ? "docs" : "pdf";
  const [tab, setTab] = useState<"pdf" | "docs">(requested);

  useEffect(() => {
    setTab(requested);
  }, [requested]);

  function changeTab(next: "pdf" | "docs") {
    setTab(next);
    router.replace(next === "docs" ? "/handbook?tab=docs" : "/handbook", { scroll: false });
  }

  return (
    <div className={tab === "pdf" ? "flex h-[calc(100vh-6rem)] flex-col" : ""}>
      <PageHeader
        title="Handbook"
        description={tab === "pdf" ? "Signed company handbook. Download anytime." : "Short notes and SOPs. The signed PDF is on the Handbook tab."}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={tab}
              onChange={changeTab}
              options={[
                { id: "pdf", label: "PDF" },
                { id: "docs", label: "Docs" },
              ]}
            />
            {tab === "pdf" ? (
              <a href={HANDBOOK_PDF} target="_blank" rel="noreferrer">
                <Button>Download PDF</Button>
              </a>
            ) : null}
          </div>
        }
      />
      {tab === "pdf" ? (
        <iframe title="ADMEXO handbook" src={HANDBOOK_PDF} className="min-h-0 w-full flex-1 rounded-md border border-border bg-surface shadow-card" />
      ) : (
        <KnowledgeDocs />
      )}
    </div>
  );
}
