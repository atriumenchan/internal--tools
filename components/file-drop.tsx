"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
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
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed px-3 py-5 text-center transition duration-200",
        over ? "border-blue bg-blue/10" : "border-rule bg-input hover:border-line-hover"
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
      <Upload size={18} className="text-muted" />
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
