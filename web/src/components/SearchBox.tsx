import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A pill-shaped GET search form: the icon, the box and a Search button. */
export function SearchBox({
  action,
  name = "q",
  label,
  placeholder,
  defaultValue,
  size = "md",
  autoFocus,
  className,
}: {
  action?: string;
  name?: string;
  /** For screen readers; the placeholder is what's seen. */
  label: string;
  placeholder: string;
  defaultValue?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
  className?: string;
}) {
  const id = `search-${name}`;
  return (
    <form
      role="search"
      action={action}
      className={cn(
        "flex w-full items-center gap-2 rounded-full border bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        size === "lg" ? "h-14 max-w-xl pr-2 pl-5 shadow-lg shadow-black/5" : "h-11 max-w-md pr-1.5 pl-4",
        className,
      )}
    >
      <Search aria-hidden className={cn("shrink-0 text-muted-foreground", size === "lg" ? "size-5" : "size-4")} />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="search"
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        className={cn("h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground", size === "lg" ? "text-base" : "text-sm")}
      />
      <Button type="submit" size={size === "lg" ? "default" : "sm"} className={cn(size === "lg" && "h-10 px-5")}>
        Search
      </Button>
    </form>
  );
}
