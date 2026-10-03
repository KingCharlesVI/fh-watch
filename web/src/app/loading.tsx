/** While a page loads: the shape of a heading and a list, so the page doesn't jump when it arrives. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-md bg-muted" />
        <div className="h-4 w-72 rounded-md bg-muted" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="mx-auto h-4 w-64 rounded bg-muted" />
            <div className="hidden h-4 w-32 rounded bg-muted sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
