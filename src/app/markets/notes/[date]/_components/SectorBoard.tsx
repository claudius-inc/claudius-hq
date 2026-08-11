import type { StructuredFacts } from "@/lib/notes/types";
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
 */
export function SectorBoard({ facts }: { facts: StructuredFacts }) {
  const sectors = facts.sectors?.value;
  const tf = new Map((facts.timeframes?.value ?? []).map((t) => [t.symbol, t]));

  return (
    <Section
      id="sectors"
      title="Sector board"
      fact={facts.sectors}
      intro="Every S&P sector SPDR, ranked by today's close. The 21-session column is where a one-day move either fits a trend or breaks one."
    >
      {!sectors?.length ? (
        <Absent fact={facts.sectors} quiet="No sector closes were returned for this session." missing="The sector board" />
      ) : (
        (() => {
          const rows = [...sectors].sort((a, b) => b.changePct - a.changePct);
          const maxAbs = Math.max(...rows.map((r) => Math.abs(r.changePct)));

          // The table is sorted by TODAY, so the 21-session extremes are never
          // adjacent and the reader has to scan a column to find them. The old
          // push called them out in a sentence; keeping that reading costs one
          // line and it is the one that says what the month looked like.
          const withRun = rows
            .map((s) => ({ s, run: tf.get(s.etf)?.chg21s }))
            .filter((x): x is { s: (typeof rows)[number]; run: number } => x.run != null)
            .sort((a, b) => b.run - a.run);
          const best = withRun[0];
          const worst = withRun[withRun.length - 1];

          return (
            <TableWrap>
              <table className="w-full min-w-[34rem]">
                <caption className="sr-only">
                  Sector performance for this session, with 5- and 21-session context.
                </caption>
                <thead>
                  <tr className="border-b border-gray-200">
                    <Th>Sector</Th>
                    <Th>ETF</Th>
                    <Th align="right">Today</Th>
                    <Th><span className="sr-only">Today, as a bar</span></Th>
                    <Th align="right">5-session</Th>
                    <Th align="right">21-session</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((s) => {
                    const t = tf.get(s.etf);
                    return (
                      <tr key={s.etf} className="hover:bg-gray-50">
                        <th scope="row" className="px-3 py-2 text-sm font-medium text-gray-900 text-left">
                          {s.name}
                        </th>
                        <td className="px-3 py-2">
                          <Ticker symbol={s.etf} />
                        </td>
                        <td className={`px-3 py-2 text-sm text-right font-medium tabular-nums ${toneClass(s.changePct)}`}>
                          {spct(s.changePct)}
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
              {best && worst && best.s.etf !== worst.s.etf && (
                <p className="mt-2 text-sm text-gray-600">
                  Over 21 sessions {best.s.name} leads{" "}
                  <span className={`tabular-nums ${toneClass(best.run)}`}>{spct(best.run)}</span> and{" "}
                  {worst.s.name} lags{" "}
                  <span className={`tabular-nums ${toneClass(worst.run)}`}>{spct(worst.run)}</span>.
                </p>
              )}
            </TableWrap>
          );
        })()
      )}
    </Section>
  );
}
