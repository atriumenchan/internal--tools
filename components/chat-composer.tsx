"use client";

import { useRef } from "react";
import { ImageSquare } from "@phosphor-icons/react/dist/ssr/ImageSquare";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
import { MentionField } from "@/components/mention-field";
import { PendingPhoto } from "@/components/chat-media";
import type { MentionPerson } from "@/lib/mentions";
import { cn } from "@/lib/utils";

export function ChatComposer({
  value,
  onChange,
  people,
  placeholder,
  file,
  onFile,
  onSend,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  people: MentionPerson[];
  placeholder: string;
  file: File | null;
  onFile: (file: File | null) => void;
  onSend: () => void;
  busy?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const empty = !value.trim() && !file;

  function take(next?: File | null) {
    if (next) onFile(next);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="border-t border-border bg-page px-4 py-3"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        take(e.dataTransfer.files?.[0]);
      }}
      onPaste={(e) => {
        const item = [...e.clipboardData.items].find((entry) => entry.kind === "file");
        const pasted = item?.getAsFile();
        if (pasted) {
          e.preventDefault();
          take(pasted);
        }
      }}
    >
      {file ? <PendingPhoto file={file} onClear={() => onFile(null)} /> : null}
      <div className="flex items-end rounded-md border border-border-strong bg-surface focus-within:border-amber focus-within:shadow-[0_0_0_3px_var(--amber-dim)]">
        <button
          type="button"
          aria-label="Share a photo"
          onClick={() => input.current?.click()}
          className="grid h-11 w-11 shrink-0 place-items-center text-muted hover:text-ink"
        >
          <ImageSquare size={20} weight="light" />
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx,.ppt,.pptx,.txt,.zip"
          className="sr-only"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
        <div className="min-w-0 flex-1">
          <MentionField
            value={value}
            onChange={onChange}
            people={people}
            rows={1}
            placeholder={placeholder}
            className="min-h-11 border-0 bg-transparent px-1 py-2.5 shadow-none hover:border-transparent focus:border-transparent focus:shadow-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
        </div>
        <button
          type="submit"
          disabled={busy || empty}
          aria-label="Send"
          className={cn(
            "m-1 grid h-9 w-9 shrink-0 place-items-center rounded-sm text-white",
            "bg-[linear-gradient(135deg,var(--amber-soft),var(--amber))] disabled:opacity-40"
          )}
        >
          <PaperPlaneTilt size={16} weight="fill" />
        </button>
      </div>
    </form>
  );
}
