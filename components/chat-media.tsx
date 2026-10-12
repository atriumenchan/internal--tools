"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import { isChatImage, isPdfFile } from "@/lib/chat-thread";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

function srcFor(message: ChatMessage) {
  return `/api/chat-files?id=${message.id}`;
}

export function ImagePreview({
  src,
  alt,
  onClose,
  kind = "image",
}: {
  src: string;
  alt?: string;
  onClose: () => void;
  kind?: "image" | "pdf";
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(20,32,28,0.72)] p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close preview"
        className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full bg-surface text-ink"
        onClick={onClose}
      >
        <X size={18} weight="light" />
      </button>
      {kind === "pdf" ? (
        <iframe
          src={src}
          title={alt || "PDF"}
          className="h-[90vh] w-[min(52rem,100%)] rounded-md bg-white"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt || "Preview"}
          className="max-h-[90vh] max-w-[min(52rem,100%)] rounded-md object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

export function StoredFilePreview({ href, name, type }: { href: string; name: string; type?: string | null }) {
  const [open, setOpen] = useState(false);
  const photo = isChatImage(type, name);
  const pdf = isPdfFile(type, name);

  if (!photo && !pdf) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 text-left text-sm transition duration-200 hover:border-border-strong"
      >
        <FileText size={18} weight="light" className="shrink-0 text-teal" />
        <span className="min-w-0 truncate">{name}</span>
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm border border-border bg-surface p-2 text-left text-sm transition duration-200 hover:border-border-strong"
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={href} alt="" className="h-14 w-14 shrink-0 rounded-sm object-cover" />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-sm bg-page font-mono text-[11px] text-teal">
            PDF
          </span>
        )}
        <span className="min-w-0 truncate">{name}</span>
      </button>
      {open ? (
        <ImagePreview src={href} alt={name} kind={pdf ? "pdf" : "image"} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function ChatAttachment({ message, className }: { message: ChatMessage; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!message.file_path) return null;
  const photo = isChatImage(message.file_type, message.file_name);
  const pdf = isPdfFile(message.file_type, message.file_name);
  const href = srcFor(message);

  if (!photo && !pdf) {
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
        {photo ? (
          // Chat photos are signed through our own route.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={href} alt={message.file_name || "Photo"} className="max-h-56 w-full object-cover" />
        ) : (
          <span className="inline-flex w-full items-center gap-2 bg-surface px-3 py-2 text-left text-[13px]">
            <FileText size={16} weight="light" className="shrink-0 text-teal" />
            <span className="truncate">{message.file_name || "PDF"}</span>
          </span>
        )}
      </button>
      {open ? (
        <ImagePreview
          src={href}
          alt={message.file_name || "File"}
          kind={pdf ? "pdf" : "image"}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function PendingPhoto({ file, onClear }: { file: File; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const photo = isChatImage(file.type, file.name);
  const pdf = isPdfFile(file.type, file.name);
  return (
    <div className="relative mb-2 inline-flex max-w-[14rem] items-start">
      {photo || pdf ? (
        <button type="button" onClick={() => setOpen(true)} className="block overflow-hidden rounded-md">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="max-h-36 w-full object-cover" />
          ) : (
            <span className="inline-flex max-w-[14rem] items-center gap-2 rounded-sm border border-border px-3 py-2 text-[13px]">
              <FileText size={16} weight="light" className="shrink-0 text-teal" />
              <span className="min-w-0 truncate">{file.name}</span>
            </span>
          )}
        </button>
      ) : (
        <span className="inline-flex max-w-[14rem] items-center gap-2 rounded-sm border border-border px-3 py-2 text-[13px]">
          <FileText size={16} weight="light" className="shrink-0 text-teal" />
          <span className="min-w-0 truncate">{file.name}</span>
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
      {open ? <ImagePreview src={url} alt={file.name} kind={pdf ? "pdf" : "image"} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
