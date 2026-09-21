import { Kanban } from "@phosphor-icons/react/dist/ssr/Kanban";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";
import type { ConversationType } from "@/lib/types";

export function ConversationMark({
  type,
  names,
  className,
}: {
  type: ConversationType;
  names: string[];
  className?: string;
}) {
  if (type === "space") {
    return (
      <span
        className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-teal-dim text-teal", className)}
        aria-hidden
      >
        <Kanban size={18} weight="light" />
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
