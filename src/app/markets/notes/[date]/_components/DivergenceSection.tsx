import type { StructuredFacts } from "@/lib/notes/types";
import { displayName } from "@/lib/notes/display-name";
import { spct, toneClass } from "../_lib/format";
import { DivergenceLollipop, sharedDomain } from "./charts";
import { Section, Ticker, TableWrap, Th, Absent, NoValue } from "./primitives";

/**
 * Names that closed against their own sector.
 *
 * The gap — distance from the sector's move, in percentage points — is the
 * figure the section exists for, and it was previously rendered as
 * parenthetical italics, which is the weakest emphasis available and inside
 * `prose` reads as editorial hedging. Here it is a column, and the connector in
 * the lollipop makes it a length as well as a number.
 */
export function DivergenceSection({ facts }: { facts: StructuredFacts }) {
  const sectors = facts.divergence?.value ?? [];
  const names = facts.companyNames ?? {};
  // One scale for every chart in the section — see `sharedDomain`.
  const domain = sharedDomain(
    sectors.map((d) => ({ sectorPct: d.sectorChangePct, names: d.names })),
  );

  return (
    <Section
      id="divergence"
      title="Within-sector divergence"
      fact={facts.divergence}
      intro="Constituents that closed against the direction of their own sector. Every chart below shares one scale, so bar lengths are comparable across sectors; the bar length is the gap against the sector's own move."
    >
      {sectors.length === 0 ? (
        <Absent fact={facts.divergence} quiet="No sector produced a divergence wide enough to qualify this session." missing="Within-sector divergence" />
      ) : (
        <div className="space-y-8">
          {sectors.map((d) => (
            <div key={d.etf}>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                {d.sectorName} <span className={`tabular-nums ${toneClass(d.sectorChangePct)}`}>{spct(d.sectorChangePct)}</span>{" "}
                <span className="font-normal text-gray-500">
                  — {d.names.length} name{d.names.length === 1 ? "" : "s"} closed{" "}
                  {d.direction === "down" ? "green in a red sector" : "red in a green sector"}
                </span>
              </h3>

              <DivergenceLollipop
                sectorLabel={d.sectorName}
                sectorPct={d.sectorChangePct}
                names={d.names.map((n) => ({ ticker: n.ticker, changePct: n.changePct }))}
                domain={domain}
              />

              <TableWrap>
                <table className="w-full min-w-[30rem] mt-2">
                  <caption className="sr-only">
                    {d.sectorName} constituents diverging from the sector move of {spct(d.sectorChangePct)}.
                  </caption>
                  <thead>
                    <tr className="border-b border-gray-200">
                      <Th>Ticker</Th>
                      <Th>Company</Th>
                      <Th align="right">Today</Th>
                      <Th align="right">Gap vs sector</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {d.names.map((n) => (
                      <tr key={n.ticker} className="hover:bg-gray-50">
                        <th scope="row" className="px-3 py-2 text-left">
                          <Ticker symbol={n.ticker} />
                        </th>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {displayName(n.name ?? names[n.ticker]) ?? (
                            <NoValue reason="No company name in the holdings file" />
                          )}
                        </td>
                        <td className={`px-3 py-2 text-sm text-right font-medium tabular-nums ${toneClass(n.changePct)}`}>
                          {spct(n.changePct)}
                        </td>
                        <td className={`px-3 py-2 text-sm text-right tabular-nums ${toneClass(n.gap)}`}>
                          {spct(n.gap)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
