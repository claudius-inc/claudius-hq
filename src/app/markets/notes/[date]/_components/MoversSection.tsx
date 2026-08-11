import { Fragment } from "react";
import type { StructuredFacts } from "@/lib/notes/types";
import { toYahooSymbol } from "@/lib/notes/sources/daily-bars";
import { displayName } from "@/lib/notes/display-name";
import { spct, toneClass } from "../_lib/format";
import { DivergingBar, ReversalScatter } from "./charts";
import { Section, Ticker, TableWrap, Th, Absent, NoValue } from "./primitives";

/**
 * The day's ranked names, their session context, and — the point of the whole
 * attribution pipeline — why they moved.
 *
 * The push caps this at three names and drops the reason clauses first when it
 * runs out of room, both of which are correct for a 4096-character
 * notification. Neither applies here, and inheriting them cost the archive
 * page real content: on 2026-08-10 the one retrieved, dated, direction-checked
 * attribution in the fact set (NetApp, on a Morgan Stanley upgrade) belonged to
 * the 8th-ranked name and so never appeared at all.
 *
 * An empty Why cell is honest and is itself informative: it says the ladder
 * found no dated cause, not that nobody looked.
 */
export function MoversSection({ facts }: { facts: StructuredFacts }) {
  const movers = facts.movers?.value ?? [];
  const tf = new Map((facts.timeframes?.value ?? []).map((t) => [t.symbol, t]));
  const reasons = new Map((facts.attributions?.value ?? []).map((a) => [a.ticker, a.phrase]));
  const names = facts.companyNames ?? {};
  const postMarket = new Map((facts.postMarket?.value ?? []).map((p) => [p.ticker, p]));

  const rows = [...movers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const maxAbs = rows.length ? Math.max(...rows.map((r) => Math.abs(r.changePct))) : 0;

  const scatter = rows
    .map((m) => {
      const t = tf.get(toYahooSymbol(m.ticker));
      return t?.chg21s != null ? { ticker: m.ticker, today: m.changePct, run: t.chg21s } : null;
    })
    .filter((p): p is { ticker: string; today: number; run: number } => p !== null);

  return (
    <Section
      id="movers"
      title="Movers"
      fact={facts.movers}
      intro="The names the session's relevance ranking surfaced, ordered here by the size of today's move and shown against their own recent run. A reason appears only where one was retrieved, dated and direction-checked."
    >
      {rows.length === 0 ? (
        <Absent fact={facts.movers} quiet="No single name qualified as a mover this session." missing="The mover ranking" />
      ) : (
        <div className="space-y-6">
          {scatter.length >= 3 && (
            <div>
              <ReversalScatter points={scatter} />
              <p className="text-[11px] text-gray-500 mt-1 max-w-[62ch]">
                Names in the upper-left and lower-right quadrants moved against their own 21-session
                direction today.
              </p>
            </div>
          )}

          <TableWrap hint="Scroll the table sideways for session context.">
            {/*
              On a phone the Why column is hidden and repeated as a full-width
              sub-row instead. As a column it was both off-screen AND driving
              row height, so a name with a three-line reason rendered as one
              line of data followed by 76px of blank table — which reads as a
              rendering fault, not as content the reader has to scroll to.
            */}
            <table className="w-full min-w-[34rem] sm:min-w-[44rem]">
              <caption className="sr-only">
                Today&apos;s movers with 5- and 21-session context and, where retrieved, the reason for
                the move.
              </caption>
              <thead>
                <tr className="border-b border-gray-200">
                  <Th>Ticker</Th>
                  <Th>Company</Th>
                  <Th align="right">Today</Th>
                  <Th><span className="sr-only">Today, as a bar</span></Th>
                  <Th align="right">5-session</Th>
                  <Th align="right">21-session</Th>
                  <Th className="hidden sm:table-cell">Why</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((m) => {
                  const t = tf.get(toYahooSymbol(m.ticker));
                  const pm = postMarket.get(m.ticker);
                  const reason = reasons.get(m.ticker);
                  return (
                    <Fragment key={m.ticker}>
                    <tr className="hover:bg-gray-50 align-top">
                      <th scope="row" className="px-3 py-2 text-left">
                        <Ticker symbol={m.ticker} />
                      </th>
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {displayName(names[m.ticker]) ?? <NoValue reason="No company name in the holdings file" />}
                      </td>
                      <td className={`px-3 py-2 text-sm text-right font-medium tabular-nums ${toneClass(m.changePct)}`}>
                        {spct(m.changePct)}
                        {pm && (
                          <span className="block text-[11px] font-normal text-gray-500">
                            {spct(pm.changePct)} after hours, {pm.asOfEt} ET
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 w-[88px]">
                        <DivergingBar value={m.changePct} max={maxAbs} />
                      </td>
                      <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-600">
                        {t?.chg5s != null ? spct(t.chg5s) : <NoValue reason="Split or data defect — figure withheld" />}
                      </td>
                      <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-600">
                        {t?.chg21s != null ? spct(t.chg21s) : <NoValue reason="Split or data defect — figure withheld" />}
                      </td>
                      <td className="hidden sm:table-cell px-3 py-2 text-sm text-gray-600 max-w-[22rem]">
                        {reason ?? (
                          <span
                            className="text-gray-500"
                            title="No dated, direction-checked cause was retrieved"
                            aria-label="No dated, direction-checked cause was retrieved"
                            role="img"
                          >
                            &mdash;
                          </span>
                        )}
                      </td>
                    </tr>
                    {/* `!border-t-0` because tbody's `divide-y` selector outranks
                        a plain `border-t-0`; without it a rule is drawn between a
                        name and its own reason, tying the reason to the row below. */}
                    {reason && (
                      <tr className="sm:hidden !border-t-0">
                        <td colSpan={6} className="px-3 pb-2 text-xs text-gray-600">
                          {/*
                            The cell inherits the TABLE's width, not the
                            viewport's, so a long reason runs off the right edge
                            of a phone before it wraps — reintroducing the exact
                            defect this sub-row exists to avoid. Today's 43-char
                            phrase fits by luck; the earnings-rung phrases are
                            routinely twice that.
                          */}
                          <div className="max-w-[calc(100vw-3rem)] sm:max-w-none">{reason}</div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}
    </Section>
  );
}
