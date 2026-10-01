"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { cn } from "@/lib/utils";

const KEY = "it-history-v1";
const HOME = "/dashboard";

type Hist = { stack: string[]; index: number };

function pathNow(pathname: string, search: string) {
  return search ? `${pathname}?${search}` : pathname;
}

function read(fallback: string): Hist {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { stack: [fallback], index: 0 };
    const parsed = JSON.parse(raw) as Hist;
    if (!Array.isArray(parsed.stack) || parsed.stack.length === 0) return { stack: [fallback], index: 0 };
    return parsed;
  } catch {
    return { stack: [fallback], index: 0 };
  }
}

function write(next: Hist) {
  sessionStorage.setItem(KEY, JSON.stringify(next));
}

function NavBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition duration-150",
        disabled ? "cursor-default opacity-35" : "hover:bg-surface-2 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

export function HistoryBar() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const skip = useRef(false);
  const histRef = useRef<Hist>({ stack: [HOME], index: 0 });
  const [hist, setHist] = useState<Hist>(histRef.current);

  function commit(next: Hist) {
    histRef.current = next;
    setHist(next);
    write(next);
  }

  useEffect(() => {
    const path = pathNow(pathname, search.toString());
    commit(read(path));
    // First paint only from storage; later path changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const path = pathNow(pathname, search.toString());
    const prev = histRef.current;
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (prev.stack[prev.index] === path) return;
    commit({
      stack: [...prev.stack.slice(0, prev.index + 1), path],
      index: prev.index + 1,
    });
  }, [pathname, search]);

  function go(delta: number) {
    const prev = histRef.current;
    const index = prev.index + delta;
    const path = prev.stack[index];
    if (!path) {
      if (delta < 0 && pathname !== HOME) router.push(HOME);
      return;
    }
    skip.current = true;
    commit({ ...prev, index });
    router.push(path);
  }

  const canBack = hist.index > 0 || pathname !== HOME;
  const canForward = hist.index < hist.stack.length - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.altKey || e.metaKey) || e.shiftKey || e.ctrlKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mb-4 flex items-center gap-0.5">
      <NavBtn label="Back" disabled={!canBack} onClick={() => go(-1)}>
        <CaretLeft size={18} weight="bold" />
      </NavBtn>
      <NavBtn label="Forward" disabled={!canForward} onClick={() => go(1)}>
        <CaretRight size={18} weight="bold" />
      </NavBtn>
    </div>
  );
}
