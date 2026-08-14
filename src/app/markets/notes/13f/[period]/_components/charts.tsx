import type {
  NameFlow,
  ConvictionMove,
  BookChange,
  Concentration,
  SectorShift,
} from "@/lib/notes/thirteenf/types";

/**
 * The five visuals of the quarterly 13F note, as server-rendered inline SVG.
 *
 * Same reasoning as the daily note's `charts.tsx`: each is a handful of marks on
 * a domain computed anyway, and a chart library would force `"use client"` and
 * reintroduce the layout shift `AGENTS.md` rules out.
 *
 * Every chart here prints its own values on the marks, so no companion table
 * repeats them — the `aria-label` carries the full reading for anyone who
 * cannot see the marks.
 *
 * One encoding decision runs through all five and is the reason the note reads
 * correctly: **money leaving a book and value lost from a book are drawn as
 * different things.** They share an arithmetic (they sum to the change in book
 * value) but not a meaning, and drawing them as two bars on one axis made
 * readers conclude that a manager who sold $8.8B had lost $8.8B. Gold is a
 * transfer; blue and green are gains and losses.
 */

const GRID = "#e5e7eb";
const RULE = "#d1d5db";
const LABEL = "#6b7280";
const INK = "#374151";
const UP = "#059669";
const DOWN = "#dc2626";
/** Gold: money moving in or out of the stock book. Never a gain or a loss. */
const MOVED = "#a16207";
/** Slate: value lost on positions still held. */
const LOST = "#5b7a8c";

const usdB = (n: number) => `${n < 0 ? "−" : "+"}$${(Math.abs(n) / 1e9).toFixed(2)}B`;

/* ── 1. Most bought, most sold ───────────────────────────────────────────── */

/**
 * Net dollars traded per name, buys above and sells below.
 *
 * The sub-line under every ticker is not a caption — it is the row's correction.
 * A net figure alone reads as agreement, and this quarter it usually is not:
 * Alphabet's entire net buy is Berkshire, and Delta shows one buyer against
 * seven sellers while the net points hard the other way. The counts and the
 * dominant manager therefore sit on the mark itself, where the number is.
 */
export function FlowChart({ bought, sold }: { bought: NameFlow[]; sold: NameFlow[] }) {
  const rows = [...bought, ...sold];
  const max = Math.max(...rows.map((r) => Math.abs(r.netUsd)));
  const CX = 310;
  const SCALE = 240 / (max / 1e9);
  const px = (usd: number) => (Math.abs(usd) / 1e9) * SCALE;

  const y = (i: number) => (i < 5 ? 50 + i * 30 : 210 + (i - 5) * 30);

  const note = (r: NameFlow) => {
    const who =
      r.topShare >= 0.9
        ? `${r.topMover} is all of it`
        : r.topShare > 0.5
          ? `${r.topMover} is ${Math.round(r.topShare * 100)}%`
          : "spread across the book";
    return `${r.buyers} bought · ${r.sellers} sold — ${who}`;
  };

  const reading = rows
    .map((r) => `${r.ticker} ${usdB(r.netUsd)}, ${r.buyers} bought and ${r.sellers} sold`)
    .join("; ");

  return (
    <svg viewBox="0 0 620 392" className="w-full h-auto" role="img" aria-label={`Net dollars traded per name. ${reading}.`}>
      <line x1={CX} y1={34} x2={CX} y2={348} stroke={RULE} strokeWidth={1} />
      <line x1={40} y1={190} x2={580} y2={190} stroke={GRID} strokeWidth={1} />

      {rows.map((r, i) => {
        const cy = y(i);
        const w = px(r.netUsd);
        const up = r.netUsd > 0;
        const barX = up ? CX : CX - w;
        return (
          <g key={`${r.ticker}-${i}`}>
            <rect x={barX} y={cy - 6} width={w} height={12} fill={up ? UP : DOWN} rx={1} />
            {/* Label mirrors the bar so both hug the origin and neither overlaps. */}
            <text
              x={up ? CX - 8 : CX + 8}
              y={cy + 4}
              textAnchor={up ? "end" : "start"}
              className="font-mono"
              fontSize={11}
              fill="#111827"
            >
              {r.ticker}
            </text>
            <text
              x={up ? CX - 8 : CX + 8}
              y={cy + 17}
              textAnchor={up ? "end" : "start"}
              fontSize={9}
              fill={LABEL}
            >
              {note(r)}
            </text>
            <text
              x={up ? CX + w + 7 : CX - w - 7}
              y={cy + 4}
              textAnchor={up ? "start" : "end"}
              className="font-mono tabular-nums"
              fontSize={10}
              fontWeight={600}
              fill={INK}
            >
              {usdB(r.netUsd)}
            </text>
          </g>
        );
      })}

      <text x={CX - 8} y={28} textAnchor="end" fontSize={10} fill={LABEL}>
        bought →
      </text>
      <text x={CX + 8} y={28} fontSize={10} fill={LABEL}>
        ← sold
      </text>
      <line x1={40} y1={348} x2={580} y2={348} stroke={RULE} />
      <text x={310} y={368} textAnchor="middle" fontSize={10} fill={INK}>
        net dollars traded across the 26 managers
      </text>
      <text x={310} y={384} textAnchor="middle" fontSize={9} fill={LABEL}>
        share-count change priced at the period-end mark, not the change in reported value
      </text>
    </svg>
  );
}

