"use client";

import { useState } from "react";
import { UploadSimple } from "@phosphor-icons/react/dist/ssr/UploadSimple";
import { cn } from "@/lib/utils";

export function FileDrop({
  onFile,
  hint = "Optional. Up to 8 MB each.",
  accept,
  label = "Drop a file or click to upload",
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

  return (
    <label
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
