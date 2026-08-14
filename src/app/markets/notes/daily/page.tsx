import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db, dailyNotes } from "@/db";
import { logger } from "@/lib/logger";

// A stable entry point for the newest session, so the nav tab has an href that
// does not move as notes are written. Must never serve a cached date.
export const dynamic = "force-dynamic";

const SRC = "markets/notes/daily";

export default async function DailyLatestPage() {
  let date: string | null = null;
  try {
    const [row] = await db
      .select({ date: dailyNotes.date })
      .from(dailyNotes)
      .orderBy(desc(dailyNotes.date))
      .limit(1);
    date = row?.date ?? null;
  } catch (error) {
    logger.error(SRC, "Failed to find the newest note", { error });
  }

  // No note yet, or the lookup failed: the archive says so properly rather
  // than 404ing a tab the reader just clicked.
  redirect(date ? `/markets/notes/daily/${date}` : "/markets/notes");
}
