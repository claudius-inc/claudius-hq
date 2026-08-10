import { PageHero } from "@/components/PageHero";
import { CHART_HEIGHT, SKELETON_CARDS } from "./_lib/types";

/**
 * Mirrors the loaded page 1:1 — same wrappers, paddings, header, footer row and
 * card count — so nothing shifts when the data arrives. The chart placeholder
 * uses the SAME `CHART_HEIGHT` constant the canvas does rather than a
 * hand-picked value, which is what keeps the two in step when it changes.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 sm:px-6">
      <PageHero
        title="Shortlist"
        subtitle="Every perp the screen surfaced today, as 4h candles with quarterly anchored VWAP. The screen narrows the field; the read is yours."
      />

      <div className="mb-6 h-4 w-52 animate-pulse rounded-sm bg-neutral-200 dark:bg-neutral-800" />

      <div className="mb-5 flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[30px] w-16 animate-pulse rounded-sm bg-neutral-200 dark:bg-neutral-800"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-sm border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-baseline justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="h-[19px] w-28 animate-pulse rounded-sm bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-[19px] w-10 animate-pulse rounded-sm bg-neutral-200 dark:bg-neutral-800" />
            </div>
            <div
              style={{ height: CHART_HEIGHT }}
              className="animate-pulse bg-neutral-100 dark:bg-neutral-950"
            />
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 border-t border-neutral-200 px-3.5 py-2 dark:border-neutral-800">
              {[44, 56, 62, 46, 40, 38].map((w, k) => (
                <div
                  key={k}
                  style={{ width: w }}
                  className="h-[13px] animate-pulse rounded-sm bg-neutral-200 dark:bg-neutral-800"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
