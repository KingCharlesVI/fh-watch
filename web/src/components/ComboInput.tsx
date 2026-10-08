"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** How many matches the list shows at once; typing more narrows it. */
const SHOWN = 50;

/** The options with every typed word somewhere in them, in any capitals; those starting with the text first. */
export function filterOptions(options: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  const words = q.split(/\s+/);
  const hits = options.filter((o) => {
    const lower = o.toLowerCase();
    return words.every((w) => lower.includes(w));
  });
  const starts = (o: string) => (o.toLowerCase().startsWith(q) ? 0 : 1);
  return hits.sort((a, b) => starts(a) - starts(b));
}

/**
 * A text field that suggests names from a list as you type (each word anywhere in a name),
 * for a plain form: what's typed is submitted under `name`, picked or not. Arrow keys and
 * Enter pick from the list; Escape closes it.
 */
export function ComboInput({
  id,
  name,
  options,
  defaultValue = "",
  placeholder,
  required,
  maxLength,
  className,
}: {
  id?: string;
  name: string;
  options: readonly string[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const listId = `${inputId}-options`;
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => filterOptions(options, value).slice(0, SHOWN), [options, value]);
  // Nothing to suggest when what's typed is already exactly the one match.
  const showList = open && matches.length > 0 && !(matches.length === 1 && matches[0] === value);

  function pick(option: string) {
    setValue(option);
    setOpen(false);
    setActive(-1);
  }

  function move(by: number) {
    if (!showList) {
      setOpen(true);
      return;
    }
    const next = (active + by + matches.length) % matches.length;
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        id={inputId}
        name={name}
        value={value}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Enter" && showList && active >= 0) {
            // Pick, rather than submit the form.
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === "Escape" && showList) {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((option, i) => (
            <li
              key={option}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(option);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("cursor-pointer rounded-md px-2 py-1.5 text-sm", i === active && "bg-accent text-accent-foreground")}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
