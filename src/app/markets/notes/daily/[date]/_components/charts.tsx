import { fillFor, spct, sbp, intFmt, toneClass, MARK_NEUTRAL, MARK_DOWN } from "../_lib/format";

/**
 * Every chart on this page is inline SVG or flexbox, rendered on the server.
 *
 * Recharts is already a dependency, but each of these is a handful of marks on
 * a domain we compute anyway, and recharts would force `"use client"` — dragging
 * a chart library into the bundle, adding a hydration pass and a mount-time
 * resize, and reintroducing the layout shift `AGENTS.md` rules out. Static
 * geometry needs none of that.
 *
 * Conventions (see the dataviz guidance): hairline recessive grid, thin marks
 * with a 2px surface gap, direct labels rather than a value on every mark,
 * `role="img"` plus an `aria-label` stating the takeaway, and a real table
 * beside every chart as the text alternative.
 */

const GRID = "#e5e7eb";
const LABEL = "#6b7280";
/**
 * amber-700, for the one annotation that is neither a direction nor chrome:
 * "today set the year's low". It has to separate from `LABEL` at 8–9px, and it
 * must not be read as a gain or a loss — which rules out the emerald/red pair
 * every other coloured mark on the page uses. 4.8:1 on white.
 */
const MARK_EXTREME = "#b45309";

/* ── Diverging bar, for a table cell ─────────────────────────────────────── */

/**
 * A centre-origin bar sized against the largest absolute move in its own
 * column.
 *
 * The load-bearing encoding is the SIDE of the origin, not the colour: the two
 * fills are close in lightness, so they are indistinguishable in greyscale, and
 * position is what survives. The signed number sits in the cell immediately to
 * the left in every table that uses this, so the row never depends on the mark
 * alone. `aria-hidden` because that number is the accessible value.
 */
export function DivergingBar({ value, max, width = 88 }: { value: number; max: number; width?: number }) {
  const half = width / 2;
  // A zero-length bar is invisible; give a flat print a 1px tick so the row
  // never looks like missing data.
  const len = max > 0 ? Math.max((Math.abs(value) / max) * half, value === 0 ? 1 : 1.5) : 1;
  return (
    <svg
      width={width}
      height={10}
      viewBox={`0 0 ${width} 10`}
      className="shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      {/* The origin has to be visible or a short bar reads as a dash floating
          in empty space with no baseline to measure it against. */}
      <line x1={half} y1={0} x2={half} y2={10} stroke="#d1d5db" strokeWidth={1} />
      <rect
        x={value >= 0 ? half : half - len}
        y={2.5}
        width={len}
        height={5}
        rx={2}
        fill={fillFor(value)}
      />
    </svg>
  );
}

/* ── Breadth ─────────────────────────────────────────────────────────────── */

/**
 * Advancers against decliners as a single 100% bar.
 *
 * This is the day's contradiction made visible: on 2026-08-10 the S&P closed
 * essentially flat while decliners beat advancers three to two. A donut would
 * be wrong here — it is a two-part composition on one dimension, which a bar
 * reads faster.
 */
export function BreadthBar({
  advances,
  declines,
  label,
}: {
  advances: number;
  declines: number;
  label: string;
}) {
  const total = advances + declines;
  if (total === 0) return null;
  const upPct = (advances / total) * 100;
  return (
    <div>
      {/*
        The counts sit BELOW the bar, not inside it. White on these fills is
        roughly 3.9:1, which fails AA at 11px, and an in-segment label also
        clips the moment one side of the market dominates.
      */}
      <div
        className="flex h-4 gap-[2px] rounded overflow-hidden"
        role="img"
        aria-label={`${label}: ${intFmt(advances)} advancing (${upPct.toFixed(0)}%), ${intFmt(declines)} declining (${(100 - upPct).toFixed(0)}%)`}
      >
        {/* Only the WIDTH is inline — it is data. The fills are Tailwind
            classes, per the style guide. */}
        <div className="bg-emerald-600" style={{ width: `${upPct}%` }} />
        <div className="bg-red-600" style={{ width: `${100 - upPct}%` }} />
      </div>
      <div className="flex justify-between mt-1 text-[11px] text-gray-600">
        <span>
          <span className="font-medium text-gray-900 tabular-nums">{intFmt(advances)}</span> {label} advancing
        </span>
        <span>
          <span className="font-medium text-gray-900 tabular-nums">{intFmt(declines)}</span> declining
        </span>
      </div>
    </div>
  );
}

