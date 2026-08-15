import type { StructuredFacts, SpotlightBlock, DivergenceSector } from "@/lib/notes/types";
import { displayName } from "@/lib/notes/display-name";
import { spct, toneClass } from "../_lib/format";
import { DivergenceLollipop, sharedDomain } from "./charts";
import { Section, Ticker, TickerTh, TableWrap, Th, Absent, NoValue } from "./primitives";

/**
 * One block per sector worth expanding — merged from what used to be two
 * sections.
 *
 * "Within-sector divergence" and "Spotlight" were separate, fifty lines apart,
 * and on any day a sector appeared in both they printed the same content twice.
 * On 2026-08-14 both opened by restating Energy +1.4% — the third and fourth
 * times the page had said it, after the sector board — both drew the same
 * lollipop in the same visual language on DIFFERENT scales, and VLO appeared in
 * each with an identical -0.36% and an identical -1.75pp gap, labelled "laggard"
 * in one and "diverging" in the other.
 *
 * They are the same object. A laggard IS a name measured against its sector, and
 * so is a divergent name; the only difference is which list admitted it. So the
 * two lists merge per sector, share one scale, and every name appears once.
 *
 * All three shapes still render:
 *  - spotlighted and divergent  → leaders, laggards and divergent names together
 *  - spotlighted, no divergence → leaders and laggards, as the spotlight always did
 *  - divergent, not spotlighted → the divergent names, as divergence always did
 *
 * The GOLD pseudo-sector is deliberately NOT here. It has no constituents, so
 * its block was a heading over a single proxy ticker plus a restatement of the
 * cross-asset row it came from; the proxy now sits on that row. See `PROXY_KEY`
 * in `MarketsSection`.
 */

/** A name in the merged block, with the list that admitted it. */
interface DepthName {
  ticker: string;
  name: string | null;
  changePct: number;
  gap: number;
  role: "Leader" | "Laggard" | "Diverging";
}

interface DepthBlock {
  key: string;
  label: string;
  sectorPct: number;
  names: DepthName[];
  /** Present only when the sector produced a qualifying divergence. */
  divergence: DivergenceSector | null;
}

/**
 * Merge the spotlight blocks and the divergence sectors into one list.
 *
 * Divergence wins on a collision: its `gap` is the stored, computed figure and
 * it carries a company name, where the spotlight's laggard entry carries only a
 * ticker and a move. Order follows the spotlight config first (it is the
 * reader's own chosen order) and then the divergence list.
 */
function buildBlocks(facts: StructuredFacts): DepthBlock[] {
  const spotlights = facts.spotlight?.value ?? [];
  const divergences = facts.divergence?.value ?? [];
  const byEtf = new Map(divergences.map((d) => [d.etf, d]));
  const names = facts.companyNames ?? {};

  // Only sector blocks — a pseudo-sector has no constituents to merge.
  const sectorSpotlights = spotlights.filter(
    (s): s is SpotlightBlock & { headlinePct: number } =>
      s.headlinePct != null && (s.leaders.length > 0 || s.laggards.length > 0),
  );

  const out: DepthBlock[] = [];
  const seen = new Set<string>();

  const merge = (
    key: string,
    label: string,
    sectorPct: number,
    spotlight: SpotlightBlock | null,
    divergence: DivergenceSector | null,
  ): DepthBlock => {
    const rows = new Map<string, DepthName>();
    for (const n of spotlight?.leaders ?? []) {
      rows.set(n.ticker, {
        ticker: n.ticker,
        name: names[n.ticker] ?? null,
        changePct: n.changePct,
        gap: n.changePct - sectorPct,
        role: "Leader",
      });
    }
    for (const n of spotlight?.laggards ?? []) {
      rows.set(n.ticker, {
        ticker: n.ticker,
        name: names[n.ticker] ?? null,
        changePct: n.changePct,
        gap: n.changePct - sectorPct,
        role: "Laggard",
      });
    }
    // Divergence overwrites: its gap is the stored figure, and it is the label
    // that carries the stronger claim — a name is only "diverging" if it cleared
    // the divergence gate, while "laggard" is just the bottom of a sorted list.
    for (const n of divergence?.names ?? []) {
      rows.set(n.ticker, {
        ticker: n.ticker,
        name: n.name ?? names[n.ticker] ?? null,
        changePct: n.changePct,
        gap: n.gap,
        role: "Diverging",
      });
    }
    // Biggest gap first in each direction — leaders down from the top, then the
    // names that fell short, so the block reads outward from the sector line.
    const ordered = Array.from(rows.values()).sort((a, b) => b.gap - a.gap);
    return { key, label, sectorPct, names: ordered, divergence };
  };

  for (const s of sectorSpotlights) {
    seen.add(s.key);
    out.push(merge(s.key, s.label, s.headlinePct, s, byEtf.get(s.key) ?? null));
  }
  for (const d of divergences) {
    if (seen.has(d.etf)) continue;
    out.push(merge(d.etf, d.sectorName, d.sectorChangePct, null, d));
  }
  return out.filter((b) => b.names.length > 0);
}

