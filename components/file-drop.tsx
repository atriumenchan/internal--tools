"use client";

import { useEffect, useState } from "react";
import { UploadSimple } from "@phosphor-icons/react/dist/ssr/UploadSimple";
import { fileFromClipboard } from "@/lib/chat-thread";
import { cn } from "@/lib/utils";

export function FileDrop({
  onFile,
  hint = "Optional. Up to 8 MB each.",
  accept,
  label = "Drop, paste, or click to upload",
}: {
  onFile: (file: File) => void;
  hint?: string;
  accept?: string;
  label?: string;
}) {
  const [over, setOver] = useState(false);

  function take(file?: File | null) {
    if (file) onFile(file);
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = fileFromClipboard(e.clipboardData);
      if (!file) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("textarea, input:not([type=file])")) return;
      e.preventDefault();
      take(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFile]);

  return (
    <label
      tabIndex={0}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-5 text-center transition duration-200",
        over ? "border-amber bg-amber-dim" : "border-border bg-surface hover:border-border-strong"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files?.[0]);
      }}
    >
      <UploadSimple size={18} weight="light" className="text-muted" />
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="text-xs text-muted">{hint}</span>
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}
