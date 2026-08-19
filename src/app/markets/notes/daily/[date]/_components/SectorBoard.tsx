import type { StructuredFacts, SectorPoint } from "@/lib/notes/types";
import { LocalTime } from "@/components/ui/LocalTime";
import { spct, toneClass } from "../_lib/format";
import { DivergingBar } from "./charts";
import { Section, Ticker, TableWrap, Th, Absent, NoValue } from "./primitives";

/**
 * All eleven sectors, biggest move first, with the 5- and 21-session columns
 * the fact set already carries and nothing on the page used.
 *
 * The bar is what the list of `<li>` items could not do: on a day like
 * 2026-08-10 the board has exactly one real outlier (Energy +4.7%, seven times
 * the next-largest move) and eleven typographically identical rows hid it
 * completely. The bar is scaled against the largest absolute move in the
 * column, so the shape of the day is legible before any number is read.
 *
 * `facts.thematics` rides in the same ranking — the comparison IS the point,
 * since a semis run against a flat Technology print is only visible when the
 * two sit in one sorted column. They are marked, because they are not sectors:
 * their members are already counted inside the sector above them, so reading a
 * thematic row as an eleven-way share of the market would double-count it.
 */

/**
 * The two frozen identity columns.
 *
 * `left-[9.5rem]` only lines up because the sector column is pinned to that
 * exact width — the two constants move together. 9.5rem is set by the longest
 * label at `text-sm` plus the cell's own `px-3`: at 8.5rem "Consumer Staples"
 * wrapped to two lines and took its row's height with it. An explicit width
 * also stops auto table layout from handing this column the slack it
 * distributes on a wide screen, which would open a gap under the ETF.
 *
 * `bg-white` is load-bearing rather than cosmetic: a transparent sticky cell
 * lets the scrolled columns slide visibly beneath the text.
 */
const SECTOR_COL = "sticky left-0 w-[9.5rem] min-w-[9.5rem] bg-white";
const ETF_COL = "sticky left-[9.5rem] bg-white border-r border-gray-200";
/**
 * Covers `TableWrap`'s own `px-4` gutter, which lies outside the scrollport's
 * content edge — the columns scrolling underneath stay visible in it otherwise.
 * Only the LEFTMOST pinned column gets it: the same strip on the ETF cell would
 * paint over the last 1rem of the sector name sitting to its left.
 */
const GUTTER_MASK =
  "before:absolute before:inset-y-0 before:right-full before:w-4 before:bg-inherit sm:before:hidden";

