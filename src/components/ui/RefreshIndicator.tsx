/**
 * Tiny visual cue that pulses when a panel is revalidating its data via SWR.
 * Used in the header of every SSR-hydrated panel on /markets so the user can
 * see at a glance that "the data you're looking at is being refreshed in the
 * background."
 *
 * Pass `active={isValidating}` from the panel's `useSWR(...)` hook.
 */
export function RefreshIndicator({
  active,
  className = "",
}: {
  active: boolean;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={active ? "Refreshing" : "Up to date"}
      title={active ? "Refreshing…" : "Up to date"}
      className={`inline-block w-1.5 h-1.5 rounded-full transition-opacity duration-200 ${
        active
          ? "bg-blue-400 animate-pulse [animation-duration:3s] opacity-100"
          : "opacity-0"
      } ${className}`}
    />
  );
}
