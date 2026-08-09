import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, noteSpotlightConfig, NOTE_SPOTLIGHT_SECTORS, type NoteSpotlightSector } from "@/db";
import { logger } from "@/lib/logger";

const SRC = "api/notes/spotlight";

export async function GET() {
  try {
    const rows = await db.select().from(noteSpotlightConfig);
    const bySector = new Map(rows.map((r) => [r.sector, r.enabled]));
    // Return every known sector so the UI renders a stable, complete list even
    // before the seed rows exist.
    return NextResponse.json({
      sectors: NOTE_SPOTLIGHT_SECTORS.map((sector) => ({
        sector,
        enabled: bySector.get(sector) ?? false,
      })),
    });
  } catch (error) {
    logger.error(SRC, "Failed to read spotlight config", { error });
    return NextResponse.json({ error: "Failed to read spotlight config" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { sector?: string; enabled?: boolean };
    const sector = body.sector as NoteSpotlightSector | undefined;
    if (!sector || !NOTE_SPOTLIGHT_SECTORS.includes(sector)) {
      return NextResponse.json({ error: "Unknown sector" }, { status: 400 });
    }
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "`enabled` must be a boolean" }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    await db
      .insert(noteSpotlightConfig)
      .values({ sector, enabled: body.enabled, updatedAt })
      .onConflictDoUpdate({
        target: noteSpotlightConfig.sector,
        set: { enabled: body.enabled, updatedAt },
      });

    const rows = await db
      .select()
      .from(noteSpotlightConfig)
      .where(eq(noteSpotlightConfig.sector, sector))
      .limit(1);
    return NextResponse.json({ sector, enabled: rows[0]?.enabled ?? body.enabled });
  } catch (error) {
    logger.error(SRC, "Failed to update spotlight config", { error });
    return NextResponse.json({ error: "Failed to update spotlight config" }, { status: 500 });
  }
}
