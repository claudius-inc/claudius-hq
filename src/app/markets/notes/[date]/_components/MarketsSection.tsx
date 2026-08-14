import type { StructuredFacts, CrossAssetPoint } from "@/lib/notes/types";
import { spct, sbp, intFmt, toneClass } from "../_lib/format";
import { RatesCurve } from "./charts";
import { Section, TableWrap, Th, Absent, NoValue } from "./primitives";

/**
 * Price formatting differs per instrument — copper trades in cents, BTC in tens
 * of thousands.
 *
 * Keyed by label with an explicit default, so a newly configured instrument
 * gets a sane general-purpose format rather than silently inheriting DXY's
 * one-decimal index style.
 *
 * Crude and BTC are quoted in full. Rounding crude to the dollar threw away the
 * cents that ARE the day's move on a quiet session, and "$63k" for bitcoin
 * cannot be reconciled against any other quote the reader holds — the point of
 * a level is that it can be checked, and a level rounded to the nearest
 * thousand cannot be. The push (`render.ts`) keeps the short forms: it is
 * character-capped and this page is not.
 */
function crossPrice(p: CrossAssetPoint): string {
  switch (p.label) {
    case "BTC":
      return `$${intFmt(p.price)}`;
    case "Gold":
      return `$${intFmt(p.price)}`;
    case "Crude":
    case "Copper":
      return `$${p.price.toFixed(2)}`;
    case "DXY":
      return p.price.toFixed(1);
    default:
      if (p.price >= 100) return `$${intFmt(p.price)}`;
      return `$${p.price.toFixed(2)}`;
  }
}

/**
 * What the row is actually quoting, where the label alone would mislead.
 *
 * "Gold" is the case that forced this. The feed is Yahoo's `GC=F`, which is not
 * spot and not the front month either — it resolves to the most-ACTIVE COMEX
 * contract, and gold's volume sits in the next even delivery month, which is
 * routinely three to five months out. On 2026-08-13 that was December at
 * 4,492.6 against 4,445 for the August contract: a 1.1% carry premium that a
 * reader comparing against a spot quote reads as a broken feed. Yahoo carries
 * no spot gold series at all (`XAUUSD=X` is delisted) and the dated near
 * contract has too few intraday bars to survive the 16:00 ET close-bar rule, so
 * the honest fix is to name the contract rather than to change the source.
 */
const QUOTE_NOTE: Record<string, string> = {
  Gold: "COMEX gold futures. Yahoo maps GC=F to the most-active contract, which is typically several months out, so it trades above spot by the cost of carry.",
  Crude: "WTI front-month futures on NYMEX.",
  Copper: "COMEX copper futures, in dollars per pound.",
  DXY: "ICE US Dollar Index — an index level, not a price.",
  BTC: "Bitcoin against the dollar, from Yahoo's composite feed. It trades 24/7, so its close is the 16:00 ET bar, not a session close.",
};

/**
 * Rates and cross-asset.
 *
 * The curve is drawn against yesterday's close, on a Y domain pinned to the
 * data plus a fixed margin — an autoscaled axis would render today's 6bp
 * parallel shift as a dramatic re-steepening, which is a chart that lies.
 *
 * Cross-asset gets a table and deliberately NOT a chart: the instruments are
 * quoted in mutually incomparable units — as configured today, an index level,
 * two dollar prices an order of magnitude apart, a cents-per-pound quote and a
 * five-figure crypto price — so no shared axis is honest, whatever the list
 * happens to hold. What it does get is an explicit change column, because the
 * previous rendering dropped the figure silently when the feed returned none —
 * and a bare level standing next to a peer that carries a change reads as
 * "unchanged", which is a claim the feed never made.
 */
