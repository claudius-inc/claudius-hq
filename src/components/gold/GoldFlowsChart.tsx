import { GoldFlow } from "./types";

interface GoldFlowsChartProps {
  flows: GoldFlow[];
}

export function GoldFlowsChart({ flows }: GoldFlowsChartProps) {
  // Calculate cumulative flows for chart
  const flowsForChart = [...flows].reverse();
  const cumulativeFlows: { date: string; cumulative: number; shares: number | null }[] = [];
  let cumulative = 0;
  for (const flow of flowsForChart) {
    if (flow.estimatedFlowUsd) {
      cumulative += flow.estimatedFlowUsd;
    }
    cumulativeFlows.push({
      date: flow.date,
      cumulative,
      shares: flow.gldSharesOutstanding,
    });
  }

  return (
    <div className="card p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">📈 GLD ETF Flows</h2>
      {flows && flows.length > 0 ? (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-amber-50 rounded-lg p-4">
              <div className="text-xs text-amber-600 font-medium uppercase">Latest NAV</div>
              <div className="text-xl font-bold text-amber-900">
                ${flows[0]?.gldNav?.toFixed(2) || "—"}
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <div className="text-xs text-amber-600 font-medium uppercase">Shares Outstanding</div>
              <div className="text-xl font-bold text-amber-900">
                {flows[0]?.gldSharesOutstanding
                  ? (flows[0].gldSharesOutstanding / 1e6).toFixed(1) + "M"
                  : "—"}
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <div className="text-xs text-amber-600 font-medium uppercase">Today&apos;s Flow</div>
              <div
                className={`text-xl font-bold ${
                  (flows[0]?.estimatedFlowUsd || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {flows[0]?.estimatedFlowUsd
                  ? `${flows[0].estimatedFlowUsd >= 0 ? "+" : ""}$${(flows[0].estimatedFlowUsd / 1e6).toFixed(1)}M`
                  : "—"}
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <div className="text-xs text-amber-600 font-medium uppercase">
                {cumulativeFlows.length}D Cumulative
              </div>
              <div
                className={`text-xl font-bold ${
                  cumulative >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {cumulative >= 0 ? "+" : ""}${(cumulative / 1e9).toFixed(2)}B
              </div>
            </div>
          </div>

          {/* Flow Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Date</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">NAV</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Shares (M)</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Est. Flow</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Source</th>
                </tr>
              </thead>
              <tbody>
                {flows.slice(0, 14).map((flow) => (
                  <tr key={flow.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-900">{flow.date}</td>
                    <td className="py-2 px-3 text-right text-gray-700">
                      ${flow.gldNav?.toFixed(2) || "—"}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-700">
                      {flow.gldSharesOutstanding
                        ? (flow.gldSharesOutstanding / 1e6).toFixed(2)
                        : "—"}
                    </td>
                    <td
                      className={`py-2 px-3 text-right ${
                        (flow.estimatedFlowUsd || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {flow.estimatedFlowUsd
                        ? `${flow.estimatedFlowUsd >= 0 ? "+" : ""}$${(flow.estimatedFlowUsd / 1e6).toFixed(1)}M`
                        : "—"}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-400 text-xs">
                      {flow.source || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-gray-400 text-sm">No flow data. Click &quot;Sync GLD Data&quot; to fetch.</p>
      )}
    </div>
  );
}
