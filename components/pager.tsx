"use client";

import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { cn } from "@/lib/utils";

export function Pager({
  page,
  pages,
  start,
  end,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  start: number;
  end: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total === 0) return null;

  const windowed = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5">
      <p className="text-[12px] text-muted">
        {start}–{end} of {total}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            className="grid h-8 w-8 place-items-center rounded-sm text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <CaretLeft size={16} weight="light" />
          </button>
          {windowed.map((n, i) => {
            const gap = i > 0 && n - windowed[i - 1] > 1;
            return (
              <span key={n} className="flex items-center gap-1">
                {gap ? <span className="px-1 text-[12px] text-faint">…</span> : null}
                <button
                  type="button"
                  onClick={() => onChange(n)}
                  className={cn(
                    "min-w-8 rounded-sm px-2 py-1.5 text-[13px] font-medium tabular-nums",
                    n === page ? "bg-amber-dim text-amber" : "text-muted hover:bg-surface-2 hover:text-ink"
                  )}
                >
                  {n}
                </button>
              </span>
            );
          })}
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
            className="grid h-8 w-8 place-items-center rounded-sm text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <CaretRight size={16} weight="light" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
