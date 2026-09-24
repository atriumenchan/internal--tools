"use client";

import { chatIconComponent, chatIconTint } from "@/lib/chat-icons";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";
import type { ConversationType } from "@/lib/types";

export function ConversationMark({
  type,
  names,
  icon,
  className,
}: {
  type: ConversationType;
  names: string[];
  icon?: string | null;
  className?: string;
}) {
  const Glyph = chatIconComponent(icon);
  if (Glyph && (type === "group" || type === "space")) {
    return (
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-[9px]",
          chatIconTint(icon || type),
          className
        )}
        aria-hidden
      >
        <Glyph size={16} strokeWidth={1.6} />
      </span>
    );
  }
  if (type === "space") {
    const Kanban = chatIconComponent("Kanban") || chatIconComponent("LayoutGrid");
    return (
      <span
        className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-teal-dim text-teal", className)}
        aria-hidden
      >
        {Kanban ? <Kanban size={16} strokeWidth={1.6} /> : <span className="text-[11px] font-bold">B</span>}
      </span>
    );
  }
  if (type === "group") {
    const first = names[0] || "Group";
    const second = names[1] || names[0] || "Group";
    return (
      <span className={cn("relative h-8 w-8 shrink-0", className)} aria-hidden>
        <Avatar name={first} size="sm" className="absolute top-0 left-0 h-5 w-5 text-[8px]" />
        <Avatar
          name={second}
          size="sm"
          className="absolute right-0 bottom-0 h-5 w-5 text-[8px] ring-2 ring-surface"
        />
      </span>
    );
  }
  return <Avatar name={names[0] || "DM"} size="sm" className={className} />;
}
