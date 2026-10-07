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
  onClick,
}: {
  type: ConversationType;
  names: string[];
  icon?: string | null;
  className?: string;
  onClick?: () => void;
}) {
  const Glyph = chatIconComponent(icon);
  const mark =
    Glyph && (type === "group" || type === "space") ? (
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
    ) : type === "space" ? (
      <span
        className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-teal-dim text-teal", className)}
        aria-hidden
      >
        {(() => {
          const Kanban = chatIconComponent("Kanban") || chatIconComponent("LayoutGrid");
          return Kanban ? <Kanban size={16} strokeWidth={1.6} /> : <span className="text-[11px] font-bold">B</span>;
        })()}
      </span>
    ) : type === "group" ? (
      <span
        className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-violet-dim text-violet", className)}
        aria-hidden
      >
        {(() => {
          const Users = chatIconComponent("UsersRound") || chatIconComponent("Users");
          return Users ? <Users size={16} strokeWidth={1.6} /> : <span className="text-[11px] font-bold">G</span>;
        })()}
      </span>
    ) : (
      <Avatar name={names[0] || "DM"} size="sm" className={className} />
    );

  if (!onClick) return mark;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Change icon"
      aria-label="Change icon"
      className="shrink-0 rounded-[9px] transition duration-150 hover:ring-2 hover:ring-amber"
    >
      {mark}
    </button>
  );
}
