/**
 * Serves the quantized explorer panel to the browser.
 *
 * The payload is stored in chunks (see drizzle/0034) because a single ~1 MB row
 * is close enough to row-size limits not to bet on. This route concatenates them
 * in order and returns raw bytes — not JSON, which would inflate a binary
 * payload by roughly a third and cost a parse on the client.
 *
 * Cached hard. The panel changes only when the research export is re-run, which
 * is a manual act, so `immutable` on a URL that carries the run date is exactly
 * right: a new export is a new URL and never needs revalidation.
 */
import { NextRequest, NextResponse } from "next/server";
import { rawClient } from "@/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const horizon = Number(request.nextUrl.searchParams.get("horizon") ?? "6");
  const wantMeta = request.nextUrl.searchParams.get("meta") === "true";

  try {
    const metaRes = await rawClient.execute({
      sql: `SELECT run_date, header, n_chunks, bytes
            FROM perp_explorer_meta
            WHERE horizon = ?
            ORDER BY run_date DESC
            LIMIT 1`,
      args: [horizon] as never[],
    });

    if (!metaRes.rows.length) {
      return NextResponse.json(
        {
          error: "No explorer panel has been exported yet.",
          hint: "npx tsx scripts/research/export-combo-explorer.ts",
        },
        { status: 404 },
      );
    }

    const meta = metaRes.rows[0] as unknown as {
      run_date: string;
      header: string;
      n_chunks: number;
      bytes: number;
    };

    // The header alone answers "what is available" without moving a megabyte,
    // which is what the page asks for first.
    if (wantMeta) {
      return NextResponse.json({
        runDate: meta.run_date,
        bytes: meta.bytes,
        header: JSON.parse(meta.header),
      });
    }

    const chunkRes = await rawClient.execute({
      sql: `SELECT chunk FROM perp_explorer_panel
            WHERE run_date = ? AND horizon = ?
            ORDER BY chunk_index ASC`,
      args: [meta.run_date, horizon] as never[],
    });

    const parts = chunkRes.rows.map((r) => {
      const c = (r as unknown as { chunk: ArrayBuffer | Uint8Array }).chunk;
      return c instanceof Uint8Array ? c : new Uint8Array(c);
    });

    const total = parts.reduce((a, p) => a + p.length, 0);
    if (total !== meta.bytes) {
      // A short read here would decode as garbage rather than fail, so it is
      // checked: the header records the byte count the export actually wrote.
      logger.error("api/markets/combo-panel", "Chunk length mismatch", {
        expected: meta.bytes,
        got: total,
        runDate: meta.run_date,
      });
      return NextResponse.json({ error: "Stored panel is incomplete." }, { status: 500 });
    }

    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }

    return new NextResponse(out, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(total),
        "X-Panel-Run-Date": meta.run_date,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    logger.error("api/markets/combo-panel", "Failed to serve explorer panel", { error: err });
    return NextResponse.json({ error: "Failed to load panel." }, { status: 500 });
  }
}
