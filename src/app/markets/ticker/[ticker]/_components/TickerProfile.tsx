"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Sparkles } from "lucide-react";
import type { TickerProfile as TickerProfileData } from "@/lib/ticker-ai";
import type { TickerMetric } from "@/db/schema";
import { useToast } from "@/components/ui/Toast";
import { EditTickerProfileModal } from "./EditTickerProfileModal";

interface TickerProfileProps {
  ticker: string;
  profile: TickerProfileData;
  profileGeneratedAt: string | null;
  metrics: TickerMetric | null;
  description: string | null;
}

const QUALITY_LABEL: Record<string, string> = {
  ok: "data ok",
  partial: "partial data",
  failed: "fetch failed",
};

const QUALITY_CLS: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-gray-100 text-gray-500 border-gray-200",
};

function ScoreBadge({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value === null) {
    return (
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">
          {label}
        </span>
        <span className="text-xl font-semibold text-gray-300">—</span>
      </div>
    );
  }
  const v = Math.round(value);
  const cls =
    v >= 70
      ? "text-emerald-700"
      : v >= 40
        ? "text-amber-700"
        : "text-gray-500";
  return (
    <div className="flex flex-col items-start">
      <span className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <span className={`text-xl font-semibold tabular-nums ${cls}`}>{v}</span>
    </div>
  );
}

function ScoresBlock({ metrics }: { metrics: TickerMetric }) {
  const quality = metrics.dataQuality;
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-6">
        <ScoreBadge label="Momentum" value={metrics.momentumScore} />
        <ScoreBadge label="Technical" value={metrics.technicalScore} />
      </div>
      <span
        className={`inline-flex items-center px-2 py-0.5 text-[10px] rounded border ${QUALITY_CLS[quality] || QUALITY_CLS.ok}`}
      >
        {QUALITY_LABEL[quality] || quality}
      </span>
    </div>
  );
}

const SEGMENT_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-orange-500",
];

function isEmpty(p: TickerProfileData): boolean {
  return (
    !p.revenueModel &&
    !p.cyclicality &&
    !p.customerConcentration &&
    (!p.revenueSegments || p.revenueSegments.length === 0) &&
    (!p.tailwinds || p.tailwinds.length === 0) &&
    (!p.headwinds || p.headwinds.length === 0) &&
    (!p.threats || p.threats.length === 0) &&
    (!p.opportunities || p.opportunities.length === 0)
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wider text-gray-400">
      {children}
    </span>
  );
}

function RevenueSegmentBar({
  segments,
}: {
  segments: { item: string; pct: number }[];
}) {
  // Normalize so the bar fills 100% even if percentages don't quite add up.
  const total = segments.reduce((acc, s) => acc + s.pct, 0) || 1;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-gray-100 bg-gray-50">
        {segments.map((seg, i) => {
          const width = (seg.pct / total) * 100;
          return (
            <div
              key={`${seg.item}-${i}`}
              className={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
              style={{ width: `${width}%` }}
              title={`${seg.item}: ${seg.pct}%`}
            />
          );
        })}
      </div>
      <ul className="space-y-1">
        {segments.map((seg, i) => (
          <li
            key={`legend-${seg.item}-${i}`}
            className="flex items-center gap-2 text-xs text-gray-700"
          >
            <span
              className={`h-2 w-2 rounded-full ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}
            />
            <span className="flex-1 truncate">{seg.item}</span>
            <span className="tabular-nums text-gray-500">
              {seg.pct.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PointList({
  title,
  items,
}: {
  title: string;
  items: string[] | null;
}) {
  if (!items || items.length === 0) {
    return (
      <div className="space-y-1.5">
        <FieldLabel>{title}</FieldLabel>
        <p className="text-xs text-gray-300">—</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <FieldLabel>{title}</FieldLabel>
      <ul className="space-y-1.5">
        {items.map((p, i) => (
          <li
            key={`${title}-${i}`}
            className="flex items-start gap-2 text-sm text-gray-700"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
            <span className="flex-1 leading-snug">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatGeneratedAt(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    return d.toLocaleDateString("en-SG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export function TickerProfile({
  ticker,
  profile,
  profileGeneratedAt,
  metrics,
  description,
}: TickerProfileProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [redrafting, setRedrafting] = useState(false);

  const empty = isEmpty(profile);

  const onRedraft = async () => {
    if (redrafting) return;
    setRedrafting(true);
    try {
      const res = await fetch(`/api/tickers/${encodeURIComponent(ticker)}/redraft`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast(data.error || "Failed to draft profile", "error");
      } else {
        toast("Profile re-drafted via AI", "success");
        router.refresh();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setRedrafting(false);
    }
  };

  // Empty state — minimal CTA card. Still renders scores if we have them so
  // the user doesn't lose the watchlist scores when there's no profile yet.
  if (empty) {
    return (
      <>
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Profile
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                No qualitative profile yet for {ticker}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRedraft}
                disabled={redrafting}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {redrafting ? "Drafting…" : "Draft via AI"}
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit manually
              </button>
            </div>
          </div>
          {metrics && <ScoresBlock metrics={metrics} />}
          {description && (
            <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
          )}
        </div>
        <EditTickerProfileModal
          open={editOpen}
          ticker={ticker}
          onClose={() => setEditOpen(false)}
        />
      </>
    );
  }

  const generatedLabel = formatGeneratedAt(profileGeneratedAt);

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Profile
            </h2>
            {generatedLabel && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                last drafted {generatedLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRedraft}
              disabled={redrafting}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" />
              {redrafting ? "Drafting…" : "Re-draft"}
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
          </div>
        </div>

        {metrics && <ScoresBlock metrics={metrics} />}

        {description && (
          <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
        )}

        {/* Top block: revenue model | revenue segments */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            {profile.revenueModel && (
              <div className="space-y-1">
                <FieldLabel>Revenue model</FieldLabel>
                <p className="text-sm text-gray-700 leading-snug">
                  {profile.revenueModel}
                </p>
              </div>
            )}
            {profile.cyclicality && (
              <div className="space-y-1">
                <FieldLabel>Cyclicality</FieldLabel>
                <p className="text-sm text-gray-700 leading-snug">
                  {profile.cyclicality}
                </p>
              </div>
            )}
            {profile.customerConcentration && (
              <div className="space-y-1">
                <FieldLabel>Customer concentration</FieldLabel>
                <p className="text-sm text-gray-700 leading-snug">
                  {profile.customerConcentration}
                </p>
              </div>
            )}
          </div>
          {profile.revenueSegments && profile.revenueSegments.length > 0 && (
            <div className="space-y-2">
              <FieldLabel>Revenue segments</FieldLabel>
              <RevenueSegmentBar segments={profile.revenueSegments} />
            </div>
          )}
        </div>

        {/* SWOT block: 2x2 grid on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 pt-3 border-t border-gray-100">
          <PointList title="Tailwinds" items={profile.tailwinds} />
          <PointList title="Headwinds" items={profile.headwinds} />
          <PointList title="Opportunities" items={profile.opportunities} />
          <PointList title="Threats" items={profile.threats} />
        </div>
      </div>
      <EditTickerProfileModal
        open={editOpen}
        ticker={ticker}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}
