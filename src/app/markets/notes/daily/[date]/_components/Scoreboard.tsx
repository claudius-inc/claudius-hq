import type { StructuredFacts } from "@/lib/notes/types";
import { LocalTime } from "@/components/ui/LocalTime";
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
function IndexTile({
  name,
  close,
  changePct,
  chg5s,
  chg21s,
}: {
  name: string;
  close: number | null;
  changePct: number;
  chg5s?: number | null;
  chg21s?: number | null;
}) {
  // Where the day sits in this index's OWN recent run. Deliberately "5s"/"21s"
  // for sessions, never "1W"/"1M" — a holiday week would make those labels
  // false. This existed for the S&P alone, as one line of prose under the row,
  // while `timeframes` carried all four indices every night.
  const runs: { label: string; value: number }[] = [];
  if (chg5s != null) runs.push({ label: "5s", value: chg5s });
  if (chg21s != null) runs.push({ label: "21s", value: chg21s });

  return (
    <div className="min-w-0">
      <p className="text-xs tracking-wide text-gray-500 truncate">{name}</p>
      <p className={`text-2xl font-semibold tabular-nums leading-tight ${toneClass(changePct)}`}>
        {spct(changePct)}
      </p>
      <p className="text-sm text-gray-600 tabular-nums">
        {close != null ? intFmt(close) : " "}
      </p>
      {/* Rendered even when empty, so the four tiles keep one baseline on a day
          a split defect withholds one index's session figures. */}
      <p className="text-[11px] text-gray-500 tabular-nums mt-0.5">
        {runs.length > 0
          ? runs.map((r, i) => (
              <span key={r.label}>
                {i > 0 ? " · " : ""}
                {r.label} <span className={toneClass(r.value)}>{spct(r.value)}</span>
              </span>
            ))
          : " "}
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
  const tf = new Map((facts.timeframes?.value ?? []).map((t) => [t.symbol, t]));
  const vixRun = tf.get("^VIX");

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
              <IndexTile
                key={i.symbol}
                name={i.name}
                close={i.close}
                changePct={i.changePct}
                chg5s={tf.get(i.symbol)?.chg5s}
                chg21s={tf.get(i.symbol)?.chg21s}
              />
            ))
          ) : (
            <p className="col-span-full text-sm text-gray-500 italic">
              Index closes unavailable for this session.
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
                trendDays={vx.trendDays}
                trendDir={vx.trendDir}
                chg21s={vixRun?.chg21s}
              />
            ) : (
              <p className="text-sm text-gray-500 italic">VIX unavailable for this session.</p>
            )}
            <Provenance fact={facts.vix} />
          </div>
        </div>

        {/*
          THE rates glance, and the only place these four figures appear.
          Previously three of them were repeated verbatim by a table one screen
          below, and the fourth slot held the dollar — which the cross-asset
          table also carried in full. The old comment here reasoned that 2s10s
          did not belong "because it is already printed with its change in the
          Rates table below", which was equally true of the three tenors beside
          it; the rule is now applied to all four. The Rates section keeps the
          curve, which shows a shape no tile can, and the dollar keeps its
          cross-asset row, where its 5- and 21-session context now lives too.
        */}
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
          <MicroStat
            label="30Y"
            value={rates ? `${rates.y30.toFixed(2)}%` : <NoValue />}
            hint={rates ? `${sbp(rates.chg30Bp)} on the day` : undefined}
          />
          {/* Not uppercased by `MicroStat` on purpose — `uppercase` renders this
              label as "2S10S". */}
          <MicroStat
            label="2s10s"
            value={rates ? sbp(rates.spread2s10Bp) : <NoValue />}
            hint={rates ? `${sbp(rates.spread2s10ChgBp)} on the day` : undefined}
          />
          {facts.rates ? (
            <p className="col-span-full text-[11px] text-gray-500 tabular-nums">
              {facts.rates.source} &middot; <LocalTime iso={facts.rates.asOf} /> — these print half an hour
              before the equity close
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
