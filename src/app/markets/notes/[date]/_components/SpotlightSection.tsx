import type { StructuredFacts } from "@/lib/notes/types";
import { spct, intFmt, toneClass } from "../_lib/format";
import { DivergenceLollipop, sharedDomain } from "./charts";
import { Section, Ticker, TableWrap, Th, Absent } from "./primitives";

/**
 * The sectors the reader has chosen to follow, in depth.
 *
 * The push omits the sector's own percentage from this callout on the grounds
 * that the sector tape printed it two lines up. On a web page those are
 * different blocks fifty lines apart, which is how "laggard KMI +1.8%" came to
 * stand as a self-contradictory clause — it only parses once you know Energy
 * closed +4.7%. The headline move now sits on the same line as its
 * constituents, and the constituents are drawn against it, because a "laggard"
 * is structurally the same object as a divergent name.
 *
 * The table is not decoration. The chart plots the GAP against the sector while
 * the reader also wants the absolute move, and the two disagree in both
 * magnitude and sign — KMI closed +1.8% but 2.9 points behind Energy. Showing
 * one number in a chart and the other in an unlabelled list put the same ticker
 * on screen twice, in opposite colours, with nothing to say why. Both figures
 * now sit in named columns.
 */
export function SpotlightSection({ facts }: { facts: StructuredFacts }) {
  const blocks = facts.spotlight?.value ?? [];

  return (
    <Section
      id="spotlight"
      title="Spotlight"
      fact={facts.spotlight}
      intro="Sectors flagged for a closer look, with their leaders and laggards measured against the sector itself."
    >
      {blocks.length === 0 ? (
        <Absent fact={facts.spotlight} quiet="No sectors are currently spotlighted." missing="The spotlight" />
      ) : (
        <div className="space-y-8">
          {blocks.map((s) => {
            const constituents = [
              ...s.leaders.map((n) => ({ ...n, role: "Leader" as const })),
              ...s.laggards.map((n) => ({ ...n, role: "Laggard" as const })),
              ...(s.proxy ? [{ ...s.proxy, role: "Proxy" as const }] : []),
            ];
            // The proxy is a related instrument, not a constituent, so it is
            // never measured as a gap against the sector.
            const plotted = constituents.filter((n) => n.role !== "Proxy");
            const domain =
              s.headlinePct != null
                ? sharedDomain([{ sectorPct: s.headlinePct, names: plotted }])
                : null;

            return (
              <div key={s.key}>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  {s.label}
                  {s.headlinePct != null && (
                    <>
                      {" "}
                      <span className={`tabular-nums ${toneClass(s.headlinePct)}`}>
                        {spct(s.headlinePct)}
                      </span>
                    </>
                  )}
                  {s.price != null && (
                    <span className="font-normal text-gray-500 tabular-nums"> &middot; ${intFmt(s.price)}</span>
                  )}
                </h3>

                {s.headlinePct != null && domain && plotted.length > 0 ? (
                  <DivergenceLollipop
                    sectorLabel={s.label}
                    sectorPct={s.headlinePct}
                    names={plotted.map((n) => ({ ticker: n.ticker, changePct: n.changePct }))}
                    domain={domain}
                  />
                ) : null}

                {constituents.length > 0 && (
                  <TableWrap>
                    <table className="w-full min-w-[26rem] mt-2">
                      <caption className="sr-only">
                        {s.label} leaders, laggards and proxy, with each name&apos;s move and its gap
                        against the sector.
                      </caption>
                      <thead>
                        <tr className="border-b border-gray-200">
                          <Th>Role</Th>
                          <Th>Ticker</Th>
                          <Th align="right">Today</Th>
                          <Th align="right">Gap vs sector</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {constituents.map((n) => {
                          const gap =
                            n.role === "Proxy" || s.headlinePct == null ? null : n.changePct - s.headlinePct;
                          return (
                            <tr key={`${n.role}-${n.ticker}`} className="hover:bg-gray-50">
                              <th scope="row" className="px-3 py-2 text-sm font-medium text-gray-900 text-left">
                                {n.role}
                              </th>
                              <td className="px-3 py-2">
                                <Ticker symbol={n.ticker} />
                              </td>
                              <td className={`px-3 py-2 text-sm text-right tabular-nums ${toneClass(n.changePct)}`}>
                                {spct(n.changePct)}
                              </td>
                              <td className={`px-3 py-2 text-sm text-right tabular-nums ${gap != null ? toneClass(gap) : "text-gray-500"}`}>
                                {gap != null ? spct(gap) : "not a constituent"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableWrap>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
