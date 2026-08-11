import type { StructuredFacts } from "@/lib/notes/types";
import { displayName } from "@/lib/notes/display-name";
import { spct, spp } from "../_lib/format";
import { ConcentrationBars } from "./charts";
import { Section, Ticker, Absent } from "./primitives";

/**
 * Was the index move broad, or five names?
 *
 * This carries the note's single most decision-relevant structural claim, and
 * it used to be one sentence that failed three ways at once. "Top movers …
 * contributed -0.4% of the index's -0.1%" (a) stamped a percentage sign on
 * `topPoints`, which is percentage POINTS of index move, and phrased it as a
 * ratio; (b) invited arithmetic that does not close, because -0.44 + 0.40 is
 * the MODELLED -0.04, not the actual -0.06, and the residual was hidden; and
 * (c) called these names "top movers", colliding with the Movers section, which
 * on 2026-08-10 was a completely disjoint set.
 *
 * The unit now lives on the axis, the residual is stated, and the names are
 * called contributors — largest weight times return, which is what they are.
 */
/** True when two non-trivial figures point in opposite directions. */
function opposedSigns(a: number, b: number): boolean {
  return a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b);
}

export function ConcentrationSection({ facts }: { facts: StructuredFacts }) {
  const c = facts.contribution?.value;
  const names = facts.companyNames ?? {};

  return (
    <Section
      id="concentration"
      title="Index concentration"
      fact={facts.contribution}
      intro="How much of the S&P's move came from its few largest contributors, measured in percentage points of index move."
    >
      {!c ? (
        <Absent fact={facts.contribution} quiet="No contribution decomposition was produced for this session." missing="The contribution decomposition" />
      ) : (
        <div className="space-y-4">
          {/*
            The first two rows are COMPONENTS and the last two are TOTALS. The
            `rule` marks that boundary — without it the four bars read as one
            addable list, and a reader who sums all four gets nonsense.

            "Largest drags" vs "largest boosts": the contribution fact selects
            the top five by DIRECTION of the index move, not by magnitude, so on
            a down day these are the five names that took the most off. Calling
            them "top contributors" on such a day reads as "biggest names".
          */}
          <ConcentrationBars
            rows={[
              {
                label: `${c.topNames.length} largest ${c.actualPct >= 0 ? "boosts" : "drags"}`,
                points: c.topPoints,
                tone: "signed",
              },
              { label: "All other names", points: c.exTopPct, tone: "signed" },
              { label: "Modelled total", points: c.modelledPct, tone: "neutral", rule: true },
              { label: "Actual close", points: c.actualPct, tone: "neutral", outlined: true },
            ]}
          />

          <p className="text-sm text-gray-600 leading-relaxed max-w-[62ch]">
            The {c.topNames.length} largest {c.actualPct >= 0 ? "boosts" : "drags"}{" "}
            {c.topPoints >= 0 ? "added" : "took"}{" "}
            <span className="tabular-nums font-medium text-gray-900">{spp(c.topPoints)}</span>
            {c.topPoints >= 0 ? "" : " off the index"}; every other name{" "}
            {c.exTopPct >= 0 ? "added" : "took"}{" "}
            <span className="tabular-nums font-medium text-gray-900">{spp(c.exTopPct)}</span>. That models
            a <span className="tabular-nums">{spct(c.modelledPct, 2)}</span> close against an actual{" "}
            <span className="tabular-nums">{spct(c.actualPct, 2)}</span> —{" "}
            <span className="tabular-nums">{Math.abs(c.actualPct - c.modelledPct).toFixed(2)}pp</span> of
            tracking residual, inside the reconciliation gate.
            {c.flipsWithoutTop ? (
              <>
                {" "}
                <span className="font-semibold text-gray-900">
                  Without them the index changes direction entirely.
                </span>
              </>
            ) : (
              // The pipeline gates `flipsWithoutTop` on |modelled| >= 0.05pp, so
              // on a near-flat day the sign genuinely does invert without the
              // flag being set. Saying so is honest; saying it as loudly as the
              // gated case would not be.
              opposedSigns(c.exTopPct, c.actualPct) && (
                <>
                  {" "}
                  The rest of the index was net {c.exTopPct >= 0 ? "positive" : "negative"}, so the
                  direction of the close belongs to this group — though on a move this small the
                  distinction is close to rounding.
                </>
              )
            )}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs uppercase tracking-wide text-gray-500">Contributors</span>
            {c.topNames.map((t) => (
              <span key={t} className="inline-flex items-baseline gap-1.5">
                <Ticker symbol={t} />
                <span className="text-xs text-gray-500">{displayName(names[t]) ?? ""}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
