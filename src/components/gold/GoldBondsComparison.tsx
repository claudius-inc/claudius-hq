/**
 * Bonds vs Gold: The Second Casualty of War
 * Historical comparison showing why bonds fail during wartime/fiscal stress
 */

export function GoldBondsComparison() {
  const historicalData = [
    {
      period: "WWII & Aftermath (1942-1951)",
      event: "War financing, rate caps",
      bonds: "-30% real",
      gold: "Pegged at $35",
      winner: "Neither (gold confiscated)",
    },
    {
      period: "1970s Inflation (1971-1980)",
      event: "Nixon shock, oil crisis",
      bonds: "-40% real",
      gold: "+2,329%",
      winner: "gold",
    },
    {
      period: "2000s Crisis (2008-2011)",
      event: "GFC, QE programs",
      bonds: "+15% real",
      gold: "+166%",
      winner: "gold",
    },
    {
      period: "2022 Rate Shock",
      event: "Ukraine war, inflation",
      bonds: "-39% (30yr)",
      gold: "+1%",
      winner: "gold",
    },
    {
      period: "2023-2026 Current",
      event: "Fiscal dominance",
      bonds: "Volatile",
      gold: "+85%",
      winner: "gold",
    },
  ];

  return (
    <div className="card p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        The Second Casualty of War
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        &ldquo;In war, truth is the first casualty. Bonds are the second.&rdquo; — FFTT, 2022
      </p>

      {/* Key Insight */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="text-sm font-medium text-red-800 mb-2">
          Why Bonds Fail in Wartime
        </div>
        <div className="text-sm text-red-700 space-y-1">
          <p>War → Deficit spending → Debt issuance surge → Central bank monetizes → Inflation</p>
          <p>→ Rates capped below inflation → <strong>Bondholders subsidize the war</strong></p>
        </div>
      </div>

      {/* Historical Comparison */}
      <div className="space-y-3 mb-6">
        {historicalData.map((row) => (
          <div
            key={row.period}
            className={`rounded-lg p-3 border ${
              row.winner === "gold"
                ? "bg-amber-50 border-amber-200"
                : row.winner === "bonds"
                ? "bg-blue-50 border-blue-200"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-sm font-semibold text-gray-900">{row.period}</div>
                <div className="text-xs text-gray-500">{row.event}</div>
              </div>
              {row.winner === "gold" && (
                <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                  Gold wins
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Bonds: </span>
                <span className={row.bonds.includes("-") ? "text-red-600 font-medium" : "text-gray-700"}>
                  {row.bonds}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Gold: </span>
                <span className={row.gold.includes("+") ? "text-emerald-600 font-medium" : "text-gray-700"}>
                  {row.gold}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bond Categories */}
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Which Bonds Are Most Vulnerable
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="bg-red-50 rounded-lg p-3 border border-red-200">
          <div className="text-xs font-medium text-red-600 uppercase tracking-wider mb-2">
            High Risk
          </div>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• Long-duration sovereigns (30yr)</li>
            <li>• Investment-grade corporates</li>
            <li>• EM local currency bonds</li>
          </ul>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
          <div className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-2">
            Lower Risk
          </div>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• T-bills (short duration)</li>
            <li>• Floating rate notes</li>
            <li>• TIPS / I-bonds</li>
          </ul>
        </div>
      </div>

      {/* Implication */}
      <div className="bg-gray-50 rounded-lg p-4 border">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Portfolio Implication
        </div>
        <p className="text-sm text-gray-600">
          In a fiscal dominance regime, long bonds are not &ldquo;safe&rdquo; — they&apos;re a 
          guaranteed wealth transfer to the government via inflation. Gold (and BTC) 
          become the true safe haven when bonds are being repressed.
        </p>
      </div>
    </div>
  );
}