export function SectorBoard({ facts }: { facts: StructuredFacts }) {
  const sectors = facts.sectors?.value;
  const thematics = facts.thematics?.value ?? [];
  const tf = new Map((facts.timeframes?.value ?? []).map((t) => [t.symbol, t]));

  return (
    <Section
      id="sectors"
      title="Sector board"
      fact={facts.sectors}
      intro={
        thematics.length > 0
          ? "Every S&P sector SPDR, ranked by today's close. The 21-session column is where a one-day move either fits a trend or breaks one. Marked rows are industry groups, not sectors — they sit inside one of the sectors above and are counted there too."
          : "Every S&P sector SPDR, ranked by today's close. The 21-session column is where a one-day move either fits a trend or breaks one."
      }
    >
      {!sectors?.length ? (
        <Absent fact={facts.sectors} quiet="No sector closes were returned for this session." missing="The sector board" />
      ) : (
        (() => {
          const rows: { s: SectorPoint; thematic: boolean }[] = [
            ...sectors.map((s) => ({ s, thematic: false })),
            ...thematics.map((s) => ({ s, thematic: true })),
          ].sort((a, b) => b.s.changePct - a.s.changePct);
          const maxAbs = Math.max(...rows.map((r) => Math.abs(r.s.changePct)));

          // The table is sorted by TODAY, so the 21-session extremes are never
          // adjacent and the reader has to scan a column to find them. The old
          // push called them out in a sentence; keeping that reading costs one
          // line and it is the one that says what the month looked like.
          //
          // Sectors ONLY: "X leads over 21 sessions" is a statement about the
          // eleven-way partition of the market, and an industry group is not one
          // of the eleven.
          const withRun = sectors
            .map((s) => ({ s, run: tf.get(s.etf)?.chg21s }))
            .filter((x): x is { s: SectorPoint; run: number } => x.run != null)
            .sort((a, b) => b.run - a.run);
          const best = withRun[0];
          const worst = withRun[withRun.length - 1];

          return (
            <>
            <TableWrap hint="Scroll sideways for the 5- and 21-session columns.">
              <table className="w-full min-w-[42rem]">
                <caption className="sr-only">
                  Sector performance for this session, with 5- and 21-session context.
                </caption>
                <thead>
                  <tr className="border-b border-gray-200">
                    {/* A sticky cell forms a stacking context, which lifts its
                        background above the row's collapsed bottom border — so
                        the header rule has to be repeated on the pinned cells or
                        it vanishes for exactly those two columns. */}
                    <Th className={`${SECTOR_COL} ${GUTTER_MASK} z-20 border-b border-gray-200`}>Sector</Th>
                    <Th className={`${ETF_COL} z-20 border-b`}>ETF</Th>
                    <Th align="right">Today</Th>
                    <Th align="right">Price</Th>
                    <Th><span className="sr-only">Today, as a bar</span></Th>
                    <Th align="right">5-session</Th>
                    <Th align="right">21-session</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(({ s, thematic }) => {
                    const t = tf.get(s.etf);
                    return (
                      // `group` so the pinned cells can repeat the row hover:
                      // they paint their own opaque background to stay readable
                      // over the scrolled columns, and would otherwise be the
                      // two cells in the row that ignore the highlight.
                      <tr key={s.etf} className="group hover:bg-gray-50">
                        <th
                          scope="row"
                          className={`${SECTOR_COL} ${GUTTER_MASK} z-10 group-hover:bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900 text-left`}
                        >
                          {s.name}
                          {/* The marker is a word, not a colour or a glyph: it
                              has to survive a screen reader and a greyscale
                              print, and "industry" is the whole caveat. */}
                          {thematic && (
                            <span
                              className="block text-[11px] font-normal text-gray-500"
                              title="An industry group, not a GICS sector — its members are already counted inside one of the sectors above."
                            >
                              {/* Its own provenance, because it has its own
                                  fact. Every other row on this board inherits
                                  the sector fact's source line in the section
                                  header; a thematic comes from a SEPARATE feed
                                  with a separate as-of, and was the one row on
                                  the page with no source attached anywhere. */}
                              industry
                              {facts.thematics && (
                                <>
                                  {" · "}
                                  {facts.thematics.source}{" "}
                                  <LocalTime iso={facts.thematics.asOf} />
                                </>
                              )}
                            </span>
                          )}
                        </th>
                        <td
                          className={`${ETF_COL} z-10 group-hover:bg-gray-50 px-3 py-2`}
                        >
                          <Ticker symbol={s.etf} />
                        </td>
                        <td className={`px-3 py-2 text-sm text-right font-medium tabular-nums ${toneClass(s.changePct)}`}>
                          {spct(s.changePct)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-900">
                          {s.price != null ? `$${s.price.toFixed(2)}` : <NoValue reason="No close returned for this ETF" />}
                        </td>
                        <td className="px-3 py-2 w-[88px]">
                          <DivergingBar value={s.changePct} max={maxAbs} />
                        </td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-600">
                          {t?.chg5s != null ? spct(t.chg5s) : <NoValue reason="Split or data defect — figure withheld" />}
                        </td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-600">
                          {t?.chg21s != null ? spct(t.chg21s) : <NoValue reason="Split or data defect — figure withheld" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            {/* OUTSIDE the table shell. `TableWrap` puts its children in the
                scrollport, so a paragraph placed inside slides sideways with
                the columns — this sentence read "and Utilities" once the
                reader had scrolled to the 21-session figures it describes. */}
            {best && worst && best.s.etf !== worst.s.etf && (
              <p className="mt-2 text-sm text-gray-600">
                Over 21 sessions {best.s.name} leads{" "}
                <span className={`tabular-nums ${toneClass(best.run)}`}>{spct(best.run)}</span> and{" "}
                {worst.s.name} lags{" "}
                <span className={`tabular-nums ${toneClass(worst.run)}`}>{spct(worst.run)}</span>.
              </p>
            )}
            </>
          );
        })()
      )}
    </Section>
  );
}
