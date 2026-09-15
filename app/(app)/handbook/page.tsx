import { Button, PageHeader } from "@/components/ui";
import { HANDBOOK_PDF } from "@/lib/handbook";

export default function HandbookPage() {
  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <PageHeader
        eyebrow="Everyone"
        title="Employee & intern handbook"
        description="ADMEXO handbook — visible after you sign. Download anytime."
        actions={
          <a href={HANDBOOK_PDF} target="_blank" rel="noreferrer">
            <Button>Download PDF</Button>
          </a>
        }
      />
      <iframe title="ADMEXO handbook" src={HANDBOOK_PDF} className="min-h-0 w-full flex-1 rounded-xl border border-rule bg-white shadow-card" />
    </div>
  );
}
