import type { StructuredFacts, NoteProse, CrossAssetPoint, SpotlightBlock } from "@/lib/notes/types";
import { spct, intFmt, toneClass, shortDate } from "../_lib/format";
import { RatesCurve } from "./charts";
import { Section, TableWrap, Th, Absent, NoValue } from "./primitives";

/**
 * Which spotlight block proxies which cross-asset row.
 *
 * Keyed by the cross-asset LABEL, valued by the spotlight key. Only GOLD needs
 * it today: it is the one pseudo-sector, driven off a cross-asset print plus a
 * miners proxy rather than off a sector SPDR, so its whole spotlight block was
 * this row plus one extra ticker.
 */
const PROXY_KEY: Record<string, string> = { Gold: "GOLD" };

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
export function MarketsSection({ facts, prose }: { facts: StructuredFacts; prose: NoteProse | null }) {
  const r = facts.rates?.value;
  const cross = facts.crossAsset?.value ?? [];
  const tf = new Map((facts.timeframes?.value ?? []).map((t) => [t.symbol, t]));
  // A proxy introduced by a spotlight block belongs on the row it proxies, not
  // in a section of its own — see the fold-in note on the table below.
  const proxies = new Map(
    (facts.spotlight?.value ?? [])
      .filter((s) => s.proxy != null)
      .map((s) => [s.key, s.proxy as NonNullable<SpotlightBlock["proxy"]>]),
  );

  return (
    <>
      <Section
        id="rates"
        title="Rates"
        fact={facts.rates}
        // No clock in this sentence: the ET print time is fixed but its local
        // reading is not, so a hard-coded figure would be wrong for most
        // readers and wrong twice a year for the rest.
        intro="Treasury constant-maturity yields against the prior close. The levels and their changes sit in the scoreboard above; this is the shape."
      >
        {!r ? (
          <Absent fact={facts.rates} quiet="No Treasury yields were published for this session." missing="Treasury yields" />
        ) : (
          /*
            The table is GONE, and the curve is what is left.
            It printed 2Y/10Y/30Y with their bp changes — the same six figures
            the scoreboard shows one screen above, in the same two columns. The
            chart is not a duplicate of those figures: it is the only thing on
            the page that shows the curve's SHAPE against the prior close, which
            no arrangement of tiles can. 2s10s moved up to the scoreboard with
            the tenors, so the whole rates read now lives in one place.
          */
          <div className="space-y-3">
            {/* The 2Y point is dropped on a provisional Yahoo print — the curve
                is drawn from the tenors actually quoted (10Y/30Y then). Both
                series share ONE guard so today and prior always carry the same
                tenors: a mismatch would map 10Y onto the 2Y x-slot. */}
            <RatesCurve
              today={[
                ...(r.y2 != null && r.chg2Bp != null ? [{ tenor: "2Y", y: r.y2 }] : []),
                { tenor: "10Y", y: r.y10 },
                { tenor: "30Y", y: r.y30 },
              ]}
              prior={[
                ...(r.y2 != null && r.chg2Bp != null ? [{ tenor: "2Y", y: r.y2 - r.chg2Bp / 100 }] : []),
                { tenor: "10Y", y: r.y10 - r.chg10Bp / 100 },
                { tenor: "30Y", y: r.y30 - r.chg30Bp / 100 },
              ]}
            />
            {r.provisional && (
              <p className="text-xs text-amber-700">
                Provisional 10Y/30Y from Yahoo — the US Treasury par curve had not published at
                send time. The full curve, including the 2Y and 2s10s, follows when it does.
              </p>
            )}
            {/*
              The model's one line on the curve, which until now shipped only to
              Telegram. It is written every night, it clears the numeral
              validator like every other field, it is persisted on the note — and
              the web page, the thing that keeps the archive, was the one reader
              that never saw it. This is its subject, so this is where it goes.
            */}
            {prose?.curveRead && (
              <p className="text-sm text-gray-600 leading-relaxed max-w-[62ch]">{prose.curveRead}</p>
            )}
          </div>
        )}
      </Section>

      <Section
        id="cross-asset"
        title="Cross-asset"
        fact={facts.crossAsset}
        intro="Each instrument trades in its own unit, so this is a table rather than a chart — no shared axis would be honest. The 5- and 21-session columns are where a one-day move either fits a trend or breaks one."
      >
        {cross.length === 0 ? (
          <Absent fact={facts.crossAsset} quiet="No cross-asset quotes were returned for this session." missing="Cross-asset quotes" />
        ) : (
          <TableWrap hint="Scroll sideways for the 5- and 21-session columns.">
            <table className="w-full min-w-[34rem]">
              <caption className="sr-only">
                Cross-asset levels, change on the day, and 5- and 21-session context.
              </caption>
              <thead>
                <tr className="border-b border-gray-200">
                  <Th>Instrument</Th>
                  <Th align="right">Level</Th>
                  <Th align="right">Today</Th>
                  <Th align="right">5-session</Th>
                  <Th align="right">21-session</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cross.map((p) => {
                  const t = tf.get(p.symbol);
                  const proxy = proxies.get(PROXY_KEY[p.label] ?? "");
                  // `timeframes` is fetched per symbol and a 24/7 instrument can
                  // settle its daily bar a session behind the equity close. Two
                  // windows printed in one column with no marker is a comparison
                  // nobody made — see the sub-line below.
                  const stale = t != null && t.asOfDate !== facts.date;
                  return (
                    <tr key={p.label} className="hover:bg-gray-50 align-top">
                      {/* One line, not a stacked pair. The symbol is what makes
                          the level checkable, so it belongs beside the name at the
                          same size rather than under it as a footnote. `title`
                          alone is unreachable on touch and by keyboard, so the
                          detail is an aria-label too — the same rule `NoValue`
                          follows. */}
                      <th
                        scope="row"
                        className="px-3 py-2 text-sm font-medium text-gray-900 text-left whitespace-nowrap"
                        title={QUOTE_NOTE[p.label]}
                        aria-label={QUOTE_NOTE[p.label] ? `${p.label} — ${QUOTE_NOTE[p.label]}` : undefined}
                      >
                        {p.label}{" "}
                        <span className="font-mono text-[0.8125rem] font-normal text-gray-500">
                          ({p.symbol})
                        </span>
                        {/*
                          The spotlight proxy, folded in. A "Spotlight — Gold"
                          block was a whole section, heading and table and empty
                          chart, that restated this row's level and change in
                          order to introduce exactly one new number: the miners.
                          It is one number, so it is one line, on the row it
                          qualifies.
                        */}
                        {proxy && (
                          <span className="block text-[11px] font-normal text-gray-500">
                            Miners <span className="font-mono">{proxy.ticker}</span>{" "}
                            <span className={`tabular-nums ${toneClass(proxy.changePct)}`}>
                              {spct(proxy.changePct)}
                            </span>
                          </span>
                        )}
                        {stale && (
                          <span className="block text-[11px] font-normal text-gray-500">
                            Run measured to {shortDate(t.asOfDate)}
                          </span>
                        )}
                      </th>
                      <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-900">
                        {crossPrice(p)}
                      </td>
                      <td
                        className={`px-3 py-2 text-sm text-right font-medium tabular-nums ${p.changePct != null ? toneClass(p.changePct) : ""}`}
                      >
                        {p.changePct != null ? (
                          spct(p.changePct)
                        ) : (
                          <NoValue reason="The feed returned a level but no prior close, so the change is unknown — not zero" />
                        )}
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
        )}
      </Section>
    </>
  );
}
