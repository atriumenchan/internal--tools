"use client";

import { COMPANY_MEET_URL } from "@/lib/office-links";
import { cn } from "@/lib/utils";

export function JoinMeetButton({ className }: { className?: string }) {
  return (
    <a
      href={COMPANY_MEET_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-9 items-center justify-center border border-ink px-3 text-[14px] font-medium text-ink transition-colors duration-150 hover:bg-ink hover:text-[#faf6ee]",
        className
      )}
    >
      Join meeting
    </a>
  );
}
