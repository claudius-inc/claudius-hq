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
 * one-decimal index style. The magnitude fallback is chosen so a four-figure
 * price never prints as "4447.0".
 */
function crossPrice(p: CrossAssetPoint): string {
  switch (p.label) {
    case "BTC":
      return `$${Math.round(p.price / 1000)}k`;
    case "Gold":
    case "Crude":
      return `$${intFmt(p.price)}`;
    case "Copper":
      return `$${p.price.toFixed(2)}`;
    case "DXY":
      return p.price.toFixed(1);
    default:
      if (p.price >= 10000) return `$${Math.round(p.price / 1000)}k`;
      if (p.price >= 100) return `$${intFmt(p.price)}`;
      return `$${p.price.toFixed(2)}`;
  }
}

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
                    <th scope="row" className="px-3 py-2 text-sm font-medium text-gray-900 text-left">
                      {p.label}
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
