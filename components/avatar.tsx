import { cn } from "@/lib/utils";

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-blue/15 font-semibold uppercase tracking-wide text-blue-soft ring-1 ring-blue/20",
        size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]",
        className
      )}
    >
      {letters || "?"}
    </span>
  );
}
