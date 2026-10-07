"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import { isChatImage } from "@/lib/chat-thread";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

function srcFor(message: ChatMessage) {
  return `/api/chat-files?id=${message.id}`;
}

export function ChatAttachment({ message, className }: { message: ChatMessage; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!message.file_path) return null;
  const photo = isChatImage(message.file_type, message.file_name);
  const href = srcFor(message);

  if (!photo) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn("inline-flex max-w-full items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 text-left text-[13px] hover:border-border-strong", className)}
      >
        <FileText size={16} weight="light" className="shrink-0 text-teal" />
        <span className="truncate">{message.file_name || "File"}</span>
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("block max-w-[16rem] overflow-hidden rounded-md", className)}>
        {/* Chat photos are signed through our own route. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={message.file_name || "Photo"} className="max-h-56 w-full object-cover" />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(20,32,28,0.72)] p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            aria-label="Close preview"
            className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full bg-surface text-ink"
            onClick={() => setOpen(false)}
          >
            <X size={18} weight="light" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={message.file_name || "Photo"}
            className="max-h-[90vh] max-w-[min(52rem,100%)] rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

export function PendingPhoto({ file, onClear }: { file: File; onClear: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const photo = isChatImage(file.type, file.name);
  return (
    <div className="relative mb-2 inline-flex max-w-[12rem] items-start">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.name} className="max-h-28 rounded-md object-cover" />
      ) : (
        <span className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-[13px]">
          <FileText size={16} weight="light" className="text-teal" />
          <span className="truncate">{file.name}</span>
        </span>
      )}
      <button
        type="button"
        aria-label="Remove file"
        onClick={onClear}
        className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-surface text-ink shadow-card"
      >
        <X size={12} weight="light" />
      </button>
    </div>
  );
}
