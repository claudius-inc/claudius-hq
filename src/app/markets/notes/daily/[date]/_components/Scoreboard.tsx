import type { StructuredFacts } from "@/lib/notes/types";
import { spct, sbp, intFmt, toneClass } from "../_lib/format";
import { BreadthBar, VixStrip } from "./charts";
import { NoValue, Provenance } from "./primitives";

/**
 * Tier 1 — the scoreboard.
 *
 * Fixed layout, same grid position every single day. That repetition IS the
 * scanning mechanism: a reader who checks the 10Y every evening learns where it
 * lives once. Cells hold their place when a fact is missing (an em dash, not a
 * reflow), so two notes read side by side stay comparable — `AGENTS.md`'s
 * stable-height rule applied to data rather than to loading.
 */

/**
 * The percentage leads on every tile, including the S&P.
 *
 * Leading with the level where one exists and the percentage where one does not
 * gave the row two different hero quantities, so the eye could not compare the
 * four indices at a glance — which is the only reason they sit in a row. The
 * level is the secondary line, and the sub-line is always present (a
 * non-breaking space where there is no level) so the four tiles keep one
 * baseline.
 */
function IndexTile({ name, close, changePct }: { name: string; close: number | null; changePct: number }) {
  return (
    <div className="min-w-0">
      <p className="text-xs tracking-wide text-gray-500 truncate">{name}</p>
      <p className={`text-2xl font-semibold tabular-nums leading-tight ${toneClass(changePct)}`}>
        {spct(changePct)}
      </p>
      <p className="text-sm text-gray-600 tabular-nums">
        {close != null ? intFmt(close) : " "}
      </p>
    </div>
  );
}

function MicroStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      {/* Not uppercased: these labels are already conventional casing, and a
          curve label like "2s10s" comes out of `uppercase` as "2S10S". */}
      <p className="text-xs tracking-wide text-gray-500 truncate">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${tone ?? "text-gray-900"}`}>{value}</p>
      {hint ? <p className="text-[11px] text-gray-500 truncate">{hint}</p> : null}
    </div>
  );
}

export function Scoreboard({ facts }: { facts: StructuredFacts }) {
  const indices = facts.indices?.value ?? [];
  const br = facts.breadth?.value;
  const vx = facts.vix?.value;
  const rates = facts.rates?.value;
  const dxy = facts.crossAsset?.value.find((c) => c.label === "DXY");
  // Where the day sits in its own recent run. Deliberately "5-session" and
  // "21-session", never "1 week" / "1 month" — a holiday week would make those
  // labels false.
  const spTrend = facts.timeframes?.value.find((t) => t.symbol === "^GSPC");
  const trendParts: string[] = [];
  if (spTrend?.chg5s != null) trendParts.push(`5 sessions ${spct(spTrend.chg5s)}`);
  if (spTrend?.chg21s != null) trendParts.push(`21 sessions ${spct(spTrend.chg21s)}`);

  return (
    <section id="scoreboard" aria-labelledby="scoreboard-heading" className="scroll-mt-24">
      <h2 id="scoreboard-heading" className="sr-only">
        Closing scoreboard
      </h2>

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {/* Indices — 2x2 on a phone, 4 across from sm. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4">
          {indices.length > 0 ? (
            indices.map((i) => (
              <IndexTile key={i.symbol} name={i.name} close={i.close} changePct={i.changePct} />
            ))
          ) : (
            <p className="col-span-full text-sm text-gray-500 italic">
              Index closes unavailable for this session.
            </p>
          )}
          {trendParts.length > 0 && (
            <p className="col-span-full text-xs text-gray-600 tabular-nums">
              S&amp;P over {trendParts.join(" · ")}
            </p>
          )}
        </div>

        {/* Breadth and VIX — the two facts that most often disagree with the tape. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4">
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <p className="text-xs tracking-wide text-gray-500">Breadth</p>
              {br ? (
                <p className="text-sm font-semibold text-gray-900 tabular-nums">A/D {br.ratio.toFixed(2)}</p>
              ) : null}
            </div>
            {br ? (
              <>
                <BreadthBar advances={br.advances} declines={br.declines} label="NYSE" />
                <p className="text-[11px] text-gray-500 mt-2 tabular-nums">
                  New highs {intFmt(br.newHighs)} &middot; new lows {intFmt(br.newLows)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500 italic">Breadth unavailable for this session.</p>
            )}
            <Provenance fact={facts.breadth} />
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <p className="text-xs tracking-wide text-gray-500">VIX</p>
              {vx ? (
                // Deliberately NOT in the emerald/red direction colours. VIX is
                // an inverse gauge — a rise is more fear, not a gain — and this
                // is the one number on the page where the site-wide
                // green-is-up convention would actively mislead. The sign and
                // the strip below carry the direction.
                <p className="text-sm font-semibold tabular-nums text-gray-900">
                  {vx.change >= 0 ? "+" : ""}
                  {vx.change.toFixed(1)}
                </p>
              ) : null}
            </div>
            {vx ? (
              <VixStrip
                level={vx.level}
                change={vx.change}
                ytdLow={vx.ytdLow}
                ytdHigh={vx.ytdHigh}
                percentile={vx.percentile}
              />
            ) : (
              <p className="text-sm text-gray-500 italic">VIX unavailable for this session.</p>
            )}
            <Provenance fact={facts.vix} />
          </div>
        </div>

        {/* The four numbers most often looked up on their own. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4">
          <MicroStat
            label="10Y"
            value={rates ? `${rates.y10.toFixed(2)}%` : <NoValue />}
            hint={rates ? `${sbp(rates.chg10Bp)} on the day` : undefined}
          />
          <MicroStat
            label="2Y"
            value={rates ? `${rates.y2.toFixed(2)}%` : <NoValue />}
            hint={rates ? `${sbp(rates.chg2Bp)} on the day` : undefined}
          />
          {/* The long end, not 2s10s. The spread is a derived figure and it is
              already printed with its change in the Rates table below; the 30Y
              is a level nobody can reconstruct from the other two tiles, and it
              is the one that carries term premium and issuance. */}
          <MicroStat
            label="30Y"
            value={rates ? `${rates.y30.toFixed(2)}%` : <NoValue />}
            hint={rates ? `${sbp(rates.chg30Bp)} on the day` : undefined}
          />
          <MicroStat
            label="Dollar (DXY)"
            value={dxy ? dxy.price.toFixed(1) : <NoValue />}
            tone={dxy?.changePct != null ? toneClass(dxy.changePct) : undefined}
            hint={dxy?.changePct != null ? `${spct(dxy.changePct)} on the day` : "level only"}
          />
        </div>
      </div>
    </section>
  );
}
