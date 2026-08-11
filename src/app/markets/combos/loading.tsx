import { PageHero } from "@/components/PageHero";
import { SKELETON_ROWS } from "./_lib/types";

/**
 * Mirrors the loaded page 1:1 — same wrappers, same paddings, same row count
 * from the same constant — so nothing shifts when the data arrives.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 sm:px-6">
      <PageHero
        title="Combinations"
        subtitle="Tick indicators and see how the combination would have ordered the cross-section. The explorer finds candidates; the research run confirms them."
      />

      {/* Banner */}
      <div className="mb-5 h-16 animate-pulse rounded border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {Array.from({ length: 5 }).map((_, g) => (
            <div key={g} className="mb-4">
              <div className="mb-1.5 h-3 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-7 w-20 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="h-[320px] animate-pulse rounded border border-neutral-200 dark:border-neutral-800" />
      </div>

      <div className="mt-12">
        <div className="mb-1 h-6 w-40 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mb-4 h-4 w-96 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
        <div className="space-y-1.5">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <div
              key={i}
              className="h-6 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
