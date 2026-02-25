export function GoldDalioFramework() {
  return (
    <div className="card p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Dalio Allocation Framework
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Ray Dalio, Greenwich Economic Forum, Oct 2025
      </p>

      {/* Key Quote */}
      <blockquote className="border-l-4 border-amber-400 pl-4 py-2 mb-6 bg-amber-50 rounded-r-lg">
        <p className="text-sm text-gray-700 italic">
          &ldquo;If you look at it just from a strategic asset allocation
          perspective, you would probably have something like 15% of your
          portfolio in gold because it is the one asset that does very well
          when the typical parts of your portfolio go down, because the
          typical parts of your portfolio are so credit dependent.&rdquo;
        </p>
      </blockquote>

      {/* Allocation Comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Traditional All Weather
          </div>
          <div className="text-2xl font-bold text-gray-400">7.5%</div>
          <div className="text-xs text-gray-400 mt-1">
            Gold allocation (pre-2025)
          </div>
        </div>
        <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
          <div className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-2">
            Current Recommendation
          </div>
          <div className="text-2xl font-bold text-amber-600">10–15%</div>
          <div className="text-xs text-gray-500 mt-1">
            Gold or &ldquo;alternative money&rdquo; (incl. BTC)
          </div>
        </div>
      </div>

      {/* Why the Increase */}
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Why 2x the Normal Allocation
      </h3>
      <div className="space-y-3 mb-6">
        {[
          {
            title: "Bonds are broken as diversifiers",
            desc: "In 2022, stocks and bonds fell together. In a debt-laden world, bonds no longer reliably offset equity risk. Gold takes over that role.",
          },
          {
            title: "1970s monetary order parallel",
            desc: "US debt $37.8T, debt-to-GDP 125%, deficits 6-7% of GDP. Dalio sees this as analogous to Nixon ending the gold standard — a structural monetary transition.",
          },
          {
            title: "Central bank structural demand",
            desc: "China, Russia, India, Saudi Arabia accumulating gold reserves while reducing US Treasury holdings. Multi-decade trend, not a trade.",
          },
          {
            title: "Optimal risk math",
            desc: "Gold has ~0.0 correlation to equities over long periods and negative correlation during crises. Mean-variance optimization converges on 10-15% when bonds lose their hedge function.",
          },
        ].map((item) => (
          <div key={item.title} className="flex gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
            <div>
              <span className="text-sm font-medium text-gray-900">
                {item.title}:
              </span>{" "}
              <span className="text-sm text-gray-600">{item.desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 4-Season Framework */}
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        All Weather 4-Season Framework
      </h3>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[
          {
            season: "Rising Growth",
            assets: "Equities, Corp Credit",
            gold: false,
          },
          {
            season: "Falling Growth",
            assets: "Bonds, Gold",
            gold: true,
          },
          {
            season: "Rising Inflation",
            assets: "Commodities, Gold, TIPS",
            gold: true,
          },
          {
            season: "Falling Inflation",
            assets: "Bonds, Equities",
            gold: false,
          },
        ].map((s) => (
          <div
            key={s.season}
            className={`rounded-lg p-3 text-xs ${
              s.gold
                ? "bg-amber-50 border border-amber-200"
                : "bg-gray-50 border border-gray-200"
            }`}
          >
            <div className="font-semibold text-gray-900">{s.season}</div>
            <div className="text-gray-500 mt-0.5">{s.assets}</div>
            {s.gold && (
              <div className="text-amber-600 font-medium mt-1">
                Gold shines here
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Griffin Counter-view */}
      <div className="bg-gray-50 rounded-lg p-4 border">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Counter-view: Ken Griffin (Citadel)
        </div>
        <p className="text-sm text-gray-600">
          Called the gold rush &ldquo;concerning&rdquo; — not because gold is
          wrong, but because it signals capital fleeing US sovereign risk.
          Investors are de-dollarizing while still betting on American business.
          Both men see the same data; compatible conclusions from different
          angles.
        </p>
      </div>
    </div>
  );
}
