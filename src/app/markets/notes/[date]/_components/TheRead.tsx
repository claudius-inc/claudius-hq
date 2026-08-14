import type { StructuredFacts, NoteProse } from "@/lib/notes/types";
import { gammaStance, stanceWord, pinNoun } from "@/lib/notes/gamma-stance";
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

/**
 * The pin restated on the index's own scale.
 *
 * The chain HAS to be SPY: Yahoo publishes `^SPX` expirations but every one of
 * them carries zero open interest, and open interest is the entire input to a
 * gamma calculation — so an index chain would produce a confidently empty
 * answer rather than a better one. What it does not have to be is the number
 * the reader is shown. SPY closed 772.49 against 7,748.50 on the index the same
 * afternoon, so a "pin near 775" is unreadable to anyone who thinks in index
 * points, which is most people who care where the pin is.
 *
 * The factor is the two closes we already hold, divided — not a constant 10.
 * SPY drifts against a tenth of the index by the dividends accrued since its
 * last distribution, which is a real fraction of a percent, and a pin is a
 * level claim.
 *
 * Rounded to 5 index points, because the converted figure is an equivalent and
 * not a strike: there is no SPX contract at 7,772.7, and printing that decimal
 * would dress a conversion up as an observation.
 */
function indexEquivalent(facts: StructuredFacts, spyLevel: number): number | null {
  const spx = facts.indices?.value.find((i) => i.symbol === "^GSPC")?.close;
  const spot = facts.gexPin?.value.spot;
  if (spx == null || spot == null || spot <= 0 || facts.gexPin?.value.symbol !== "SPY") return null;
  return Math.round((spyLevel * (spx / spot)) / 5) * 5;
}

export function TheRead({ facts, prose }: { facts: StructuredFacts; prose: NoteProse | null }) {
  const pin = facts.gexPin?.value;
  const stance = pin ? gammaStance(pin) : null;
  const pinOnIndex = pin ? indexEquivalent(facts, pin.pinStrike) : null;
  const spotOnIndex = pin ? indexEquivalent(facts, pin.spot) : null;
  const zeroOnIndex = pin?.zeroGamma != null ? indexEquivalent(facts, pin.zeroGamma) : null;
  // The overnight roll is decided on SPY STRIKES and only then converted. The
  // index factor is each day's own SPX/SPY ratio, so an index-scale comparison
  // can manufacture a roll out of dividend drift and 5-point rounding while the
  // strike itself never moved — which is precisely the false regime change this
  // line exists to report.
  const priorPinOnIndex = pin?.prior ? indexEquivalent(facts, pin.prior.pinStrike) : null;
  const pinRolled = pin?.prior != null && pin.prior.pinStrike !== pin.pinStrike;
  const stanceFlipped = pin?.prior != null && stance != null && !stance.legacy && pin.prior.dealerGammaSign !== stance.sign;
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
            {pin && stance && (
              <p className="text-sm text-gray-600 leading-relaxed">
                Dealers are net {stanceWord(stance)} gamma, with a {pinNoun(pin, stance)} near{" "}
                {/* The index equivalent LEADS where we can compute one. The
                    strike is the measured quantity and stays on the line, but
                    the reader's own frame is the index, and a level they have to
                    multiply by ten before it means anything is a level they will
                    not check. */}
                {pinOnIndex != null ? (
                  <>
                    <span className="tabular-nums font-medium text-gray-900">{intFmt(pinOnIndex)}</span> on the
                    index (the <span className="font-mono text-[0.8125rem]">{pin.symbol}</span> strike carrying it
                    is <span className="tabular-nums">${intFmt(pin.pinStrike)}</span>)
                  </>
                ) : (
                  <>
                    <span className="tabular-nums font-medium text-gray-900">${intFmt(pin.pinStrike)}</span> on{" "}
                    <span className="font-mono text-[0.8125rem]">{pin.symbol}</span>
                  </>
                )}{" "}
                {/* Direction from the two prices, not from the sign convention of
                    distancePct: which side the pin sits on is the whole
                    actionable content. */}
                — <span className="tabular-nums">{Math.abs(pin.distancePct).toFixed(1)}%</span>{" "}
                {pin.pinStrike >= pin.spot ? "above" : "below"} spot (
                <span className="tabular-nums">
                  {spotOnIndex != null ? intFmt(spotOnIndex) : `$${pin.spot.toFixed(2)}`}
                </span>
                ), aggregated across {pin.expiriesUsed} expiration{pin.expiriesUsed === 1 ? "" : "s"}.
              </p>
            )}

            {/* The regime boundary, and the more useful of the two levels: the
                pin says where price is held, this says where the holding stops.
                Absent means no crossing was DETECTED in the search band, which is
                not the same as none existing — so the line is simply omitted
                rather than reworded into a claim (§1a). */}
            {pin && stance && pin.zeroGamma != null && (
              <p className="text-sm text-gray-600 leading-relaxed">
                Total gamma turns {stance.sign === 1 ? "negative" : "positive"} near{" "}
                <span className="tabular-nums font-medium text-gray-900">
                  {zeroOnIndex != null ? intFmt(zeroOnIndex) : `$${pin.zeroGamma.toFixed(2)}`}
                </span>
                {zeroOnIndex != null ? " on the index" : ` on ${pin.symbol}`} — below that the same hedging that
                damps moves today starts to amplify them.
              </p>
            )}

            {/* The overnight change, which is the only genuine FLOW read these
                sources allow: a level says where the book sits, a change says
                where it moved. */}
            {pin?.prior && (pinRolled || stanceFlipped) && (
              <p className="text-sm text-gray-600 leading-relaxed">
                {stanceFlipped && <>The book flipped to {stanceWord(stance!)} gamma overnight. </>}
                {pinRolled && (
                  <>
                    The {pinNoun(pin, stance!)} rolled{" "}
                    {pin.pinStrike > pin.prior.pinStrike ? "up" : "down"} from{" "}
                    <span className="tabular-nums">
                      {priorPinOnIndex != null ? intFmt(priorPinOnIndex) : `$${intFmt(pin.prior.pinStrike)}`}
                    </span>{" "}
                    on {pin.prior.date}.
                  </>
                )}
              </p>
            )}

            {/* Adjacent to the claim, never in a footer — a reader lands on one
                day's page. The whole SECTION is scoped, not the sentence above:
                `render.ts` dropped any model book line that disagreed with the
                stored stance, so the prose beside it was selected to agree with
                the inverted sign. */}
            {stance?.legacy && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                This note&rsquo;s positioning read was written under an inverted dealer-side assumption. The
                corrected stance is the opposite of what this section states.
              </p>
            )}

            {prose?.book && <p className="text-sm text-gray-600 leading-relaxed">{prose.book}</p>}
            {pin && (
              <p className="text-[11px] text-gray-500">
                Measured on {pin.symbol} options — Yahoo publishes index expirations with no open interest at
                all, and open interest is the whole input.
                {pin.horizonDays != null
                  ? ` Every expiration inside ${pin.horizonDays} days is included, which always reaches the next monthly.`
                  : ""}
                {pinOnIndex != null
                  ? " Index levels are that day's own S&P close over its SPY close, rounded to 5 points."
                  : ""}{" "}
                Assumes dealers are long calls and short puts, the usual customer book — the trade-side data
                that would settle it is not free. Open interest is start-of-day, so this is where the book sat
                this morning, not where today&rsquo;s flow moved it.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