export function MarketsSection({ facts }: { facts: StructuredFacts }) {
  const r = facts.rates?.value;
  const cross = facts.crossAsset?.value ?? [];

  return (
    <>
      <Section
        id="rates"
        title="Rates"
        fact={facts.rates}
        // No clock in this sentence: the ET print time is fixed but its local
        // reading is not, so a hard-coded figure would be wrong for most
        // readers and wrong twice a year for the rest.
        intro="Treasury constant-maturity yields against the prior close. Note these print half an hour before the equity close."
      >
        {!r ? (
          <Absent fact={facts.rates} quiet="No Treasury yields were published for this session." missing="Treasury yields" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            <RatesCurve
              today={[
                { tenor: "2Y", y: r.y2 },
                { tenor: "10Y", y: r.y10 },
                { tenor: "30Y", y: r.y30 },
              ]}
              prior={[
                { tenor: "2Y", y: r.y2 - r.chg2Bp / 100 },
                { tenor: "10Y", y: r.y10 - r.chg10Bp / 100 },
                { tenor: "30Y", y: r.y30 - r.chg30Bp / 100 },
              ]}
            />
            <TableWrap>
              <table className="w-full">
                <caption className="sr-only">Treasury yields and their change on the day.</caption>
                <thead>
                  <tr className="border-b border-gray-200">
                    <Th>Tenor</Th>
                    <Th align="right">Yield</Th>
                    <Th align="right">Change</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { tenor: "2Y", y: r.y2, chg: r.chg2Bp },
                    { tenor: "10Y", y: r.y10, chg: r.chg10Bp },
                    { tenor: "30Y", y: r.y30, chg: r.chg30Bp },
                  ].map((row) => (
                    <tr key={row.tenor} className="hover:bg-gray-50">
                      <th scope="row" className="px-3 py-2 text-sm font-medium text-gray-900 text-left">
                        {row.tenor}
                      </th>
                      <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-900">
                        {row.y.toFixed(2)}%
                      </td>
                      <td className={`px-3 py-2 text-sm text-right tabular-nums ${toneClass(row.chg)}`}>
                        {sbp(row.chg)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <th scope="row" className="px-3 py-2 text-sm font-medium text-gray-900 text-left">
                      2s10s
                    </th>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-900">
                      {sbp(r.spread2s10Bp)}
                    </td>
                    <td className={`px-3 py-2 text-sm text-right tabular-nums ${toneClass(r.spread2s10ChgBp)}`}>
                      {sbp(r.spread2s10ChgBp)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}
      </Section>

      <Section
        id="cross-asset"
        title="Cross-asset"
        fact={facts.crossAsset}
        intro="Each instrument trades in its own unit, so this is a table rather than a chart — no shared axis would be honest."
      >
        {cross.length === 0 ? (
          <Absent fact={facts.crossAsset} quiet="No cross-asset quotes were returned for this session." missing="Cross-asset quotes" />
        ) : (
          <TableWrap>
            <table className="w-full max-w-md">
              <caption className="sr-only">Cross-asset levels and change on the day.</caption>
              <thead>
                <tr className="border-b border-gray-200">
                  <Th>Instrument</Th>
                  <Th align="right">Level</Th>
                  <Th align="right">Change</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cross.map((p) => (
                  <tr key={p.label} className="hover:bg-gray-50">
                    {/* One line, not a stacked pair. The symbol is what makes
                        the level checkable, so it belongs beside the name at the
                        same size rather than under it as a footnote — and a
                        second line here set the row height for the whole
                        table. `title` alone is unreachable on touch and by
                        keyboard, so the detail is an aria-label too — the same
                        rule `NoValue` follows. */}
                    <th
                      scope="row"
                      className="px-3 py-2 text-sm font-medium text-gray-900 text-left whitespace-nowrap"
                      title={QUOTE_NOTE[p.label]}
                      aria-label={QUOTE_NOTE[p.label] ? `${p.label} — ${QUOTE_NOTE[p.label]}` : undefined}
                    >
                      {p.label}{" "}
                      <span className="font-mono text-[0.8125rem] font-normal text-gray-500">({p.symbol})</span>
                    </th>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-900">
                      {crossPrice(p)}
                    </td>
                    <td className={`px-3 py-2 text-sm text-right tabular-nums ${p.changePct != null ? toneClass(p.changePct) : ""}`}>
                      {p.changePct != null ? (
                        spct(p.changePct)
                      ) : (
                        <NoValue reason="The feed returned a level but no prior close, so the change is unknown — not zero" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>
    </>
  );
}
