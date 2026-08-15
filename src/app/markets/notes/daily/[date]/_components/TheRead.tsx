import type { StructuredFacts, NoteProse } from "@/lib/notes/types";
import { gammaStance, stanceWord, pinNoun } from "@/lib/notes/gamma-stance";
import { checkDirection, indexChangePct } from "@/lib/notes/validate";
import { intFmt, spct, toneClass } from "../_lib/format";
import { GammaLevels } from "./charts";
import { InfoPopover } from "./InfoPopover";

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

/**
 * Openers that cannot start a sentence on their own.
 *
 * The model writes to a "Claim. Evidence." mandate and satisfies it about a
 * third of the time with a subordinate clause: "The index drop is narrow.
 * Because ex the top five movers the S&P is positive." Splitting on the full
 * stop then renders a bold claim followed by a visible sentence fragment, which
 * reads as a truncation bug rather than as prose.
 *
 * Rejoined rather than dropped or rewritten: the two halves are a single
 * sentence the model punctuated wrongly, the claim still earns its emphasis, and
 * nothing here edits the model's words — the fix is where the seam falls.
 */
const SUBORDINATOR = /^(because|although|though|while|whereas|since|as|unless|whilst)\b/i;

function Claim({ text }: { text: string }) {
  const parts = splitClaim(text);
  if (!parts) return <p className="text-sm text-gray-900 leading-relaxed">{text}</p>;

  const [claim, rest] = parts;
  if (SUBORDINATOR.test(rest)) {
    // Drop the claim's own terminal punctuation and lower-case the connective,
    // so the seam disappears instead of becoming ". because".
    const stem = claim.replace(/[.!?]+$/, "");
    const tail = rest.charAt(0).toLowerCase() + rest.slice(1);
    return (
      <p className="text-sm text-gray-600 leading-relaxed">
        <span className="font-semibold text-gray-900">{stem}</span> {tail}
      </p>
    );
  }

  return (
    <p className="text-sm text-gray-600 leading-relaxed">
      <span className="font-semibold text-gray-900">{claim}</span> {rest}
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

/**
 * Spot on the index is the index CLOSE, never a conversion of itself.
 *
 * `indexEquivalent(facts, pin.spot)` collapses algebraically to
 * `round(spx / 5) * 5` — the S&P close rounded to the nearest 5 — so it could
 * never agree with the close printed in the scoreboard on the same page, and on
 * 2026-08-14 it read 7,785 against a scoreboard showing 7,786. The conversion
 * still earns its place for the pin and the zero-gamma crossing, which are SPY
 * strikes with no index twin; spot has one, exactly, and we already hold it.
 */
function indexSpot(facts: StructuredFacts): number | null {
  if (facts.gexPin?.value.symbol !== "SPY") return null;
  return facts.indices?.value.find((i) => i.symbol === "^GSPC")?.close ?? null;
}

/**
 * The direction check, applied AT RENDER as well as at write.
 *
 * `write.ts` drops a field whose direction the close contradicts, which fixes
 * every note written from now on and no note already in the archive. The 2026-08-14
 * bear case — "The index's gain is hostage to a cluster of mega-caps" on a
 * session that closed -0.17% — is persisted, and this page renders persisted
 * prose verbatim, so the false claim would stand on the archive page forever.
 *
 * Same shape as `gamma-stance.ts`: an archived note written under a wrong
 * assumption is corrected here rather than trusted. A withheld field is STATED,
 * not silently dropped — bull and bear are a pair, and a lone bull card with no
 * explanation reads as "there is no bear case", which is a different and much
 * stronger claim than "the one we wrote did not survive a check".
 */
function directionOk(text: string | undefined, facts: StructuredFacts): boolean {
  return !text || checkDirection(text, indexChangePct(facts)).ok;
}

/**
 * The other half of the pair, when one side did not survive the check.
 *
 * Dashed and unlit, so it never reads as a case being made. Naming the reason
 * matters more here than anywhere else on the page: an archived note whose bear
 * case simply vanished is indistinguishable from a note that had no bear case,
 * and the second is a far stronger claim than the truth.
 */
function WithheldCase({ side, indexPct }: { side: "bull" | "bear"; indexPct: number | null }) {
  return (
    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-1.5">
        {side === "bull" ? "Bull" : "Bear"} &mdash; withheld
      </h3>
      <p className="text-sm text-gray-600 leading-relaxed">
        The written case described the index moving the opposite way from its own close
        {indexPct != null ? (
          <>
            {" "}
            (<span className={`tabular-nums ${toneClass(indexPct)}`}>{spct(indexPct, 2)}</span>)
          </>
        ) : null}
        , so it is not shown.
      </p>
    </div>
  );
}

export function TheRead({ facts, prose }: { facts: StructuredFacts; prose: NoteProse | null }) {
  const pin = facts.gexPin?.value;
  const stance = pin ? gammaStance(pin) : null;
  const pinOnIndex = pin ? indexEquivalent(facts, pin.pinStrike) : null;
  const spotOnIndex = pin ? indexSpot(facts) : null;
  const zeroOnIndex = pin?.zeroGamma != null ? indexEquivalent(facts, pin.zeroGamma) : null;
  const noun = pin && stance ? pinNoun(pin, stance) : "pin";
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

  // Re-checked against the note's own facts, so an archived field that predates
  // the write-time check is caught here instead of standing.
  const bullOk = directionOk(prose?.bull, facts);
  const bearOk = directionOk(prose?.bear, facts);
  const bookOk = directionOk(prose?.book, facts);
  const claims = (prose?.whatMatters ?? []).filter((x) => directionOk(x, facts));
  const claimsWithheld = (prose?.whatMatters.length ?? 0) - claims.length;

  const bull = bullOk ? prose?.bull : undefined;
  const bear = bearOk ? prose?.bear : undefined;
  const book = bookOk ? prose?.book : undefined;
  // The pair still renders when only one side survived — the withheld card is
  // the whole point, and it needs its counterpart beside it to read as a pair.
  const hasBullBear = Boolean(prose?.bull || prose?.bear);
  const indexPct = indexChangePct(facts);

  return (
    <section id="read" className="scroll-mt-24 space-y-6">
      <h2 className="sr-only">The read</h2>

      {(claims.length > 0 || claimsWithheld > 0) && (
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">
            What matters
          </h3>
          <div className="space-y-3 max-w-[62ch]">
            {claims.map((x) => (
              <Claim key={x} text={x} />
            ))}
            {claimsWithheld > 0 && (
              <p className="text-[11px] text-gray-500">
                {claimsWithheld} further point{claimsWithheld === 1 ? "" : "s"} withheld: {claimsWithheld === 1 ? "it described" : "they described"}{" "}
                the index moving the other way from its own close.
              </p>
            )}
          </div>
        </div>
      )}

      {hasBullBear && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {bull && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-emerald-700 mb-1.5">
                Bull
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">{bull}</p>
            </div>
          )}
          {prose?.bull && !bullOk && <WithheldCase side="bull" indexPct={indexPct} />}
          {bear && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-red-700 mb-1.5">
                Bear
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">{bear}</p>
            </div>
          )}
          {prose?.bear && !bearOk && <WithheldCase side="bear" indexPct={indexPct} />}
        </div>
      )}

      {(pin || book) && (
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">
            The book
          </h3>
          <div className="space-y-3 max-w-[62ch]">
            {/*
              The plain reading LEADS, and the precise sentence follows it.
              "Dealers are net long gamma, with a pin near 7,820" is correct,
              citable, and unreadable to anyone who does not already know what
              dealer gamma is — which is most people who would act on it. The
              archived wording is not lost: it survives verbatim below, where it
              is still the form to quote.
            */}
            {pin && stance && (
              <p className="text-sm text-gray-900 leading-relaxed">
                <span className="font-semibold">
                  Options dealers are set up to {stance.sign === 1 ? "lean against" : "amplify"} today&rsquo;s
                  moves.
                </span>{" "}
                {stance.sign === 1 ? (
                  <>
                    If the market rallies they sell into it, if it dips they buy — their hedging works like a
                    shock absorber.
                  </>
                ) : (
                  <>
                    They sell into declines and buy into rallies, so their hedging pushes moves further rather
                    than damping them.
                  </>
                )}
                {pin.zeroGamma != null && (
                  <>
                    {" "}
                    That {stance.sign === 1 ? "holds down to" : "reverses at"}{" "}
                    <span className="tabular-nums font-medium">
                      {zeroOnIndex != null ? intFmt(zeroOnIndex) : `$${pin.zeroGamma.toFixed(2)}`}
                    </span>
                    {stance.sign === 1
                      ? " — below that level the same desks flip to selling into declines, and the absorber becomes an accelerator."
                      : " — above that level the same hedging starts to damp moves instead."}
                  </>
                )}
              </p>
            )}

            {/* Three points on one scale. The prose spread them across two
                paragraphs and left the reader to hold their ORDER in their
                head, which is the whole actionable content — and it buried the
                proximity, which on this note is the finding. */}
            {pin && spotOnIndex != null && pinOnIndex != null && (
              <GammaLevels
                spot={spotOnIndex}
                pin={pinOnIndex}
                zeroGamma={zeroOnIndex}
                pinNoun={noun}
              />
            )}

            {pin && (
              <p className="text-sm text-gray-600 leading-relaxed">
                {noun === "pin" ? (
                  <>
                    There is also a magnet at{" "}
                    <span className="tabular-nums font-medium text-gray-900">
                      {pinOnIndex != null ? intFmt(pinOnIndex) : `$${intFmt(pin.pinStrike)}`}
                    </span>
                    , <span className="tabular-nums">{Math.abs(pin.distancePct).toFixed(1)}%</span>{" "}
                    {pin.pinStrike >= pin.spot ? "above" : "below"} the close: that is where the heaviest open
                    interest sits, and price tends to drift toward it as expiry nears.
                  </>
                ) : (
                  <>
                    The heaviest strike sits at{" "}
                    <span className="tabular-nums font-medium text-gray-900">
                      {pinOnIndex != null ? intFmt(pinOnIndex) : `$${intFmt(pin.pinStrike)}`}
                    </span>
                    , <span className="tabular-nums">{Math.abs(pin.distancePct).toFixed(1)}%</span>{" "}
                    {pin.pinStrike >= pin.spot ? "above" : "below"} the close, and it is put-dominated — price
                    accelerates through it rather than being held by it.
                  </>
                )}
              </p>
            )}

            {/* The citable form, kept verbatim and demoted. Three renderers and
                the prose validator all agree on this wording (`gamma-stance.ts`
                exists so they cannot drift), so it stays on the page — it just
                stops leading. */}
            {pin && stance && (
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Stated precisely: dealers are net {stanceWord(stance)} gamma, with a {noun} near{" "}
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
                ), aggregated across {pin.expiriesUsed} expiration{pin.expiriesUsed === 1 ? "" : "s"}
                {/* The crossing rides in the same sentence rather than standing
                    as its own paragraph — the plain reading and the level map
                    above both already state it, and a third telling was the
                    largest single repetition left in this section. Omitted
                    entirely when undetected: absent means no crossing was FOUND
                    in the search band, which is not the same as none existing
                    (§1a), so there is nothing to word around. */}
                {pin.zeroGamma != null && (
                  <>
                    , with total gamma turning {stance.sign === 1 ? "negative" : "positive"} near{" "}
                    <span className="tabular-nums">
                      {zeroOnIndex != null ? intFmt(zeroOnIndex) : `$${pin.zeroGamma.toFixed(2)}`}
                    </span>
                    {zeroOnIndex != null ? " on the index" : ` on ${pin.symbol}`}
                  </>
                )}
                .
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

            {book && <p className="text-sm text-gray-600 leading-relaxed">{book}</p>}

            {/*
              Method behind a control, not under the claim. As a block it ran
              LONGER than the two sentences it qualifies and sat directly beneath
              them in the same column — provenance outweighing its own finding,
              which is provenance nobody reads. It is one click away, still
              adjacent to the figure, and the panel keeps each caveat on its own
              line so the horizon and the dealer-side assumption are findable
              rather than buried mid-paragraph.
            */}
            {pin && (
              <div>
                <InfoPopover label="How this is measured" title="Method &amp; caveats">
                  <p>
                    <span className="font-semibold text-gray-900">Measured on {pin.symbol} options.</span>{" "}
                    Yahoo publishes index expirations with no open interest at all, and open interest is the
                    whole input.
                  </p>
                  {pin.horizonDays != null && (
                    <p>
                      <span className="font-semibold text-gray-900">Horizon.</span> Every expiration inside{" "}
                      {pin.horizonDays} days is included, which always reaches the next monthly. Two notes are
                      comparable only at equal horizons.
                    </p>
                  )}
                  {pinOnIndex != null && (
                    <p>
                      <span className="font-semibold text-gray-900">Index levels.</span> Strike levels are that
                      day&rsquo;s own S&amp;P close over its SPY close, rounded to 5 points; spot is the index
                      close itself.
                    </p>
                  )}
                  <p>
                    <span className="font-semibold text-gray-900">Dealer side is assumed.</span> Long calls and
                    short puts, the usual customer book — the trade-side data that would settle it is not free.
                  </p>
                  <p>
                    <span className="font-semibold text-gray-900">Open interest is start-of-day.</span> This is
                    where the book sat this morning, not where today&rsquo;s flow moved it.
                  </p>
                </InfoPopover>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