/* ── 2. Changes of mind ──────────────────────────────────────────────────── */

/**
 * Position weight before and after, as a dumbbell.
 *
 * Weight of the manager's OWN book rather than dollars: it is the only scale on
 * which a $3B fund and a $263B fund can appear in one chart, and the story is
 * how much of itself a manager reorganised around a name, not who spent most.
 */
export function ConvictionChart({ moves }: { moves: ConvictionMove[] }) {
  const X0 = 200;
  const SPAN = 370;
  const maxPct = 30;
  const x = (p: number) => X0 + (p / maxPct) * SPAN;
  const y = (i: number) => 46 + i * 26;

  const reading = moves
    .map((m) => `${m.manager} ${m.ticker} from ${m.fromPct}% to ${m.toPct}%`)
    .join("; ");

  return (
    <svg viewBox="0 0 620 345" className="w-full h-auto" role="img" aria-label={`Position weight before and after, as a share of each manager's own book. ${reading}.`}>
      {[0, 10, 20, 30].map((t) => (
        <g key={t}>
          <line
            x1={x(t)}
            y1={34}
            x2={x(t)}
            y2={292}
            stroke={t === 0 ? RULE : GRID}
            strokeDasharray={t === 0 ? undefined : "2 3"}
          />
          <text x={x(t)} y={308} textAnchor="middle" fontSize={10} fill={LABEL}>
            {t}%
          </text>
        </g>
      ))}

      <circle cx={205} cy={14} r={4.5} fill="#fff" stroke={LABEL} strokeWidth={1.5} />
      <text x={216} y={18} fontSize={10} fill={INK}>
        where it started
      </text>
      <circle cx={330} cy={14} r={4.5} fill={UP} />
      <text x={341} y={18} fontSize={10} fill={INK}>
        grew
      </text>
      <circle cx={400} cy={14} r={4.5} fill={DOWN} />
      <text x={411} y={18} fontSize={10} fill={INK}>
        shrank
      </text>

      {moves.map((m, i) => {
        const cy = y(i);
        const grew = m.toPct > m.fromPct;
        const xa = x(m.fromPct);
        const xb = x(m.toPct);
        return (
          <g key={`${m.manager}-${m.ticker}`}>
            <text x={168} y={cy + 4} textAnchor="end" className="font-mono" fontSize={10} fill={INK}>
              {m.manager} · {m.ticker}
            </text>
            <line x1={xa} y1={cy} x2={xb} y2={cy} stroke={grew ? UP : DOWN} strokeWidth={2} />
            <circle cx={xa} cy={cy} r={4.5} fill="#fff" stroke={LABEL} strokeWidth={1.5} />
            <circle cx={xb} cy={cy} r={5} fill={grew ? UP : DOWN} />
            <text
              x={grew ? xb + 11 : xb - 11}
              y={cy + 4}
              textAnchor={grew ? "start" : "end"}
              className="font-mono tabular-nums"
              fontSize={10}
              fontWeight={600}
              fill={INK}
            >
              {m.toPct}%
            </text>
          </g>
        );
      })}

      <line x1={X0} y1={292} x2={580} y2={292} stroke={RULE} />
      <text x={385} y={326} textAnchor="middle" fontSize={10} fill={INK}>
        share of that manager&apos;s own book
      </text>
    </svg>
  );
}

/* ── 3. Decision or market ───────────────────────────────────────────────── */

/**
 * A horizontal waterfall: each row starts at zero, steps left by what left the
 * book, then steps again by what value did, and ends at the change in book
 * value.
 *
 * Consecutive steps rather than parallel bars, deliberately. Drawn as two bars
 * on a shared axis, the gold and the blue read as two measurements of the same
 * quantity, and a reader concludes that selling $8.8B means losing $8.8B. As
 * steps in one calculation there is nothing to mistake for a second opinion.
 */
