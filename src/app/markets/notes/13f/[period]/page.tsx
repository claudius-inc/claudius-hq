import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { Section, Absent } from "../../[date]/_components/primitives";
import { prettyDate } from "../../[date]/_lib/format";
import { getPeriod, THIRTEEN_F_PERIODS } from "@/lib/notes/thirteenf/periods";
import { SECTION_ORDER } from "@/lib/notes/thirteenf/types";
import {
  FlowChart,
  ConvictionChart,
  BookChangeChart,
  ConcentrationChart,
  SectorChart,
} from "./_components/charts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function generateStaticParams() {
  return THIRTEEN_F_PERIODS.map((p) => ({ period: p.periodEnd }));
}

export async function generateMetadata(props: {
  params: Promise<{ period: string }>;
}): Promise<Metadata> {
  const { period } = await props.params;
  if (!DATE_RE.test(period) || !getPeriod(period)) return { title: "Filing not found" };
  return {
    title: `The Filing — quarter ending ${prettyDate(period)}`,
    description: "What the largest institutional managers bought and sold, from their 13F filings.",
  };
}

/**
 * The quarterly 13F note ("The Filing").
 *
 * The page maps over `SECTION_ORDER` rather than laying sections out by hand, so
 * the format is a single declaration and a later quarter cannot quietly reorder
 * or drop a section. A section whose data is `null` renders `Absent` rather than
 * disappearing: on an archived note, a silently missing section reads as "the
 * market was quiet" when it may mean the source failed, and those are opposite
 * conclusions.
 */
export default async function ThirteenFPage(props: { params: Promise<{ period: string }> }) {
  const { period } = await props.params;
  if (!DATE_RE.test(period)) notFound();
  const facts = getPeriod(period);
  if (!facts) notFound();

  const { coverage } = facts;
  const bookB = (coverage.combinedBookUsd / 1e12).toFixed(2);

  const body: Record<(typeof SECTION_ORDER)[number]["id"], React.ReactNode> = {
    flows:
      facts.topBought && facts.topSold ? (
        <FlowChart bought={facts.topBought.value} sold={facts.topSold.value} />
      ) : (
        <Absent fact={facts.topBought} quiet="No name crossed the reporting threshold." missing="Name-level flow" />
      ),
    conviction: facts.conviction ? (
      <ConvictionChart moves={facts.conviction.value} />
    ) : (
      <Absent fact={facts.conviction} quiet="No manager materially changed a position's weight." missing="Position weights" />
    ),
    books: facts.bookChanges ? (
      <BookChangeChart changes={facts.bookChanges.value} />
    ) : (
      <Absent fact={facts.bookChanges} quiet="No book changed materially." missing="Book changes" />
    ),
    concentration: facts.concentration ? (
      <ConcentrationChart rows={facts.concentration.value} />
    ) : (
      <Absent fact={facts.concentration} quiet="Concentration was unchanged." missing="Concentration" />
    ),
    sectors: facts.sectors ? (
      <SectorChart shifts={facts.sectors.value} />
    ) : (
      <Absent fact={facts.sectors} quiet="No sector's weight moved materially." missing="Sector rotation" />
    ),
  };

  const factFor = {
    flows: facts.topBought,
    conviction: facts.conviction,
    books: facts.bookChanges,
    concentration: facts.concentration,
    sectors: facts.sectors,
  } as const;

  const intro: Record<(typeof SECTION_ORDER)[number]["id"], string> = {
    flows:
      "Net dollars traded in each name, summed across the managers covered. A net figure on its own reads as agreement, so every row carries how many managers bought, how many sold, and whether one of them is the whole number.",
    conviction:
      "How much of a manager's own book one position accounted for, before and after. Weights rather than dollars, so a $3B fund and a $263B fund can be read on the same scale.",
    books:
      "A book can shrink because a manager sold, or because prices fell on what they kept. Those mean opposite things, and a 13F shows only the stock side — a sale leaves the form rather than moving to a cash column.",
    concentration:
      "Counting each manager's holdings from the largest down until half the book is reached. It separates the managers whose filings are opinions from the ones whose filings are inventories.",
    sectors:
      "The combined book's sector weights, this quarter against last. Covers the share of holdings that map to a GICS sector.",
  };

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <PageHero
        title="The Filing"
        // The comparison is stated, never assumed: every figure on this page is
        // a difference between two quarters, and the wrong baseline is wrong in
        // a way no reader can detect.
        subtitle={`13F quarterly · quarter ending ${prettyDate(facts.periodEnd)}, against ${prettyDate(facts.priorPeriodEnd)} · ${coverage.managers} managers · $${bookB}T combined`}
      />

      <p className="text-sm text-gray-600 max-w-[68ch] mb-8">
        Positions are as filed for the quarter end and may have changed since — a 13F is due 45 days
        after the quarter closes, and reports only US-listed long equity. It carries no cash, no
        bonds, no holdings outside the US and no short positions.
      </p>

      <div className="space-y-12">
        {SECTION_ORDER.map((s) => (
          <Section key={s.id} id={s.id} title={s.title} fact={factFor[s.id]} intro={intro[s.id]}>
            {body[s.id]}
          </Section>
        ))}
      </div>

      <footer className="mt-14 pt-6 border-t border-gray-200 space-y-3">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-gray-500">Coverage</h2>
        <p className="text-xs text-gray-600 max-w-[68ch]">
          {coverage.managers} managers filed a complete 13F-HR for both {prettyDate(facts.priorPeriodEnd)} and{" "}
          {prettyDate(facts.periodEnd)}. Combined equity book ${bookB}T at the period end.{" "}
          {Math.round(coverage.sectorMapped * 100)}% of that book maps to a GICS sector, which is the
          share the rotation figures cover. Dollar flows are share-count changes priced at the
          period-end mark, not changes in reported value.
        </p>
        {coverage.excluded.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Excluded from the universe</p>
            <ul className="space-y-1">
              {coverage.excluded.map((e) => (
                <li key={e.manager} className="text-xs text-gray-600 max-w-[68ch]">
                  <span className="font-medium text-gray-700">{e.manager}</span> — {e.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-gray-500">
          Source: SEC EDGAR 13F-HR information tables. Sector mapping from the Select Sector SPDR
          holdings files.
        </p>
      </footer>
    </div>
  );
}