/* ── VIX position within the year ────────────────────────────────────────── */

/**
 * Where VIX closed inside this year's range, with the prior close shown as a
 * hollow marker so the day's move reads as displacement rather than a number.
 *
 * The caption states the RANK ("below 92% of this year's closes"), which is what
 * `VixData.percentile` actually measures — the old "8th percentile of the
 * 14.5-31.1 range" phrasing invited the reader to compute 8% of the way from
 * the low to the high, a different and much weaker claim.
 */
export function VixStrip({
  level,
  change,
  ytdLow,
  ytdHigh,
  percentile,
  trendDays,
  trendDir,
  chg21s,
}: {
  level: number;
  change: number;
  ytdLow: number;
  ytdHigh: number;
  percentile: number;
  trendDays: number;
  trendDir: "up" | "down" | "flat";
  /** The 21-session move, where `timeframes` carried one for ^VIX. */
  chg21s?: number | null;
}) {
  const W = 320;
  const H = 46;
  const padX = 10;
  const span = Math.max(ytdHigh - ytdLow, 0.0001);
  const x = (v: number) => padX + ((v - ytdLow) / span) * (W - padX * 2);
  const prior = level - change;
  const trackY = 20;

  /*
   * Today SET the extreme. `ytdLow` is a min over a series that INCLUDES
   * today, so on a day like 2026-08-14 the marker and the range's own endpoint
   * are the same number — and the chart printed "14.3" twice, once as the
   * marker label and once as the axis end, with the dot pinned to the frame and
   * nothing saying why. That is the most interesting thing VIX did all year and
   * it read as a rendering fault.
   *
   * Compared with a tolerance rather than `===`: both figures go through the
   * same `round` helper in the assembler, so equality is safe today, but a
   * future change to either rounding would silently switch this off.
   */
  const atLow = Math.abs(level - ytdLow) < 0.005;
  const atHigh = Math.abs(level - ytdHigh) < 0.005;
  const extreme = atLow ? "low" : atHigh ? "high" : null;

  const trendPhrase =
    trendDays >= 2 && trendDir !== "flat" ? `${trendDir} ${trendDays} sessions` : null;

  const rankPhrase = atLow
    ? "Below every close this year"
    : atHigh
      ? "Above every close this year"
      : `Below ${100 - percentile}% of this year's closes`;

  return (
    <div>
      {extreme && (
        <p className="mb-1.5">
          <span className="inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[11px] font-semibold text-amber-800">
            {atLow ? "Lowest" : "Highest"} close of the year
          </span>
        </p>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-sm h-auto"
        role="img"
        aria-label={`VIX closed at ${level.toFixed(1)}, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)} from ${prior.toFixed(1)}. ${
          extreme
            ? `That is the ${atLow ? "lowest" : "highest"} close of the year.`
            : `It sits below ${100 - percentile}% of this year's closes.`
        } This year's range is ${ytdLow.toFixed(1)} to ${ytdHigh.toFixed(1)}.`}
      >
        <line x1={padX} y1={trackY} x2={W - padX} y2={trackY} stroke={GRID} strokeWidth={4} strokeLinecap="round" />
        {/*
          Neutral ink, not the emerald/red direction pair. VIX is an inverse
          gauge: painting a volatility spike emerald because the number went up
          is the one place the site-wide convention says the opposite of what
          happened. Displacement from the hollow prior-close marker carries the
          direction instead.
        */}
        <line
          x1={x(prior)}
          y1={trackY}
          x2={x(level)}
          y2={trackY}
          stroke="#374151"
          strokeWidth={4}
          strokeLinecap="round"
        />
        <circle cx={x(prior)} cy={trackY} r={4} fill="#ffffff" stroke={LABEL} strokeWidth={1.5} />
        <circle cx={x(level)} cy={trackY} r={5.5} fill="#374151" stroke="#ffffff" strokeWidth={2} />

        {/* The track IS this year's low-to-high range. Whichever end today set
            is labelled by the marker above it, so repeating it underneath is
            the duplicate — only the OTHER end gets an axis label. */}
        {!atLow && (
          <text x={padX} y={trackY + 18} fontSize={10} fill={LABEL}>
            {ytdLow.toFixed(1)}
          </text>
        )}
        {extreme ? (
          <text
            x={atLow ? padX + 14 : W - padX - 14}
            y={trackY + 18}
            fontSize={9}
            fill={MARK_EXTREME}
            textAnchor={atLow ? "start" : "end"}
          >
            today, and the year&apos;s {extreme}
          </text>
        ) : (
          <text x={W / 2} y={trackY + 18} fontSize={9} fill={LABEL} textAnchor="middle">
            this year&apos;s range
          </text>
        )}
        {!atHigh && (
          <text x={W - padX} y={trackY + 18} fontSize={10} fill={LABEL} textAnchor="end">
            {ytdHigh.toFixed(1)}
          </text>
        )}

        <text
          x={Math.min(Math.max(x(level), 18), W - 18)}
          y={trackY - 10}
          fontSize={11}
          fontWeight={600}
          fill="#111827"
          textAnchor="middle"
        >
          {level.toFixed(1)}
        </text>
      </svg>
      {/* The run and the 21-session move were computed on every note and shown
          only in the Telegram push. A single close means little without them:
          a low print on a three-week grind lower is a different fact from a low
          print on a one-day drop. */}
      <p className="text-[11px] text-gray-500 mt-0.5">
        {rankPhrase}
        {trendPhrase ? ` · ${trendPhrase}` : ""}
        {chg21s != null ? (
          <>
            {" · "}
            <span className={`tabular-nums ${toneClass(chg21s)}`}>{spct(chg21s)}</span> over 21 sessions
          </>
        ) : null}
      </p>
    </div>
  );
}

/* ── Dealer gamma: the three levels on one axis ──────────────────────────── */

/**
 * Spot, the zero-gamma crossing, and the pin — one number line.
 *
 * These are three points on a single scale and the page described them across
 * two paragraphs, leaving the reader to hold their ORDER in their head. Order is
 * the entire actionable content: a pin above spot with the crossing below is a
 * different session from a pin below spot, and the prose made that a puzzle.
 *
 * The proximity is the finding the prose buried. On 2026-08-14 the crossing sits
 * 0.65% under the close — the shock absorber runs out almost immediately — and
 * no sentence conveys that as fast as two marks on an axis do.
 *
 * The track is painted in two segments: below the crossing, dealer hedging
 * amplifies moves; above it, hedging damps them. Colour is reinforcement only —
 * each mark carries its own level and a word.
 */
export function GammaLevels({
  spot,
  pin,
  zeroGamma,
  pinNoun: noun,
}: {
  spot: number;
  pin: number;
  /** Null when no crossing was detected in the search band. */
  zeroGamma: number | null;
  /** "pin" draws price in; "trigger" accelerates through. */
  pinNoun: "pin" | "trigger";
}) {
  const W = 340;
  const H = 82;
  const padX = 8;
  const marks = [spot, pin, ...(zeroGamma != null ? [zeroGamma] : [])];
  const lo = Math.min(...marks);
  const hi = Math.max(...marks);
  // Pad so an outer mark never sits on the frame and its label never clips.
  const pad = Math.max((hi - lo) * 0.18, Math.abs(spot) * 0.0005);
  const dLo = lo - pad;
  const dHi = hi + pad;
  const x = (v: number) => padX + ((v - dLo) / Math.max(dHi - dLo, 1e-9)) * (W - padX * 2);

  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
  const trackY = 44;
  const zx = zeroGamma != null ? x(zeroGamma) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-md h-auto"
      role="img"
      aria-label={
        `Index levels. Spot closed at ${fmt(spot)}. The ${noun} sits at ${fmt(pin)}, ` +
        `${pin >= spot ? "above" : "below"} spot.` +
        (zeroGamma != null
          ? ` Dealer gamma crosses zero at ${fmt(zeroGamma)}. Below that level hedging amplifies moves` +
            ` rather than damping them.`
          : "")
      }
    >
      {/* Amplifying side first, damping side over it — drawn as two segments so
          the boundary IS the crossing rather than a separately-positioned tick. */}
      {zx != null ? (
        <>
          <line x1={padX} y1={trackY} x2={zx} y2={trackY} stroke={MARK_DOWN} strokeWidth={6} strokeLinecap="round" />
          <line x1={zx} y1={trackY} x2={W - padX} y2={trackY} stroke={MARK_NEUTRAL} strokeWidth={6} strokeLinecap="round" />
        </>
      ) : (
        <line x1={padX} y1={trackY} x2={W - padX} y2={trackY} stroke={MARK_NEUTRAL} strokeWidth={6} strokeLinecap="round" />
      )}

      {zx != null && (
        <g>
          <line x1={zx} y1={trackY - 10} x2={zx} y2={trackY + 10} stroke="#111827" strokeWidth={1.5} />
          <text x={zx} y={trackY - 16} fontSize={10} fontWeight={600} fill="#111827" textAnchor="middle">
            {fmt(zeroGamma as number)}
          </text>
          <text x={zx} y={trackY + 22} fontSize={8.5} fill={LABEL} textAnchor="middle">
            flips here
          </text>
        </g>
      )}

      <g>
        <circle cx={x(spot)} cy={trackY} r={6} fill="#111827" stroke="#ffffff" strokeWidth={2.5} />
        <text x={x(spot)} y={trackY - 16} fontSize={10} fontWeight={600} fill="#111827" textAnchor="middle">
          {fmt(spot)}
        </text>
        <text x={x(spot)} y={trackY + 22} fontSize={8.5} fill={LABEL} textAnchor="middle">
          closed here
        </text>
      </g>

      <g>
        {/* Hollow, so it reads as a level the market is drawn toward rather than
            as a price that happened — the filled dot is the only real print. */}
        <circle cx={x(pin)} cy={trackY} r={5.5} fill="#ffffff" stroke="#374151" strokeWidth={2.5} />
        <text x={x(pin)} y={trackY - 16} fontSize={10} fontWeight={600} fill="#111827" textAnchor="middle">
          {fmt(pin)}
        </text>
        <text x={x(pin)} y={trackY + 22} fontSize={8.5} fill={LABEL} textAnchor="middle">
          {noun === "pin" ? "magnet" : "trigger"}
        </text>
      </g>

      {zx != null && (
        <>
          <text x={padX} y={H - 3} fontSize={8.5} fill={MARK_DOWN} textAnchor="start">
            moves amplify
          </text>
          <text x={W - padX} y={H - 3} fontSize={8.5} fill={LABEL} textAnchor="end">
            moves damped
          </text>
        </>
      )}
    </svg>
  );
}

/* ── Treasury curve ──────────────────────────────────────────────────────── */

/**
 * Today's tenors, and their move from the prior close, in two stacked panels.
 *
 * The old single panel drew today over prior on one axis. It was honest — the
 * domain is pinned to the data plus a fixed margin, so a 6bp parallel shift
 * does NOT fill the plot and pose as a regime change — but honesty cost it its
 * legibility: a 6bp move on a curve that spans ~130bp is a two-pixel gap, and
 * the pale prior line vanished under the dark one. The move, which is the whole
 * reason the prior close is on the chart, was the one thing you could not read.
 *
 * The fix is not to distort the level axis but to give the move its OWN axis.
 * Top panel: today's curve on the same pinned domain — the shape, unchanged.
 * Bottom panel: the per-tenor change in basis points, on a scale of its own,
 * where +1 and +9 are finally different sizes. Naming the unit ("change vs
 * prior · bp") is what keeps the second axis from being read as more yield.
 *
 * The bars are neutral ink, not the emerald/red the rest of the page uses for
 * signed moves: a rising yield is not a gain, so painting it green would
 * mislead — the same call the scoreboard makes for the VIX. Direction rides on
 * the side of the zero line, exactly as `DivergingBar` does it, so the encoding
 * survives greyscale and never claims up-is-good. The x axis is categorical
 * (2Y, 10Y, 30Y), evenly spaced, and honest only because it is never a time
 * axis.
 */
export function RatesCurve({
  today,
  prior,
}: {
  today: { tenor: string; y: number }[];
  prior: { tenor: string; y: number }[];
}) {
  const W = 320;
  const H = 196;
  const padL = 34;
  const padR = 14;
  // Curve panel (the shape) and, below it, the change strip (the move). The two
  // share one x scale so a tenor sits in the same column in both.
  const cTop = 14;
  const cBot = 90;
  const capY = 101; // "change vs prior · bp" caption baseline
  // Origin and half-height are set together so a full-depth bar clears its
  // neighbours: a max positive bar's label (bZero - bSpan - 4) stays below the
  // caption, and a max NEGATIVE bar's label (bZero + bSpan + 11) stays above the
  // tenor row at tenorY. Widen bSpan or drop bZero and a decline's label collides
  // with the tenor labels.
  const bZero = 143; // change-strip origin; bars grow up for a rise, down for a fall
  const bSpan = 26; // half-height of the strip, so a twist (front down, long up) fits
  const tenorY = 192;

  const all = [...today.map((d) => d.y), ...prior.map((d) => d.y)];
  // Snap the domain out to round quarter-percents. A data-derived domain gave
  // ticks like 4.04 / 4.72 / 5.40 — unreadable, and different on every archived
  // note, which quietly undoes the cross-day comparability the whole page is
  // built for.
  const STEP = 0.25;
  const lo = Math.floor((Math.min(...all) - 0.1) / STEP) * STEP;
  const hi = Math.ceil((Math.max(...all) + 0.1) / STEP) * STEP;
  const x = (i: number) => padL + (i / Math.max(today.length - 1, 1)) * (W - padL - padR);
  const yC = (v: number) => cTop + (1 - (v - lo) / (hi - lo)) * (cBot - cTop);
  const curve = today.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${yC(d.y)}`).join(" ");

  // The change in bp. today.y - prior.y is exactly chgNBp/100 by construction
  // (the caller derives prior from today minus the bp change), so this rounds
  // back to the same integer the scoreboard prints — no second source of truth.
  const bps = today.map((d, i) => Math.round((d.y - (prior[i]?.y ?? d.y)) * 100));
  const maxBp = Math.max(...bps.map((b) => Math.abs(b)), 1);
  const barH = (b: number) => (b === 0 ? 0 : Math.max((Math.abs(b) / maxBp) * bSpan, 2));

  return (
    <figure className="m-0">
      {/* One series on the curve panel and a self-labelled strip below, so no
          legend box is needed — the aria-label carries the full read. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-sm h-auto"
        role="img"
        aria-label={`Treasury curve and its move from the prior close. Today: ${today
          .map((d) => `${d.tenor} ${d.y.toFixed(2)}%`)
          .join(", ")}. Change: ${today.map((d, i) => `${d.tenor} ${sbp(bps[i])}`).join(", ")}.`}
      >
        {/* Curve panel — the shape, on the pinned domain */}
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1={padL} y1={yC(v)} x2={W - padR} y2={yC(v)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={yC(v) + 3} fontSize={9} fill={LABEL} textAnchor="end">
              {v.toFixed(2)}
            </text>
          </g>
        ))}
        <path d={curve} fill="none" stroke="#111827" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
        {today.map((d, i) => (
          <circle key={d.tenor} cx={x(i)} cy={yC(d.y)} r={3.5} fill="#111827" stroke="#ffffff" strokeWidth={2} />
        ))}

        {/* Change strip — the move, on its own bp scale */}
        <text x={padL} y={capY} fontSize={9} fill={LABEL} textAnchor="start">
          change vs prior · bp
        </text>
        <line x1={padL} y1={bZero} x2={W - padR} y2={bZero} stroke={GRID} strokeWidth={1} />
        <text x={padL - 6} y={bZero + 3} fontSize={9} fill={LABEL} textAnchor="end">
          0
        </text>
        {today.map((d, i) => {
          const b = bps[i];
          const h = barH(b);
          const bw = 26;
          return (
            <g key={d.tenor}>
              <rect x={x(i) - bw / 2} y={b >= 0 ? bZero - h : bZero} width={bw} height={h} rx={3} fill="#111827" />
              <text
                x={x(i)}
                y={b >= 0 ? bZero - h - 4 : bZero + h + 11}
                fontSize={10}
                fontWeight={600}
                fill="#374151"
                textAnchor="middle"
              >
                {sbp(b)}
              </text>
              <text x={x(i)} y={tenorY} fontSize={10} fill={LABEL} textAnchor="middle">
                {d.tenor}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/* ── Index concentration ─────────────────────────────────────────────────── */

/**
 * The decomposition of the index move, on one shared axis whose unit is
 * PERCENTAGE POINTS. Naming the unit on the axis is what kills the old
 * "-0.4% of the index's -0.1%" phrasing, which read as a ratio.
 */
export function ConcentrationBars({
  rows,
}: {
  rows: {
    label: string;
    points: number;
    tone: "signed" | "neutral";
    outlined?: boolean;
    /** Draw a divider above this row — separates components from totals. */
    rule?: boolean;
  }[];
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.points)), 0.01);
  const W = 400;
  const rowH = 28;
  const H = rows.length * rowH + 22;
  // Three columns: a left gutter for the row labels (without it the chart was
  // four unlabelled bars), the plot, and a right column for the values. The
  // values need their own column because a label hung off the end of a negative
  // bar runs straight back into the row-label gutter.
  const padL = 128;
  const padR = 44;
  const mid = padL + (W - padL - padR) / 2;
  const scale = (v: number) => (v / max) * ((W - padL - padR) / 2);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-lg h-auto"
      role="img"
      aria-label={`Index move decomposition in percentage points: ${rows.map((r) => `${r.label} ${r.points >= 0 ? "+" : ""}${r.points.toFixed(2)}`).join("; ")}.`}
    >
      <line x1={mid} y1={4} x2={mid} y2={rows.length * rowH + 2} stroke={GRID} strokeWidth={1} />
      {rows.map((r, i) => {
        const w = Math.max(Math.abs(scale(r.points)), 1.5);
        const yTop = i * rowH + 9;
        const fill = r.tone === "neutral" ? MARK_NEUTRAL : fillFor(r.points);
        return (
          <g key={r.label}>
            {r.rule && (
              <line x1={4} y1={yTop - 6} x2={W - 4} y2={yTop - 6} stroke={GRID} strokeWidth={1} />
            )}
            <text x={padL - 8} y={yTop + 9} fontSize={10} fill="#374151" textAnchor="end">
              {r.label}
            </text>
            <rect
              x={r.points >= 0 ? mid : mid - w}
              y={yTop}
              width={w}
              height={10}
              rx={2}
              fill={r.outlined ? "#ffffff" : fill}
              stroke={r.outlined ? fill : "none"}
              strokeWidth={r.outlined ? 1.5 : 0}
            />
            <text x={W - 2} y={yTop + 9} fontSize={10} fontWeight={600} fill="#374151" textAnchor="end">
              {r.points >= 0 ? "+" : ""}
              {r.points.toFixed(2)}
            </text>
          </g>
        );
      })}
      <text x={mid} y={H - 4} fontSize={9} fill={LABEL} textAnchor="middle">
        percentage points of index move
      </text>
    </svg>
  );
}

/* ── Within-sector divergence ────────────────────────────────────────────── */

/**
 * One sector's constituents against the sector's own move.
 *
 * The connector's LENGTH is the gap — the figure the section exists to show,
 * and which was previously buried in parenthetical italics. The reference line
 * is the sector, labelled, so no row needs a number held in the reader's head.
 */
/**
 * The domain shared by every lollipop in a section.
 *
 * Deriving the domain per-sector made three stacked charts, drawn in identical
 * visual language with no axis ticks, use three different scales — so a +5.4pp
 * gap and a +2.7pp gap rendered the same bar length while the section's own
 * intro invited exactly that comparison. One domain across the section is the
 * only way stacking them means anything.
 */
export function sharedDomain(groups: { sectorPct: number; names: { changePct: number }[] }[]) {
  const values = groups.flatMap((g) => [g.sectorPct, ...g.names.map((n) => n.changePct)]);
  if (values.length === 0) return { lo: -1, hi: 1 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.12, 0.3);
  return { lo: lo - pad, hi: hi + pad };
}

export function DivergenceLollipop({
  sectorLabel,
  sectorPct,
  names,
  domain,
}: {
  /** The sector's readable name, not its ETF — this is also the alt text. */
  sectorLabel: string;
  sectorPct: number;
  names: { ticker: string; changePct: number }[];
  domain: { lo: number; hi: number };
}) {
  const { lo: dLo, hi: dHi } = domain;
  const W = 340;
  const rowH = 22;
  const padL = 44;
  const padR = 52;
  const headH = 12;
  const H = names.length * rowH + headH + 22;
  const x = (v: number) => padL + ((v - dLo) / (dHi - dLo)) * (W - padL - padR);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-md h-auto"
      role="img"
      aria-label={`${sectorLabel} closed ${spct(sectorPct)}. ${names.map((n) => `${n.ticker} closed ${spct(n.changePct)}, a gap of ${spct(n.changePct - sectorPct)} against the sector`).join("; ")}.`}
    >
      {/* Names the value column, so the figure at the row end can never be read
          as the constituent's own move — the two differ, and both are on
          screen. */}
      <text x={W - 2} y={9} fontSize={8} fill={LABEL} textAnchor="end">
        gap vs sector
      </text>

      <line
        x1={x(sectorPct)}
        y1={headH - 2}
        x2={x(sectorPct)}
        y2={names.length * rowH + headH + 2}
        stroke="#9ca3af"
        strokeWidth={1}
      />
      {/*
        The reference line is labelled at the TOP, not under the axis. A sector
        near the low end of the shared domain put its label straight through the
        left domain tick — "Real2%tate -1.3%". Clamped so it also never runs
        into the "gap vs sector" header on the right.
      */}
      <text
        x={Math.min(Math.max(x(sectorPct), padL + 14), W - padR - 52)}
        y={9}
        fontSize={8}
        fill={LABEL}
        textAnchor="middle"
      >
        sector {spct(sectorPct)}
      </text>
      {/* Domain ends, so the shared scale is visible rather than merely true. */}
      <text x={padL} y={H - 6} fontSize={8} fill={LABEL} textAnchor="start">
        {spct(dLo, 0)}
      </text>
      <text x={W - padR} y={H - 6} fontSize={8} fill={LABEL} textAnchor="end">
        {spct(dHi, 0)}
      </text>
      <text x={(padL + W - padR) / 2} y={H - 6} fontSize={8} fill={LABEL} textAnchor="middle">
        each name&apos;s own move
      </text>

      {names.map((n, i) => {
        const cy = i * rowH + headH + 12;
        const gap = n.changePct - sectorPct;
        return (
          <g key={n.ticker}>
            <text x={0} y={cy + 3} fontSize={10} fill="#111827" className="font-mono">
              {n.ticker}
            </text>
            <line
              x1={x(sectorPct)}
              y1={cy}
              x2={x(n.changePct)}
              y2={cy}
              stroke={fillFor(gap)}
              strokeWidth={2}
            />
            <circle cx={x(n.changePct)} cy={cy} r={4} fill={fillFor(gap)} stroke="#ffffff" strokeWidth={1.5} />
            <text x={W - 2} y={cy + 3} fontSize={10} fill="#374151" textAnchor="end" fontWeight={600}>
              {spct(gap)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Movers: today against the 21-session run ────────────────────────────── */

/**
 * The question `webMoverTrend` was written to answer — "is this a break from
 * the name's recent direction, or more of the same?" — is a comparison of two
 * columns, so it wants a plane, not a list. The four quadrants ARE the reading,
 * and they are labelled in words rather than left to the reader to derive.
 */
export function ReversalScatter({
  points,
}: {
  points: { ticker: string; today: number; run: number }[];
}) {
  if (points.length === 0) return null;
  const W = 360;
  const H = 280;
  const padL = 38;
  const padR = 16;
  const padT = 20;
  const padB = 34;
  // Pad the domain so a point never sits on the frame and its label never
  // overflows the viewBox. The DATA extremes are what get printed on the axis,
  // not these padded edges — labelling the padding as "+28%" when no name
  // exceeded +23.5% reads as a figure from the data.
  const dataX = Math.max(...points.map((p) => Math.abs(p.run)), 1);
  const dataY = Math.max(...points.map((p) => Math.abs(p.today)), 1);
  const absX = dataX * 1.15;
  const absY = dataY * 1.15;
  const x = (v: number) => padL + ((v + absX) / (absX * 2)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v + absY) / (absY * 2)) * (H - padT - padB);

  /*
   * Ticker labels collide badly in the cluster near the origin — on
   * 2026-08-10, PANW, NTAP and CRWD overprinted into an unreadable smear.
   * Place each label greedily: preferred slot first, then the alternates, and
   * keep the first that clears every label already placed. Deterministic, so
   * the server and any re-render agree.
   */
  const CH = 5.1; // approximate advance width at fontSize 9
  const LH = 9;
  const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];

  // Seed the occupied set with the chart's own furniture. Testing ticker labels
  // only against each other let them collide with the quadrant captions and the
  // axis extremes, which are just as unreadable when overprinted.
  const reserve = (cx: number, cy: number, chars: number, anchor: "start" | "middle" | "end") => {
    const w = chars * 4.8;
    const x1 = anchor === "start" ? cx : anchor === "middle" ? cx - w / 2 : cx - w;
    placed.push({ x1, y1: cy - LH, x2: x1 + w, y2: cy + 2 });
  };
  reserve(padL + 2, padT + 8, 19, "start"); // reversing a decline
  reserve(W - padR, padT + 8, 15, "end"); // extending a run
  reserve(padL + 2, H - padB - 3, 19, "start"); // extending a decline
  reserve(W - padR, H - padB - 3, 14, "end"); // breaking a run
  reserve(x(-dataX), y(0) + 11, 5, "middle");
  reserve(x(dataX), y(0) + 11, 5, "middle");
  reserve(x(0) - 5, y(dataY) + 3, 5, "end");
  reserve(x(0) - 5, y(-dataY) + 3, 5, "end");
  const labels = [...points]
    // Place the extremes first: they are the ones the reader is looking for, so
    // they get their preferred slot and the cluster works around them.
    .sort((a, b) => Math.abs(b.today) - Math.abs(a.today))
    .map((p) => {
      const cx = x(p.run);
      const cy = y(p.today);
      const w = p.ticker.length * CH;
      const slots: { tx: number; ty: number; anchor: "middle" | "start" | "end" }[] = [
        { tx: cx, ty: cy - 8, anchor: "middle" },
        { tx: cx, ty: cy + 14, anchor: "middle" },
        { tx: cx + 7, ty: cy + 3, anchor: "start" },
        { tx: cx - 7, ty: cy + 3, anchor: "end" },
        { tx: cx, ty: cy - 18, anchor: "middle" },
        { tx: cx, ty: cy + 24, anchor: "middle" },
      ];
      for (const s of slots) {
        const x1 = s.anchor === "middle" ? s.tx - w / 2 : s.anchor === "start" ? s.tx : s.tx - w;
        const box = { x1, y1: s.ty - LH, x2: x1 + w, y2: s.ty + 2 };
        const overlaps = placed.some(
          (q) => box.x1 < q.x2 && box.x2 > q.x1 && box.y1 < q.y2 && box.y2 > q.y1,
        );
        const inFrame = box.x1 >= 0 && box.x2 <= W && box.y1 >= 0 && box.y2 <= H - padB + 8;
        if (!overlaps && inFrame) {
          placed.push(box);
          return { ...p, cx, cy, ...s };
        }
      }
      // Every slot was taken. Drop the label rather than overprint — the dot
      // stays, and the table below carries the name.
      return { ...p, cx, cy, tx: null as number | null, ty: 0, anchor: "middle" as const };
    });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-lg h-auto"
      role="img"
      aria-label={`Today's move against the 21-session move for ${points.length} names. ${points
        .map((p) => `${p.ticker} ${spct(p.today)} today on a ${spct(p.run)} run`)
        .join("; ")}. The full figures are in the table below.`}
    >
      <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke={GRID} strokeWidth={1} />
      <line x1={x(0)} y1={padT} x2={x(0)} y2={H - padB} stroke={GRID} strokeWidth={1} />

      {/* `LABEL` (4.63:1), not gray-400 (2.43:1). This component's whole claim
          is that the quadrants ARE the reading, which makes these load-bearing
          text rather than chrome. */}
      <text x={W - padR} y={padT + 8} fontSize={9} fill={LABEL} textAnchor="end">
        extending a run
      </text>
      <text x={padL + 2} y={padT + 8} fontSize={9} fill={LABEL}>
        reversing a decline
      </text>
      <text x={padL + 2} y={H - padB - 3} fontSize={9} fill={LABEL}>
        extending a decline
      </text>
      <text x={W - padR} y={H - padB - 3} fontSize={9} fill={LABEL} textAnchor="end">
        breaking a run
      </text>

      {/* Axis extremes, so the plane has a scale rather than only a shape. */}
      <text x={x(-dataX)} y={y(0) + 11} fontSize={9} fill={LABEL} textAnchor="middle">
        {spct(-dataX, 0)}
      </text>
      <text x={x(dataX)} y={y(0) + 11} fontSize={9} fill={LABEL} textAnchor="middle">
        {spct(dataX, 0)}
      </text>
      <text x={x(0) - 5} y={y(dataY) + 3} fontSize={9} fill={LABEL} textAnchor="end">
        {spct(dataY, 0)}
      </text>
      <text x={x(0) - 5} y={y(-dataY) + 3} fontSize={9} fill={LABEL} textAnchor="end">
        {spct(-dataY, 0)}
      </text>

      {labels.map((p) => (
        <g key={p.ticker}>
          <circle cx={p.cx} cy={p.cy} r={4.5} fill={fillFor(p.today)} stroke="#ffffff" strokeWidth={2} />
          {p.tx != null && (
            <text x={p.tx} y={p.ty} fontSize={9} fill="#374151" textAnchor={p.anchor} className="font-mono">
              {p.ticker}
            </text>
          )}
        </g>
      ))}

      <text x={W / 2} y={H - 4} fontSize={9} fill={LABEL} textAnchor="middle">
        21-session move
      </text>
      <text
        x={10}
        y={H / 2}
        fontSize={9}
        fill={LABEL}
        textAnchor="middle"
        transform={`rotate(-90 10 ${H / 2})`}
      >
        today
      </text>
    </svg>
  );
}
