import { Button } from "@/components/ui";

const HANDBOOK = "/handbook/ADMEXO-Employee-Intern-Handbook-v2.0.pdf";

export default function HandbookPage() {
  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-terracotta">Everyone</p>
          <h1 className="font-serif text-3xl">Employee & intern handbook</h1>
          <p className="mt-1 text-sm text-ink-soft">ADMEXO handbook v2.0 — visible to every signed-in person.</p>
        </div>
        <a href={HANDBOOK} target="_blank" rel="noreferrer">
          <Button>Download PDF</Button>
        </a>
      </div>
      <iframe title="ADMEXO handbook" src={HANDBOOK} className="min-h-0 w-full flex-1 rounded-2xl border border-rule bg-white" />
    </div>
  );
}
