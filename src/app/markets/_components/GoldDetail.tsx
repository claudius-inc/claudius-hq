"use client";

import useSWR from "swr";
import { Modal } from "@/components/ui/Modal";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Scale,
  AlertTriangle,
} from "lucide-react";

interface GoldData {
  livePrice: number | null;
  dxy: { price: number; changePercent: number } | null;
  realYields: { value: number } | null;
  gld: { price: number; changePercent: number; volume?: number } | null;
  analysis: {
    ath: number | null;
    athDate: string | null;
    keyLevels?: Array<{ level: number; significance: string }>;
    scenarios?: Array<{ name: string; target: number; probability: number; thesis: string }>;
    thesisNotes?: string;
  } | null;
  flows?: Array<{ date: string; shares: number; value: number }>;
}

interface GoldDetailProps {
  open: boolean;
  onClose: () => void;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatUsd(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function GoldDetail({ open, onClose }: GoldDetailProps) {
  const { data, isLoading } = useSWR<GoldData>(
    open ? "/api/gold" : null,
    fetcher,
  );

  const goldPrice = data?.livePrice;
  const goldAth = data?.analysis?.ath;
  const athDist = goldPrice && goldAth ? ((goldPrice - goldAth) / goldAth) * 100 : null;

  return (
    <Modal open={open} onClose={onClose} title="Gold Analysis">
      <div className="space-y-6">
        {/* Price Card */}
        <div className="rounded-lg border bg-gradient-to-br from-amber-50 to-yellow-50 p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500 mb-1">Gold Spot</div>
              {isLoading ? (
                <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
              ) : goldPrice ? (
                <div className="text-2xl font-bold text-gray-900">{formatUsd(goldPrice)}</div>
              ) : (
                <div className="text-2xl font-bold text-gray-400">—</div>
              )}
            </div>
            <div className="text-right">
              {data?.gld && (
                <div className={`text-sm font-medium ${data.gld.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  GLD {data.gld.changePercent >= 0 ? "+" : ""}{data.gld.changePercent.toFixed(2)}%
                </div>
              )}
              {athDist !== null && (
                <div className={`text-xs mt-1 ${athDist >= 0 ? "text-emerald-600" : "text-gray-500"}`}>
                  {athDist >= 0 ? "🏆 New ATH" : `${athDist.toFixed(1)}% from ATH`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Correlations */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Scale className="w-4 h-4 text-gray-500" />
            Key Correlations
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-[10px] text-gray-500 mb-1">DXY (Inverse)</div>
              {isLoading ? (
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
              ) : data?.dxy ? (
                <>
                  <div className="text-lg font-bold text-gray-900">{data.dxy.price.toFixed(1)}</div>
                  <div className={`text-[10px] ${data.dxy.changePercent <= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {data.dxy.changePercent >= 0 ? "+" : ""}{data.dxy.changePercent.toFixed(2)}%
                    {data.dxy.changePercent <= 0 ? " ✓ bullish" : " ✗ headwind"}
                  </div>
                </>
              ) : (
                <div className="text-lg font-bold text-gray-400">—</div>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-[10px] text-gray-500 mb-1">Real Yields (Inverse)</div>
              {isLoading ? (
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
              ) : data?.realYields ? (
                <>
                  <div className={`text-lg font-bold ${data.realYields.value < 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {data.realYields.value.toFixed(2)}%
                  </div>
                  <div className={`text-[10px] ${data.realYields.value < 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {data.realYields.value < 0 ? "Negative = bullish" : "Positive = headwind"}
                  </div>
                </>
              ) : (
                <div className="text-lg font-bold text-gray-400">—</div>
              )}
            </div>
          </div>
        </div>

        {/* Dalio Framework */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Dalio Framework
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <blockquote className="text-xs text-gray-700 italic mb-2">
              &ldquo;If you don&apos;t own gold, you know neither history nor economics.&rdquo;
            </blockquote>
            <div className="text-xs text-gray-600 space-y-1">
              <p>• 10-15% allocation in &ldquo;alternative money&rdquo; (gold + BTC)</p>
              <p>• Gold = 5,000 years of track record, zero counterparty risk</p>
              <p>• Thrives when real yields are negative (financial repression)</p>
            </div>
          </div>
        </div>

        {/* Key Levels */}
        {data?.analysis?.keyLevels && data.analysis.keyLevels.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-gray-500" />
              Key Levels
            </h2>
            <div className="space-y-2">
              {data.analysis.keyLevels.map((level, i) => {
                const isAbove = goldPrice && goldPrice >= level.level;
                return (
                  <div key={i} className={`flex items-center justify-between rounded-lg p-2.5 border ${isAbove ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}>
                    <div className="flex items-center gap-2">
                      {isAbove ? (
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 text-gray-400" />
                      )}
                      <span className="text-xs font-medium text-gray-900">{formatUsd(level.level)}</span>
                    </div>
                    <span className="text-xs text-gray-500">{level.significance}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scenarios */}
        {data?.analysis?.scenarios && data.analysis.scenarios.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Scenarios</h2>
            <div className="space-y-2">
              {data.analysis.scenarios.map((scenario, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-gray-900">{scenario.name}</span>
                    <span className="text-xs text-gray-500">{scenario.probability}% prob</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">{scenario.thesis}</span>
                    <span className="text-xs font-medium text-amber-600">{formatUsd(scenario.target)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Thesis Notes */}
        {data?.analysis?.thesisNotes && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Thesis Notes</h2>
            <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
              {data.analysis.thesisNotes}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