export function BookChangeChart({ changes }: { changes: BookChange[] }) {
  const CX = 521.5;
  const SCALE = 32.3;
  const x = (b: number) => CX + b * SCALE;
  const y = (i: number) => 58 + i * 26;

  const reading = changes
    .map(
      (c) =>
        `${c.manager} moved ${usdB(c.soldUsd)} out of the book and ${c.valueChangeUsd >= 0 ? "gained" : "lost"} ${usdB(
          Math.abs(c.valueChangeUsd),
        )} of value, ending at ${usdB(c.bookChangeUsd)}`,
    )
    .join("; ");

  return (
    <svg viewBox="0 0 660 350" className="w-full h-auto" role="img" aria-label={`Change in each manager's book, split into money that left the book and value gained or lost. ${reading}.`}>
      <rect x={150} y={10} width={10} height={9} fill={MOVED} />
      <text x={166} y={18} fontSize={10} fill={INK}>
        sold — money left the book
      </text>
      <rect x={330} y={10} width={10} height={9} fill={LOST} />
      <text x={346} y={18} fontSize={10} fill={INK}>
        value lost
      </text>
      <rect x={430} y={10} width={10} height={9} fill={UP} />
      <text x={446} y={18} fontSize={10} fill={INK}>
        value gained
      </text>

      {[-10, -5].map((t) => (
        <line key={t} x1={x(t)} y1={36} x2={x(t)} y2={306} stroke={GRID} strokeDasharray="2 3" />
      ))}
      <line x1={CX} y1={36} x2={CX} y2={306} stroke={RULE} strokeWidth={1.25} />

      {changes.map((c, i) => {
        const cy = y(i);
        const sold = c.soldUsd / 1e9;
        const val = c.valueChangeUsd / 1e9;
        const end = c.bookChangeUsd / 1e9;
        const goldFrom = Math.min(0, sold);
        const gained = val > 0;
        return (
          <g key={c.manager}>
            <text x={140} y={cy + 11} textAnchor="end" className="font-mono" fontSize={10.5} fill={INK}>
              {c.manager}
            </text>
            <rect x={x(goldFrom)} y={cy} width={Math.abs(sold) * SCALE} height={14} fill={MOVED} />
            {gained ? (
              // A gain retraces part of the gold rather than extending past it,
              // so it is inset — a give-back, not an overlap.
              <rect x={x(sold)} y={cy + 3} width={val * SCALE} height={8} fill={UP} />
            ) : (
              <rect x={x(sold + val)} y={cy} width={Math.abs(val) * SCALE} height={14} fill={LOST} />
            )}
            <line x1={x(end)} y1={cy - 4} x2={x(end)} y2={cy + 18} stroke="#111827" strokeWidth={2.5} />
            <text
              x={655}
              y={cy + 11}
              textAnchor="end"
              className="font-mono tabular-nums"
              fontSize={10}
              fontWeight={600}
              fill={INK}
            >
              {usdB(c.bookChangeUsd)}
            </text>
          </g>
        );
      })}

      <line x1={540} y1={8} x2={540} y2={21} stroke="#111827" strokeWidth={2.5} />
      <text x={548} y={18} fontSize={10} fill={INK}>
        where the book ended
      </text>

      {[
        [-10, "−$10B"],
        [-5, "−$5B"],
        [0, "0"],
      ].map(([v, t]) => (
        <text key={String(t)} x={x(Number(v))} y={322} textAnchor="middle" fontSize={10} fill={LABEL}>
          {t}
        </text>
      ))}
      <text x={360} y={342} textAnchor="middle" fontSize={10} fill={INK}>
        change in the value of the stock book
      </text>
    </svg>
  );
}

/* ── 4. How concentrated they are ────────────────────────────────────────── */

/**
 * Holdings needed to reach half the book, ranked, on a log axis.
 *
 * The count is printed on every bar because the axis is logarithmic — the shape
 * carries the distribution, the numeral carries the value, and neither has to
 * be read off the other. The shaded band is the finding: twenty-one managers
 * land under 24 and six land above 94, and nobody is in between.
 */
