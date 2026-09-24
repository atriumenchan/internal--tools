"use client";

import { useMemo, useState } from "react";
import { chatIconComponent, chatIconList, chatIconTint } from "@/lib/chat-icons";
import { Input } from "@/components/ui";

function label(name: string) {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function ChatIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [query, setQuery] = useState("");
  const names = useMemo(() => chatIconList(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    const rows = q ? names.filter((name) => name.toLowerCase().includes(q) || label(name).toLowerCase().replace(/\s+/g, "").includes(q)) : names;
    return rows.slice(0, 360);
  }, [names, query]);

  return (
    <div>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search icons" />
      <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-page p-1.5">
        <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
          {filtered.map((name) => {
            const Glyph = chatIconComponent(name);
            if (!Glyph) return null;
            const active = value === name;
            return (
              <button
                key={name}
                type="button"
                title={label(name)}
                onClick={() => onChange(name)}
                className={`grid h-8 w-8 place-items-center rounded-[8px] transition duration-150 ${
                  active ? chatIconTint(name) + " ring-1 ring-amber" : "text-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Glyph size={15} strokeWidth={1.6} />
              </button>
            );
          })}
        </div>
        {filtered.length === 0 ? <p className="px-2 py-6 text-center text-xs text-faint">No icons match that.</p> : null}
      </div>
      <p className="mt-1.5 text-[11px] text-faint">
        {names.length} icons. Showing {filtered.length}
        {query.trim() ? " matches" : ""}.
      </p>
    </div>
  );
}
