import { ChevronDownIcon } from "lucide-react";

/**
 * A select for plain GET/POST forms, styled like the site's other fields. A native select,
 * so it submits under `name`, and when a form action resets the form afterwards (as React
 * does), it goes back to the saved value rather than to blank. The value "any" means no
 * filter, by convention.
 */
export function FilterSelect({
  name,
  defaultValue,
  options,
  placeholder,
  id,
}: {
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  id?: string;
}) {
  return (
    <div className="relative w-full">
      <select
        // React doesn't update a select's default once mounted; a new one takes a newly saved value,
        // which is what the form goes back to when it's reset.
        key={defaultValue}
        id={id}
        name={name}
        defaultValue={defaultValue ?? (placeholder ? "" : undefined)}
        required={placeholder !== undefined}
        className="h-8 w-full appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 invalid:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50"
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-foreground">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
