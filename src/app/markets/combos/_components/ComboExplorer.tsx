"use client";

import { useEffect, useMemo, useState } from "react";
import {
  decodePayload,
  scoreCombo,
  type ExplorerPanel,
  type ExplorerScore,
} from "@/lib/markets/combo-explorer";
import { GROUP_COLOR } from "../_lib/types";

/**
 * Tick indicators, see the answer.
 *
 * The panel is a ~1 MB quantized slice fetched once; scoring happens entirely in
 * this component, so a combination costs a few milliseconds and no round trip.
 * What makes that possible is that combination scoring never touches raw
 * indicator values — it averages cross-sectional rank-z columns and sorts — and
 * a rank in [-1, 1] survives int8 quantization with room to spare.
 *
 * The numbers here are INDICATIVE. The panel is downsampled in time, so a set
 * that looks good is a candidate for `run-perp-combo-search.ts` to confirm
 * against the full panel, the sealed holdout and the bootstrap null. The banner
 * says so, and it is not decoration: the difference between "found something"
 * and "confirmed something" is the entire discipline of this pipeline.
 */

const fmt = (v: number | undefined, d = 3) =>
  v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d);

interface Props {
  /** The set the daily report currently ships, pre-ticked on first load. */
  shipped: string[];
}

export default function ComboExplorer({ shipped }: Props) {
  const [panel, setPanel] = useState<ExplorerPanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(shipped));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/markets/combo-panel?horizon=6")
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string; hint?: string };
          throw new Error(body.hint ? `${body.error} Run: ${body.hint}` : body.error ?? `HTTP ${r.status}`);
        }
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (!cancelled) setPanel(decodePayload(buf));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signalIdx = useMemo(() => {
    if (!panel) return [];
    return panel.header.signals
      .map((n, i) => (selected.has(n) ? i : -1))
      .filter((i) => i >= 0);
  }, [panel, selected]);

  const score: ExplorerScore | null = useMemo(() => {
    if (!panel || signalIdx.length === 0) return null;
    return scoreCombo(panel, signalIdx);
  }, [panel, signalIdx]);

  // The incumbent, scored on identical rows, so every reading has a reference
  // point rather than being judged against zero.
  const incumbent: ExplorerScore | null = useMemo(() => {
    if (!panel) return null;
    const i = panel.header.signals.indexOf("shippedScore");
    return i >= 0 ? scoreCombo(panel, [i]) : null;
  }, [panel]);

  if (error) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        {error}
      </div>
    );
  }

  if (!panel) {
    return (
      <div className="min-h-[420px] animate-pulse rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="mb-3 h-4 w-56 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="h-7 rounded bg-neutral-100 dark:bg-neutral-900" />
          ))}
        </div>
      </div>
    );
  }

  const h = panel.header;
  const byGroup = new Map<string, string[]>();
  h.signals.forEach((n, i) => {
    const g = h.groups[i];
    const arr = byGroup.get(g);
    if (arr) arr.push(n);
    else byGroup.set(g, [n]);
  });

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const nMag = signalIdx.filter((i) => h.polarities[i] === "magnitude").length;
  const nDir = signalIdx.length - nMag;

  return (
    <div>
      {/* What this instrument is and is not. Stated before any number. */}
      <div className="mb-5 rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-[11px] leading-relaxed text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
        Indicative only. {h.nTimestamps} of {h.fullTimestamps} cross-sections (every{" "}
        {h.timeStride}
        {h.timeStride === 1 ? "st" : h.timeStride === 2 ? "nd" : h.timeStride === 3 ? "rd" : "th"}),{" "}
        {h.nRows.toLocaleString()} rows, {(100 * h.cryptoShare).toFixed(0)}% crypto, no sealed
        holdout and no bootstrap null. Use it to find candidates; confirm them with{" "}
        <code>run-perp-combo-search.ts</code>.
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── picker ── */}
        <div>
          {Array.from(byGroup.entries()).map(([group, names]) => (
            <div key={group} className="mb-4">
              <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-wider text-neutral-500">
                {group}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {names.map((name) => {
                  const i = h.signals.indexOf(name);
                  const on = selected.has(name);
                  const mag = h.polarities[i] === "magnitude";
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggle(name)}
                      aria-pressed={on}
                      className={
                        "rounded border px-2 py-1 font-mono text-[11px] transition-colors " +
                        (on
                          ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                          : (GROUP_COLOR[group] ?? "border-neutral-300 text-neutral-600") +
                            " hover:bg-neutral-100 dark:hover:bg-neutral-900")
                      }
                      title={mag ? "magnitude — gates the list" : "directional — orders the list"}
                    >
                      {name}
                      {mag && <span className="ml-1 opacity-60">◈</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-neutral-500">
            ◈ magnitude — predicts a move, not a direction. These GATE the list (top 30%) rather
            than joining the ordering; averaging them with a directional signal would tilt toward
            big movers without expressing a position.
          </p>
        </div>

        {/* ── readout ── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-neutral-500">
                {selected.size} selected
              </span>
              <span className="font-mono text-[10.5px] text-neutral-500">
                {nDir} order · {nMag} gate
              </span>
            </div>

            {signalIdx.length === 0 ? (
              <p className="text-sm text-neutral-500">Pick at least one indicator.</p>
            ) : nDir === 0 ? (
              <p className="text-sm text-neutral-500">
                Only magnitude indicators selected. These claim a move, not a direction, so IC and
                basket cannot be computed — add a directional one, or read the capture lift alone.
              </p>
            ) : null}

            {score && (
              <dl className="space-y-2 font-mono text-[11.5px]">
                <Row
                  label="IC"
                  value={fmt(score.ic)}
                  sub={`t ${fmt(score.icT, 2)}`}
                  strong={Math.abs(score.icT) > 2.807}
                />
                <Row label="capture" value={`${fmt(score.captureLift, 2)}×`} />
                <Row
                  label="basket"
                  value={`${fmt(score.basketExcess, 3)}%`}
                  sub={`t ${fmt(score.basketExcessT, 2)}`}
                />
                <Row
                  label="absolute"
                  value={`${fmt(score.basketAbs, 3)}%`}
                  sub={`base ${fmt(score.baselineAbs, 3)}%`}
                />
                <Row label="dateWin" value={`${fmt(score.dateWin, 1)}%`} />
                <Row label="samples" value={String(score.nTimestamps)} />
              </dl>
            )}

            {incumbent && (
              <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                <p className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-neutral-500">
                  incumbent · shippedScore
                </p>
                <p className="font-mono text-[11.5px] text-neutral-600 dark:text-neutral-400">
                  IC {fmt(incumbent.ic)} · t {fmt(incumbent.icT, 2)}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSelected(new Set(shipped))}
              className="mt-4 w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-[11px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
            >
              reset to shipped set
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right">
        <span
          className={
            strong
              ? "font-semibold text-neutral-900 dark:text-neutral-100"
              : "text-neutral-800 dark:text-neutral-200"
          }
        >
          {value}
        </span>
        {sub && <span className="ml-2 text-neutral-500">{sub}</span>}
      </dd>
    </div>
  );
}
