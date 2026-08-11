import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db, dailyNotes } from "@/db";
import { logger } from "@/lib/logger";

// A stable entry point for the newest note — the manifest shortcut and any
// bookmark point here, so it must never serve a cached date.
export const dynamic = "force-dynamic";

const SRC = "markets/notes/latest";

export default async function LatestNotePage() {
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
  // than 404ing a shortcut the user just tapped.
  redirect(date ? `/markets/notes/${date}` : "/markets/notes");
}
