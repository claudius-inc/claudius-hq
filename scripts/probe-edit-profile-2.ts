/**
 * Reproduce the EXACT sequence the GET /api/tickers/[ticker] handler runs,
 * using the same `db` from "@/db" (same module path the route uses).
 * Goal: see if the failure mode reproduces when run from a worker process
 * vs only inside the Next.js API context.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ quiet: true });

(async () => {
  const { db, scannerUniverse, themeStocks } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const { getTagsForTicker } = await import("../src/lib/tags");
  const { columnsToProfile } = await import("../src/lib/ticker-ai");

  const ticker = "GEV";

  console.log("Promise.all of three queries (route-style)…");
  try {
    const [universe, tags, themeLinks] = await Promise.all([
      db
        .select()
        .from(scannerUniverse)
        .where(eq(scannerUniverse.ticker, ticker))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getTagsForTicker(ticker),
      db
        .select({ themeId: themeStocks.themeId })
        .from(themeStocks)
        .where(eq(themeStocks.ticker, ticker)),
    ]);
    console.log(
      `  universe: ${universe ? "yes" : "no"} | tags: ${tags.length} | themes: ${themeLinks.length}`,
    );
    if (universe) {
      const profile = columnsToProfile(universe);
      console.log("  profile keys:", Object.keys(profile));
      console.log("  profileGeneratedAt:", universe.profileGeneratedAt);
    }
    process.exit(0);
  } catch (e) {
    console.error("  THREW:");
    console.error("  message:", e instanceof Error ? e.message : String(e));
    console.error("  code:   ", (e as { code?: unknown }).code);
    console.error(
      "  cause:  ",
      e instanceof Error && e.cause
        ? e.cause instanceof Error
          ? e.cause.message
          : String(e.cause)
        : "(none)",
    );
    console.error("  fullObj:", e);
    process.exit(1);
  }
})();
