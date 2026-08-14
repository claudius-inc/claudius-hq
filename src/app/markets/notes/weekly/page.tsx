import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db, weeklyNotes } from "@/db";
import { logger } from "@/lib/logger";

// A stable entry point for the newest wrap, so the nav tab has an href that
// does not move as wraps are written. Must never serve a cached week.
export const dynamic = "force-dynamic";

const SRC = "markets/notes/weekly";

export default async function WeeklyLatestPage() {
  let weekEnd: string | null = null;
  try {
    const [row] = await db
      .select({ weekEnd: weeklyNotes.weekEnd })
      .from(weeklyNotes)
      .orderBy(desc(weeklyNotes.weekEnd))
      .limit(1);
    weekEnd = row?.weekEnd ?? null;
  } catch (error) {
    logger.error(SRC, "Failed to find the newest wrap", { error });
  }

  // No wrap yet, or the lookup failed: the archive says so properly rather
  // than 404ing a tab the reader just clicked.
  redirect(weekEnd ? `/markets/notes/weekly/${weekEnd}` : "/markets/notes");
}
