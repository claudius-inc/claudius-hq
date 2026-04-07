/**
 * Shared SWR config for SSR-hydrated panels on /markets.
 *
 * The pattern: server fetches the initial data during SSR (instant first
 * paint), then the client mounts and SWR fires a background refresh on
 * mount + on tab focus. The panel header shows a `<RefreshIndicator>` while
 * `isValidating` is true.
 *
 * Each panel uses this like:
 *
 *   const { data, isValidating } = useSWR<T>(
 *     "/api/markets/sentiment",
 *     fetcher,
 *     { ...ssrHydratedConfig, fallbackData: props.initialData },
 *   );
 */

export const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Fetch failed: ${r.status} ${url}`);
    return r.json();
  });

export const ssrHydratedConfig = {
  revalidateOnMount: true,
  revalidateOnFocus: true,
  dedupingInterval: 30_000,
} as const;
