import { cn } from "@/lib/utils";

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  const shape = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]",
    className
  );

  if (src) {
    return (
      // Photos are served from our own route, so Next's image loader adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} title={name} className={cn(shape, "bg-surface-2 object-cover")} />
    );
  }

  return (
    <span
      className={cn(
        shape,
        "bg-[linear-gradient(135deg,var(--amber-soft),var(--amber))] font-bold uppercase tracking-wide text-white"
      )}
    >
      {letters || "?"}
    </span>
  );
}
