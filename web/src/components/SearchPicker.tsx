"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/** A search box that offers matches as you type (from two letters), and hands back the one picked. */
export function SearchPicker<T extends { id: string }>({
  id,
  placeholder,
  search,
  label,
  onPick,
}: {
  id?: string;
  placeholder: string;
  search: (q: string) => Promise<T[]>;
  label: (item: T) => string;
  onPick: (item: T) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const latest = useRef(0);

  useEffect(() => {
    const ticket = ++latest.current;
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const found = await search(q.trim());
      if (ticket === latest.current) setResults(found);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, search]);

  return (
    <div className="relative">
      <Input id={id} type="search" value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {results.length > 0 && (
        <ul className="mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-sm">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onPick(r);
                  setQ("");
                  setResults([]);
                }}
              >
                {label(r)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
