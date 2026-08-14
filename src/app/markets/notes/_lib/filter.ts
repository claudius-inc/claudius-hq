/**
 * The archive's note kinds and its type filter.
 *
 * Kept out of `page.tsx` because that module opens the database at import time,
 * so anything living beside it can only be exercised with a live connection.
 * These are pure and worth testing on their own.
 */

export type NoteKind = "daily" | "weekly" | "quarterly";

/**
 * The filter, as links carrying a search param rather than client state.
 *
 * A filtered archive is something a reader sends on ("the 13F ones"), and a URL
 * that survives being sent is worth more here than the instant feedback of
 * local state. It also keeps the page a server component: no hydration pass,
 * and no filter flashing from All to the chosen kind after load.
 *
 * The URL key is deliberately separate from the internal one, so the param can
 * read `13f` — matching the route those notes already live at — while the code
 * keeps calling the kind `quarterly`.
 */
export const FILTERS = [
  { key: "all", kind: null, label: "All" },
  { key: "daily", kind: "daily", label: "Daily" },
  { key: "weekly", kind: "weekly", label: "Weekly" },
  { key: "13f", kind: "quarterly", label: "13F" },
] as const satisfies ReadonlyArray<{ key: string; kind: NoteKind | null; label: string }>;

export type FilterKey = (typeof FILTERS)[number]["key"];

/**
 * The filter a `?kind=` value selects; anything unrecognised falls back to All.
 *
 * Falling back rather than 404ing is the point: a hand-edited or stale link
 * should land on the archive, not on an error page.
 */
export function resolveFilter(param: string | undefined): FilterKey {
  return FILTERS.some((f) => f.key === param) ? (param as FilterKey) : "all";
}

/** The kind a filter selects, or null for All. */
export function kindFor(key: FilterKey): NoteKind | null {
  return FILTERS.find((f) => f.key === key)?.kind ?? null;
}

/** The href for a filter pill — All is the bare route, not `?kind=all`. */
export function filterHref(key: FilterKey): string {
  return key === "all" ? "/markets/notes" : `/markets/notes?kind=${key}`;
}
