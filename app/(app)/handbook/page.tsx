import { Button } from "@/components/ui";
import { HANDBOOK_PDF } from "@/lib/handbook";

export default function HandbookPage() {
  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-terracotta">Everyone</p>
          <h1 className="text-3xl font-semibold tracking-tight">Employee & intern handbook</h1>
          <p className="mt-1 text-sm text-ink-soft">ADMEXO handbook — visible after you sign. Download anytime.</p>
        </div>
        <a href={HANDBOOK_PDF} target="_blank" rel="noreferrer">
          <Button>Download PDF</Button>
        </a>
      </div>
      <iframe title="ADMEXO handbook" src={HANDBOOK_PDF} className="min-h-0 w-full flex-1 rounded-2xl border border-rule bg-white" />
    </div>
  );
}