export function ConcentrationChart({ rows }: { rows: Concentration[] }) {
  const X0 = 150;
  const PER_DECADE = 182.5;
  const x = (n: number) => X0 + Math.log10(n) * PER_DECADE;
  const y = (i: number) => 44 + i * 12;
  const SPLIT = 30;

  const pickers = rows.filter((r) => r.holdingsToHalf < SPLIT).length;
  const quants = rows.length - pickers;

  return (
    <svg viewBox="0 0 620 400" className="w-full h-auto" role="img" aria-label={`Holdings needed to reach half of each manager's book, ranked. ${pickers} managers reach half their book within ${Math.max(...rows.filter((r) => r.holdingsToHalf < SPLIT).map((r) => r.holdingsToHalf))} names; ${quants} need ${Math.min(...rows.filter((r) => r.holdingsToHalf >= SPLIT).map((r) => r.holdingsToHalf))} or more. Icahn needs 2, Citadel needs 177.`}>
      <rect x={x(24)} y={38} width={x(94) - x(24)} height={330} fill={GRID} opacity={0.55} />
      <text x={(x(24) + x(94)) / 2} y={30} textAnchor="middle" fontSize={10} fill={INK}>
        nobody lands in here
      </text>

      <rect x={150} y={10} width={10} height={9} fill={MOVED} />
      <text x={166} y={18} fontSize={10} fill={INK}>
        stock pickers
      </text>
      <rect x={260} y={10} width={10} height={9} fill={LOST} />
      <text x={276} y={18} fontSize={10} fill={INK}>
        quant &amp; multi-strategy
      </text>

      <line x1={X0} y1={38} x2={X0} y2={368} stroke={RULE} />

      {rows.map((r, i) => {
        const cy = y(i);
        const w = x(r.holdingsToHalf) - X0;
        const picker = r.holdingsToHalf < SPLIT;
        return (
          <g key={r.manager}>
            <text x={140} y={cy + 7} textAnchor="end" className="font-mono" fontSize={10.5} fill={INK}>
              {r.manager}
            </text>
            <rect x={X0} y={cy} width={w} height={8} fill={picker ? MOVED : LOST} />
            <text
              x={X0 + w + 6}
              y={cy + 7}
              className="font-mono tabular-nums"
              fontSize={10}
              fontWeight={600}
              fill={INK}
            >
              {r.holdingsToHalf}
            </text>
          </g>
        );
      })}

      <line x1={X0} y1={368} x2={580} y2={368} stroke={RULE} />
      {[1, 3, 10, 30, 100].map((t) => (
        <text key={t} x={x(t)} y={382} textAnchor="middle" fontSize={10} fill={LABEL}>
          {t}
        </text>
      ))}
      <text x={365} y={396} textAnchor="middle" fontSize={10} fill={INK}>
        holdings needed to reach half the book — each step is roughly triple the last
      </text>
    </svg>
  );
}

/* ── 5. Where the money moved ────────────────────────────────────────────── */

/**
 * Sector weight change in percentage points.
 *
 * Diverging bars rather than a slope chart: six of the eleven sectors sit within
 * five points of one another, and paired lines collapse into an unreadable knot
 * at the bottom of the range. The label mirrors its bar so both hug the origin,
 * which also means the side a name sits on states its direction before the
 * number is read.
 */
export function SectorChart({ shifts }: { shifts: SectorShift[] }) {
  const CX = 250;
  const SCALE = 90;

  const reading = shifts.map((s) => `${s.sector} ${s.changePp > 0 ? "+" : "−"}${Math.abs(s.changePp)}`).join(", ");

  return (
    <svg viewBox="0 0 500 300" className="w-full h-auto" role="img" aria-label={`Change in each sector's share of the combined book, in percentage points: ${reading}.`}>
      <line x1={CX} y1={14} x2={CX} y2={262} stroke={RULE} strokeWidth={1} />

      {shifts.map((s, i) => {
        const cy = 21 + i * 22;
        const w = Math.abs(s.changePp) * SCALE;
        const up = s.changePp > 0;
        return (
          <g key={s.sector}>
            <rect x={up ? CX : CX - w} y={cy} width={w} height={12} fill={up ? UP : DOWN} />
            <text
              x={up ? CX - 8 : CX + 8}
              y={cy + 10}
              textAnchor={up ? "end" : "start"}
              className="font-mono"
              fontSize={10.5}
              fill={INK}
            >
              {s.sector}
            </text>
            <text
              x={up ? CX + w + 6 : CX - w - 6}
              y={cy + 10}
              textAnchor={up ? "start" : "end"}
              className="font-mono tabular-nums"
              fontSize={10}
              fontWeight={600}
              fill={INK}
            >
              {s.changePp > 0 ? "+" : "−"}
              {Math.abs(s.changePp).toFixed(2)}
            </text>
          </g>
        );
      })}

      <text x={CX - 8} y={276} textAnchor="end" fontSize={10} fill={LABEL}>
        ← money left
      </text>
      <text x={CX + 8} y={276} fontSize={10} fill={LABEL}>
        money arrived →
      </text>
      <text x={CX} y={294} textAnchor="middle" fontSize={10} fill={INK}>
        change in share of the combined book (percentage points)
      </text>
    </svg>
  );
}
