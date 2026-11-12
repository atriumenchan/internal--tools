"use client";

import { Video } from "lucide-react";
import { COMPANY_MEET_URL } from "@/lib/office-links";
import { cn } from "@/lib/utils";

export function JoinMeetButton({ className }: { className?: string }) {
  return (
    <a
      href={COMPANY_MEET_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[var(--graphite)] px-3.5 text-[13px] font-medium text-[var(--text-inverse)] shadow-card transition duration-150 hover:bg-[var(--graphite-hover)] active:scale-[0.98]",
        className
      )}
    >
      <Video size={16} />
      Join meeting
    </a>
  );
}
