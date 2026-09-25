"use client";

import { useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui";
import { displayName } from "@/lib/spaces";
import { applyMention, mentionMatches, mentionQueryAt, splitMentions, type MentionPerson } from "@/lib/mentions";

export function MentionBody({ text, people }: { text: string; people: MentionPerson[] }) {
  const parts = splitMentions(text, people);
  return (
    <>
      {parts.map((part, i) =>
        part.mention ? (
          <span key={`${i}-${part.value}`} className="font-medium text-teal">
            {part.value}
          </span>
        ) : (
          <span key={`${i}-${part.value.slice(0, 12)}`}>{part.value}</span>
        )
      )}
    </>
  );
}

export function MentionField({
  value,
  onChange,
  people,
  placeholder,
  rows = 1,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  people: MentionPerson[];
  placeholder?: string;
  rows?: number;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const active = mentionQueryAt(value, caret);
  const options = useMemo(
    () => (active ? mentionMatches(active.query, people) : []),
    [active, people]
  );

  function pick(person: MentionPerson) {
    if (!active) return;
    const next = applyMention(value, caret, active.start, displayName(person));
    onChange(next.text);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        rows={rows}
        required={required}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
      />
      {active && options.length > 0 ? (
        <ul className="absolute bottom-full z-10 mb-1 w-full overflow-hidden rounded-sm border border-border bg-surface shadow-float">
          {options.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(person);
                }}
              >
                {displayName(person)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