export function SectorDepthSection({ facts }: { facts: StructuredFacts }) {
  const blocks = buildBlocks(facts);

  // One scale across every block in the section, so a +5.4pp gap and a +2.7pp
  // gap never render as the same bar length — the section's own intro invites
  // exactly that comparison. Previously each section derived its own domain and
  // the two drew the same names at different scales.
  const domain = sharedDomain(blocks.map((b) => ({ sectorPct: b.sectorPct, names: b.names })));

  /*
    The section merges TWO facts, so it cites both.
    Crediting only the spotlight would understate it — the divergent names and
    their gaps come from the holdings join, which is a different feed with a
    different failure mode. The as-of is the older of the two, because a
    provenance line that quotes the fresher timestamp for a block containing
    both is a claim the older feed never made.
  */
  const contributing = [facts.spotlight, facts.divergence].filter(
    (f): f is NonNullable<typeof f> => f != null,
  );
  const anchorFact =
    contributing.length === 0
      ? null
      : {
          value: null,
          source: Array.from(new Set(contributing.map((f) => f.source))).join(" + "),
          asOf: contributing.map((f) => f.asOf).sort()[0],
        };

  return (
    <Section
      id="depth"
      title="Sectors in depth"
      fact={anchorFact}
      intro="Sectors flagged for a closer look, plus any sector wide enough apart to register a within-sector divergence. Leaders, laggards and divergent names are all measured against the sector itself — they are the same quantity — so they share one scale."
    >
      {blocks.length === 0 ? (
        <Absent
          fact={anchorFact}
          quiet="No sector is spotlighted, and none produced a divergence wide enough to qualify this session."
          missing="The sector deep-dive"
        />
      ) : (
        <div className="space-y-8">
          {blocks.map((b) => (
            <div key={b.key}>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                {b.label}{" "}
                <span className={`tabular-nums ${toneClass(b.sectorPct)}`}>{spct(b.sectorPct)}</span>{" "}
                <span className="font-normal text-gray-500">
                  <Ticker symbol={b.key} />
                  {b.divergence && (
                    <>
                      {" — "}
                      {b.divergence.names.length} name{b.divergence.names.length === 1 ? "" : "s"} closed{" "}
                      {b.divergence.direction === "down"
                        ? "green in a red sector"
                        : "red in a green sector"}
                    </>
                  )}
                </span>
              </h3>

              <DivergenceLollipop
                sectorLabel={b.label}
                sectorPct={b.sectorPct}
                names={b.names.map((n) => ({ ticker: n.ticker, changePct: n.changePct }))}
                domain={domain}
              />

              <TableWrap>
                <table className="w-full min-w-[32rem] mt-2">
                  <caption className="sr-only">
                    {b.label} leaders, laggards and divergent names, with each name&apos;s move and its gap
                    against the sector move of {spct(b.sectorPct)}.
                  </caption>
                  <thead>
                    <tr className="border-b border-gray-200">
                      <Th sticky>Ticker</Th>
                      <Th>Company</Th>
                      <Th>Role</Th>
                      <Th align="right">Today</Th>
                      <Th align="right">Gap vs sector</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {b.names.map((n) => (
                      <tr key={n.ticker} className="group hover:bg-gray-50">
                        <TickerTh symbol={n.ticker} />
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {displayName(n.name) ?? (
                            <NoValue reason="No company name in the holdings file" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">{n.role}</td>
                        <td
                          className={`px-3 py-2 text-sm text-right font-medium tabular-nums ${toneClass(n.changePct)}`}
                        >
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
