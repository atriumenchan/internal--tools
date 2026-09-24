"use client";

import { VideoCamera } from "@phosphor-icons/react/dist/ssr/VideoCamera";
import { COMPANY_MEET_URL } from "@/lib/office-links";
import { cn } from "@/lib/utils";

export function JoinMeetButton({ className }: { className?: string }) {
  return (
    <a
      href={COMPANY_MEET_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm bg-teal-dim px-3 py-1.5 text-[13px] font-medium text-teal transition duration-150 hover:brightness-[1.03]",
        className
      )}
    >
      <VideoCamera size={16} weight="light" />
      Join meeting
    </a>
  );
}
