interface GoldPriceCardProps {
  livePrice: number | null | undefined;
  storedAth: number | null;
  athDate: string;
  editMode: boolean;
  ath: number | null;
  setAth: (value: number | null) => void;
  setAthDate: (value: string) => void;
  changeFromAth: number | null;
  gld: {
    price: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    change: number | null;
    changePercent: number | null;
  } | null;
}

export function GoldPriceCard({
  livePrice,
  storedAth,
  athDate,
  editMode,
  ath,
  setAth,
  setAthDate,
  changeFromAth,
  gld,
}: GoldPriceCardProps) {
  return (
    <div className="card p-6 mb-6 bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Current Price */}
        <div>
          <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
            Gold Spot (GC=F)
          </h3>
          <div className="text-3xl font-bold text-amber-900">
            ${livePrice?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "—"}
          </div>
          {gld?.change !== null && gld?.change !== undefined && (
            <div
              className={`text-sm mt-1 ${gld.change >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {gld.change >= 0 ? "+" : ""}
              {gld.changePercent?.toFixed(2)}% today
            </div>
          )}
        </div>

        {/* ATH */}
        <div>
          <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
            All-Time High
          </h3>
          {editMode ? (
            <div className="flex gap-2">
              <input
                type="number"
                value={ath || ""}
                onChange={(e) => setAth(parseFloat(e.target.value) || null)}
                placeholder="ATH Price"
                className="w-24 px-2 py-1 border rounded text-lg"
              />
              <input
                type="text"
                value={athDate}
                onChange={(e) => setAthDate(e.target.value)}
                placeholder="Date"
                className="w-28 px-2 py-1 border rounded text-sm"
              />
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-amber-900">
                ${storedAth?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "—"}
              </div>
              <div className="text-sm text-amber-600">
                {athDate || "—"}
              </div>
            </>
          )}
        </div>

        {/* Change from ATH */}
        <div>
          <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
            From ATH
          </h3>
          <div
            className={`text-2xl font-bold ${
              changeFromAth !== null
                ? changeFromAth >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
                : "text-gray-400"
            }`}
          >
            {changeFromAth !== null
              ? `${changeFromAth >= 0 ? "+" : ""}${changeFromAth.toFixed(2)}%`
              : "—"}
          </div>
        </div>

        {/* GLD Stats */}
        <div>
          <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
            GLD ETF
          </h3>
          <div className="text-2xl font-bold text-amber-900">
            ${gld?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "—"}
          </div>
          <div className="text-sm text-amber-600">
            52W: ${gld?.fiftyTwoWeekLow?.toFixed(0)} - ${gld?.fiftyTwoWeekHigh?.toFixed(0)}
          </div>
        </div>
      </div>
    </div>
  );
}
