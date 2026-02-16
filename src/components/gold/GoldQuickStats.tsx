import { GoldFlow } from "./types";

interface GoldQuickStatsProps {
  gld: {
    price: number | null;
    sharesOutstanding: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
  } | null;
  flows: GoldFlow[];
}

export function GoldQuickStats({ gld, flows }: GoldQuickStatsProps) {
  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">📊 Quick Stats</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-500 font-medium uppercase">GLD AUM (est)</div>
          <div className="text-xl font-bold text-gray-900">
            {gld?.price && gld?.sharesOutstanding
              ? `$${((gld.price * gld.sharesOutstanding) / 1e9).toFixed(1)}B`
              : "—"}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-500 font-medium uppercase">52W Range</div>
          <div className="text-lg font-bold text-gray-900">
            ${gld?.fiftyTwoWeekLow?.toFixed(0) || "—"} - $
            {gld?.fiftyTwoWeekHigh?.toFixed(0) || "—"}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-500 font-medium uppercase">Central Bank Buying</div>
          <div className="text-xl font-bold text-gray-900">
            {flows[0]?.centralBankTonnes
              ? `${flows[0].centralBankTonnes}t`
              : "—"}
          </div>
          <div className="text-xs text-gray-400">Quarterly</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-500 font-medium uppercase">Global ETF Flows</div>
          <div className="text-xl font-bold text-gray-900">
            {flows[0]?.globalEtfFlowUsd
              ? `$${(flows[0].globalEtfFlowUsd / 1e9).toFixed(1)}B`
              : "—"}
          </div>
          <div className="text-xs text-gray-400">Monthly</div>
        </div>
      </div>
    </div>
  );
}
