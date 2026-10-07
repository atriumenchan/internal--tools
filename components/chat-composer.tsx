"use client";

import { useRef } from "react";
import { ImageSquare } from "@phosphor-icons/react/dist/ssr/ImageSquare";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
import { Button } from "@/components/ui";
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

  function take(next?: File | null) {
    if (next) onFile(next);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="border-t border-border bg-surface p-3"
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
      <div className="flex items-end gap-2">
        <button
          type="button"
          aria-label="Share a photo"
          onClick={() => input.current?.click()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface-2 hover:text-ink"
        >
          <ImageSquare size={18} weight="light" />
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || (!value.trim() && !file)} className={cn("shrink-0")}>
          <PaperPlaneTilt size={16} weight="fill" />
          Send
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-faint">Drop a photo here, or paste it. Enter sends, Shift+Enter is a new line.</p>
    </form>
  );
}
