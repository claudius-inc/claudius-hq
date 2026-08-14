import { redirect } from "next/navigation";
import { latestPeriod } from "@/lib/notes/thirteenf/periods";

/**
 * A stable entry point for the newest filed quarter.
 *
 * The nav needs an href that does not move: pointing the tab straight at
 * `/markets/notes/13f/2026-03-31` would make the tab stop matching the moment a
 * newer quarter lands, and the switcher would fall back to showing "Daily" while
 * the reader sat on a 13F note. This route also gives the sub-tab a prefix that
 * every period page shares, which is what makes the longest-match rule in
 * `NavSectionSwitcher` resolve to "13F quarterly" rather than "Daily".
 */
export default function ThirteenFLatestPage() {
  const latest = latestPeriod();
  // No quarter on file yet: the archive says so properly rather than 404ing a
  // tab the reader just clicked.
  redirect(latest ? `/markets/notes/13f/${latest.periodEnd}` : "/markets/notes");
}
