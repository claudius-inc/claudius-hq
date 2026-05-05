import type { TickerMetric } from "@/db/schema";

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

export function TickerScores({
  metrics,
  description,
}: {
  metrics: TickerMetric;
  description?: string | null;
}) {
  const quality = metrics.dataQuality;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Watchlist Scores
        </h2>
        <span
          className={`inline-flex items-center px-2 py-0.5 text-[10px] rounded border ${QUALITY_CLS[quality] || QUALITY_CLS.ok}`}
        >
          {QUALITY_LABEL[quality] || quality}
        </span>
      </div>
      <div className="flex items-center gap-8">
        <ScoreBadge label="Momentum" value={metrics.momentumScore} />
        <ScoreBadge label="Technical" value={metrics.technicalScore} />
      </div>
      {description && (
        <p className="text-xs text-gray-500 mt-3 leading-relaxed">{description}</p>
      )}
    </div>
  );
}
