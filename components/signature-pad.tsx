"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Allura&family=Caveat:wght@600&family=Dancing+Script:wght@500&family=Great+Vibes&family=Pacifico&family=Satisfy&display=swap";

const FONTS = [
  { id: "great-vibes", label: "Great Vibes", family: "Great Vibes" },
  { id: "allura", label: "Allura", family: "Allura" },
  { id: "dancing", label: "Dancing Script", family: "Dancing Script" },
  { id: "satisfy", label: "Satisfy", family: "Satisfy" },
  { id: "pacifico", label: "Pacifico", family: "Pacifico" },
  { id: "caveat", label: "Caveat", family: "Caveat" },
] as const;

function ensureFontsStylesheet() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

async function nameToSignaturePng(text: string, family: string) {
  const trimmed = text.trim();
  if (trimmed.length < 2) return "";
  try {
    await document.fonts.load(`72px "${family}"`);
    await document.fonts.ready;
  } catch {
    // Draw anyway with fallback.
  }
  const width = 1000;
  const height = 240;
  const ratio = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#161410";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 72;
  ctx.font = `${size}px "${family}", cursive`;
  while (ctx.measureText(trimmed).width > width - 64 && size > 28) {
    size -= 2;
    ctx.font = `${size}px "${family}", cursive`;
  }
  ctx.fillText(trimmed, width / 2, height / 2);
  return canvas.toDataURL("image/png");
}

export function SignaturePad({
  name,
  onChange,
  className,
}: {
  name: string;
  onChange: (dataUrl: string) => void;
  className?: string;
}) {
  const [fontId, setFontId] = useState<string>(FONTS[0].id);
  const previewId = useId();
  const font = FONTS.find((item) => item.id === fontId) ?? FONTS[0];
  const sample = name.trim() || "Your name";

  useEffect(() => {
    ensureFontsStylesheet();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void nameToSignaturePng(name, font.family).then((dataUrl) => {
      if (!cancelled) onChange(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [name, font.family, onChange]);

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-xs text-ink-soft">Pick a style. This is what gets saved as your signature.</p>
      <div className="grid grid-cols-2 gap-2">
        {FONTS.map((item) => {
          const active = item.id === font.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFontId(item.id)}
              className={cn(
                "rounded-xl border bg-white px-3 py-3 text-left transition",
                active ? "border-terracotta ring-2 ring-terracotta/40" : "border-rule hover:border-ink-soft"
              )}
            >
              <span className="block text-[10px] uppercase tracking-wide text-ink-soft">{item.label}</span>
              <span className="mt-1 block truncate text-2xl text-[#161410]" style={{ fontFamily: `"${item.family}", cursive` }}>
                {sample}
              </span>
            </button>
          );
        })}
      </div>
      <div
        id={previewId}
        className="flex h-28 items-center justify-center rounded-xl border border-rule bg-white px-4"
      >
        <p
          className="max-w-full truncate text-center text-4xl leading-none text-[#161410]"
          style={{ fontFamily: `"${font.family}", cursive` }}
        >
          {sample}
        </p>
      </div>
    </div>
  );
}
