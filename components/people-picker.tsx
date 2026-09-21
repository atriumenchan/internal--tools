"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { displayName } from "@/lib/spaces";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export function PeoplePicker({
  people,
  selected,
  onChange,
  placeholder = "Search people",
}: {
  people: Profile[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => !q || displayName(p).toLowerCase().includes(q));
  }, [people, query]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
      {selected.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {people
            .filter((p) => selected.includes(p.id))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="rounded-sm bg-teal-dim px-2 py-0.5 text-[11px] font-medium text-teal hover:bg-teal/20"
              >
                {displayName(p)} ×
              </button>
            ))}
        </div>
      ) : null}
      <ul className="mt-2 max-h-48 overflow-y-auto rounded-sm border border-border bg-surface">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-faint">No one matches.</li>
        ) : (
          filtered.map((person) => {
            const on = selected.includes(person.id);
            return (
              <li key={person.id} className="border-b border-border last:border-0">
                <button
                  type="button"
                  onClick={() => toggle(person.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
                    on ? "bg-teal-dim" : "hover:bg-surface-2"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-sm border",
                      on ? "border-teal bg-teal text-[10px] text-white" : "border-border-strong"
                    )}
                  >
                    {on ? "✓" : null}
                  </span>
                  <Avatar name={displayName(person)} size="sm" />
                  <span className="truncate">{displayName(person)}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
