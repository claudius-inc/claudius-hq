"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export function WatchlistMethodologyModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        <Info size={12} />
        Methodology
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Scoring Methodology"
        size="lg"
      >
        <div className="space-y-4 text-sm">
          <p className="text-gray-600">
            Scores are computed for every ticker tracked in any theme. The list
            refreshes hourly on weekdays via GitHub Actions and on demand via the
            Refresh button.
          </p>

          <section>
            <h3 className="font-semibold mb-2">Momentum Score (0–100)</h3>
            <p className="text-gray-600 mb-2">
              How strongly and persistently the stock has been trending — beyond
              the raw recent move.
            </p>
            <ul className="space-y-1">
              <li>• <strong>40 pts</strong> — 12-month return excluding the most recent month (academic momentum factor).</li>
              <li>• <strong>25 pts</strong> — Position in 52-week range (price near highs scores higher).</li>
              <li>• <strong>20 pts</strong> — Trend persistence: % of last 60 trading days where close &gt; 20-day SMA.</li>
              <li>• <strong>15 pts</strong> — Distance above 200-day SMA (capped at +50%).</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Technical Score (0–100)</h3>
            <p className="text-gray-600 mb-2">
              Whether the chart is in good shape today — entry/hold quality.
            </p>
            <ul className="space-y-1">
              <li>• <strong>30 pts</strong> — MA stack (price &gt; SMA20 &gt; SMA50 &gt; SMA200).</li>
              <li>• <strong>25 pts</strong> — RSI(14) (peaks at 50–70; penalized at extremes).</li>
              <li>• <strong>20 pts</strong> — MACD (line &gt; signal &gt; 0 = full score).</li>
              <li>• <strong>15 pts</strong> — Volume trend (20-day avg vs 60-day avg).</li>
              <li>• <strong>10 pts</strong> — ADX(14) trend strength.</li>
            </ul>
          </section>

          <p className="text-xs text-gray-500">
            Missing inputs contribute 0 to that factor (no renormalization). Rows
            where Yahoo data is partially missing are marked with a small ⓘ.
          </p>
        </div>
      </Modal>
    </>
  );
}
