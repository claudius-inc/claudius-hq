"use client";

import useSWR from "swr";
import { Modal } from "@/components/ui/Modal";
import {
  TrendingUp,
  AlertTriangle,
  Shield,
  Landmark,
  Globe,
  Scale,
} from "lucide-react";
import type { RegimeData, MacroIndicator } from "./types";

interface RegimeDetailProps {
  open: boolean;
  onClose: () => void;
  regimeData: RegimeData | null;
  macroIndicators: MacroIndicator[];
}

interface GoldApiData {
  realYields?: { value: number };
  dxy?: { price: number };
  livePrice?: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Indicators {
  realYield: number | null;
  debtToGdp: number | null;
  deficitToGdp: number | null;
  dxy: number | null;
}

export function RegimeDetail({
  open,
  onClose,
  regimeData,
  macroIndicators,
}: RegimeDetailProps) {
  const { data: goldData } = useSWR<GoldApiData>(
    open ? "/api/gold" : null,
    fetcher,
  );

  const findIndicator = (id: string) => {
    const ind = macroIndicators.find((i) => i.id === id);
    return ind?.data?.current ?? null;
  };

  const rawDeficit = findIndicator("deficit-to-gdp");
  const indicators: Indicators = {
    realYield: goldData?.realYields?.value ?? regimeData?.indicators.realYield ?? null,
    debtToGdp: findIndicator("debt-to-gdp") ?? regimeData?.indicators.debtToGdp ?? null,
    deficitToGdp: rawDeficit !== null ? Math.abs(rawDeficit) : regimeData?.indicators.deficitToGdp ?? null,
    dxy: goldData?.dxy?.price ?? regimeData?.indicators.dxy ?? null,
  };

  return (
    <Modal open={open} onClose={onClose} title={regimeData?.name ?? "Regime Analysis"}>
      <div className="space-y-6">
        {/* Current Regime Banner */}
        {regimeData && (
          <div className={`rounded-lg p-4 border-2 ${regimeData.color}`}>
            <div className="flex items-center gap-3 mb-3">
              <Landmark className="w-5 h-5" />
              <div>
                <h2 className="text-lg font-bold">{regimeData.name}</h2>
                <p className="text-xs opacity-80">{regimeData.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {regimeData.implications.map((imp, i) => (
                <div key={i} className="text-xs bg-white/50 rounded px-2 py-1.5">
                  {imp}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financial Repression Indicators */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Scale className="w-4 h-4 text-gray-500" />
            Financial Repression Indicators
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <IndicatorCard
              label="Real Yield"
              value={indicators.realYield}
              format={(v) => `${v.toFixed(2)}%`}
              threshold={{ danger: 0, warning: 1 }}
              inverse
              description="10Y yield minus CPI"
            />
            <IndicatorCard
              label="Debt/GDP"
              value={indicators.debtToGdp}
              format={(v) => `${v.toFixed(0)}%`}
              threshold={{ danger: 120, warning: 100 }}
              description="US federal debt"
            />
            <IndicatorCard
              label="Deficit/GDP"
              value={indicators.deficitToGdp}
              format={(v) => `${v.toFixed(1)}%`}
              threshold={{ danger: 6, warning: 4 }}
              description="Annual fiscal deficit"
            />
            <IndicatorCard
              label="DXY"
              value={indicators.dxy}
              format={(v) => v.toFixed(1)}
              threshold={{ danger: 90, warning: 95 }}
              inverse
              description="Dollar index"
            />
          </div>

          {/* Repression Meter */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-gray-700">Repression Level</span>
              <span className="text-xs text-gray-500">
                {calculateRepressionLevel(indicators)}
              </span>
            </div>
            <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all"
                style={{ width: `${getRepressionPercent(indicators)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>Sound Money</span>
              <span>Moderate</span>
              <span>Repression</span>
            </div>
          </div>
        </div>

        {/* Regime History */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-500" />
            Regime History
          </h2>
          <div className="space-y-2">
            {[
              { period: "1942-1951", regime: "Financial Repression", realYield: "-3 to -5%", result: "Debt/GDP fell 70pts, bondholders lost 30% real", color: "border-red-300 bg-red-50" },
              { period: "1980-2000", regime: "Sound Money", realYield: "+3 to +5%", result: "Great bond bull market, 40-year rally", color: "border-emerald-300 bg-emerald-50" },
              { period: "2008-2021", regime: "ZIRP/QE", realYield: "0 to -1%", result: "Everything rally, asset inflation", color: "border-blue-300 bg-blue-50" },
              { period: "2022-Present", regime: "Fiscal Dominance", realYield: "-1 to +1%", result: "Bonds crashed 2022, gold/BTC outperform", color: "border-amber-300 bg-amber-50" },
            ].map((era) => (
              <div key={era.period} className={`rounded-lg p-3 border ${era.color}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs font-semibold text-gray-900">{era.period}</div>
                    <div className="text-[10px] text-gray-500">{era.regime}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-gray-700">Real Yield: {era.realYield}</div>
                  </div>
                </div>
                <div className="text-[10px] text-gray-600 mt-1">{era.result}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Asset Performance by Regime */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            Asset Performance by Regime
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 text-gray-500 font-medium">Regime</th>
                  <th className="text-center py-1.5 text-gray-500 font-medium">Bonds</th>
                  <th className="text-center py-1.5 text-gray-500 font-medium">Gold</th>
                  <th className="text-center py-1.5 text-gray-500 font-medium">Equities</th>
                  <th className="text-center py-1.5 text-gray-500 font-medium">Cash</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { regime: "Financial Repression", bonds: "🔴", gold: "🟢", equities: "🟡", cash: "🔴" },
                  { regime: "Fiscal Dominance", bonds: "🔴", gold: "🟢", equities: "🟡", cash: "🟡" },
                  { regime: "Sound Money", bonds: "🟢", gold: "🔴", equities: "🟢", cash: "🟢" },
                  { regime: "Deflation", bonds: "🟢", gold: "🟡", equities: "🔴", cash: "🟢" },
                ].map((row) => (
                  <tr key={row.regime} className="border-b border-gray-100">
                    <td className="py-1.5 font-medium text-gray-900">{row.regime}</td>
                    <td className="py-1.5 text-center">{row.bonds}</td>
                    <td className="py-1.5 text-center">{row.gold}</td>
                    <td className="py-1.5 text-center">{row.equities}</td>
                    <td className="py-1.5 text-center">{row.cash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[10px] text-gray-400 mt-1.5">
              🟢 Outperform | 🟡 Mixed | 🔴 Underperform
            </div>
          </div>
        </div>

        {/* War & Conflict Overlay */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            War & Conflict Overlay
          </h2>
          <blockquote className="border-l-4 border-red-400 pl-3 py-2 mb-3 bg-red-50 rounded-r-lg">
            <p className="text-xs text-gray-700 italic">
              &ldquo;In war, truth is the first casualty.&rdquo; — Aeschylus
            </p>
            <p className="text-xs text-gray-700 italic mt-1">
              &ldquo;Bonds are the second.&rdquo; — FFTT, 2022
            </p>
          </blockquote>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs font-medium text-gray-900 mb-1.5">Active Conflicts</div>
              <ul className="text-xs text-gray-600 space-y-0.5">
                <li>• Russia-Ukraine (2022-)</li>
                <li>• Israel-Gaza (2023-)</li>
                <li>• Red Sea disruption</li>
                <li>• Taiwan tensions</li>
              </ul>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs font-medium text-gray-900 mb-1.5">Fiscal Impact</div>
              <ul className="text-xs text-gray-600 space-y-0.5">
                <li>• Defense spending ↑</li>
                <li>• Supply chain inflation</li>
                <li>• Energy price volatility</li>
                <li>• De-dollarization pressure</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Regime Playbook */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            Regime Playbook
          </h2>
          <div className="space-y-3">
            {[
              { step: 1, title: "Avoid long-duration bonds", desc: "In repression, you\u2019re lending to the government at negative real rates" },
              { step: 2, title: "Overweight hard assets", desc: "Gold, commodities, real estate \u2014 things that can\u2019t be printed" },
              { step: 3, title: "Consider \u201calternative money\u201d", desc: "Dalio recommends 10-15% in gold + BTC as monetary hedge" },
              { step: 4, title: "Shorten duration on fixed income", desc: "T-bills, floating rate, TIPS \u2014 reduce interest rate sensitivity" },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <span className="text-amber-600 text-xs font-bold">{step}</span>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-900">{title}</div>
                  <div className="text-xs text-gray-500">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function IndicatorCard({
  label,
  value,
  format,
  threshold,
  inverse = false,
  description,
}: {
  label: string;
  value: number | null;
  format: (v: number) => string;
  threshold: { danger: number; warning: number };
  inverse?: boolean;
  description?: string;
}) {
  const getColor = () => {
    if (value === null) return "text-gray-400";
    const check = inverse ? -value : value;
    const t = inverse ? { danger: -threshold.danger, warning: -threshold.warning } : threshold;
    if (check >= t.danger) return "text-red-600";
    if (check >= t.warning) return "text-amber-600";
    return "text-emerald-600";
  };

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${getColor()}`}>
        {value !== null ? format(value) : "—"}
      </div>
      {description && <div className="text-[10px] text-gray-400 mt-0.5">{description}</div>}
    </div>
  );
}

function calculateRepressionLevel(indicators: Indicators): string {
  const { realYield, debtToGdp, deficitToGdp } = indicators;
  let score = 0;
  if (realYield !== null && realYield < 0) score += 2;
  if (realYield !== null && realYield < -1) score += 1;
  if (debtToGdp !== null && debtToGdp > 100) score += 2;
  if (debtToGdp !== null && debtToGdp > 120) score += 1;
  if (deficitToGdp !== null && deficitToGdp > 5) score += 2;
  if (deficitToGdp !== null && deficitToGdp > 7) score += 1;

  if (score >= 7) return "Severe";
  if (score >= 5) return "Elevated";
  if (score >= 3) return "Moderate";
  return "Low";
}

function getRepressionPercent(indicators: Indicators): number {
  const { realYield, debtToGdp, deficitToGdp } = indicators;
  let score = 0;
  if (realYield !== null) score += Math.max(0, Math.min(33, (0 - realYield) * 16.5));
  if (debtToGdp !== null) score += Math.max(0, Math.min(33, (debtToGdp - 80) * 0.83));
  if (deficitToGdp !== null) score += Math.max(0, Math.min(34, deficitToGdp * 5));
  return Math.min(100, score);
}
