import type { StructuredFacts, NoteProse } from "@/lib/notes/types";
import { intFmt } from "../_lib/format";

/**
 * Tier 2 — the reasoning.
 *
 * Everything here is LLM prose that cleared the numeral validator, so it is the
 * only part of the page that is not a rendered fact. It reads at a comfortable
 * measure (~62 characters) rather than at table width, and Bull/Bear sit side
 * by side so their opposition is structural rather than merely asserted.
 *
 * The prose half disappears when a note shipped without it. That is not a
 * failure state worth announcing — the deterministic note is the designed
 * fallback (see `writeProse`), and an empty "What matters" heading would be
 * worse than no heading.
 */

/**
 * The model writes "Short claim. Evidence." — the same shape the push bolds a
 * lead sentence for. Splitting it here gives each bullet an entry point the eye
 * can catch instead of a four-line grey block.
 */
function splitClaim(text: string): [string, string] | null {
  const m = text.match(/^([\s\S]{0,80}?[.!?])\s+([\s\S]+)$/);
  return m ? [m[1], m[2]] : null;
}

function Claim({ text }: { text: string }) {
  const parts = splitClaim(text);
  if (!parts) return <p className="text-sm text-gray-900 leading-relaxed">{text}</p>;
  return (
    <p className="text-sm text-gray-600 leading-relaxed">
      <span className="font-semibold text-gray-900">{parts[0]}</span> {parts[1]}
    </p>
  );
}

export function TheRead({ facts, prose }: { facts: StructuredFacts; prose: NoteProse | null }) {
  const pin = facts.gexPin?.value;
  // The gamma pin is a deterministic FACT, not prose. Gating the whole tier on
  // `prose` dropped it from every note the model did not write — which is
  // exactly the note that has least to say and can least afford to lose a
  // section it earned.
  if (!prose && !pin) return null;

  const hasBullBear = Boolean(prose?.bull || prose?.bear);

  return (
    <section id="read" className="scroll-mt-24 space-y-6">
      <h2 className="sr-only">The read</h2>

      {(prose?.whatMatters.length ?? 0) > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">
            What matters
          </h3>
          <div className="space-y-3 max-w-[62ch]">
            {prose?.whatMatters.map((x) => (
              <Claim key={x} text={x} />
            ))}
          </div>
        </div>
      )}

      {hasBullBear && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {prose?.bull && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-emerald-700 mb-1.5">
                Bull
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">{prose.bull}</p>
            </div>
          )}
          {prose?.bear && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-red-700 mb-1.5">
                Bear
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">{prose.bear}</p>
            </div>
          )}
        </div>
      )}

      {(pin || prose?.book) && (
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">
            The book
          </h3>
          <div className="space-y-2 max-w-[62ch]">
            {pin && (
              <p className="text-sm text-gray-600 leading-relaxed">
                Dealers are net {pin.netGammaPositive ? "long" : "short"} gamma, with a pin near{" "}
                <span className="tabular-nums font-medium text-gray-900">${intFmt(pin.pinStrike)}</span> on{" "}
                <span className="font-mono text-[0.8125rem]">{pin.symbol}</span> —{" "}
                {/* Direction from the two prices, not from the sign convention of
                    distancePct: which side the pin sits on is the whole
                    actionable content. */}
                <span className="tabular-nums">{Math.abs(pin.distancePct).toFixed(1)}%</span>{" "}
                {pin.pinStrike >= pin.spot ? "above" : "below"} spot (
                <span className="tabular-nums">${pin.spot.toFixed(2)}</span>), aggregated across{" "}
                {pin.expiriesUsed} expiration{pin.expiriesUsed === 1 ? "" : "s"}.
              </p>
            )}
            {prose?.book && <p className="text-sm text-gray-600 leading-relaxed">{prose.book}</p>}
            {pin && (
              <p className="text-[11px] text-gray-500">
                Built from start-of-day open interest, so intraday positioning changes are not reflected.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
