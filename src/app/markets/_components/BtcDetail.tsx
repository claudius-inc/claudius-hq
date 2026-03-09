"use client";

import useSWR from "swr";
import { Modal } from "@/components/ui/Modal";
import {
  TrendingUp,
  AlertTriangle,
  Shield,
  Target,
} from "lucide-react";

interface BacktestTouch {
  date: string;
  price: number;
  duration: string;
  peakPrice: number;
  returnPct: number;
}

interface BtcData {
  livePrice: number;
  change24h: number;
  changePercent: number;
  wma200: number;
  distancePercent: number;
  sma200d: number;
  mayerMultiple: number;
  backtestTouches: BacktestTouch[];
}

interface BtcDetailProps {
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

function AlertZone({ distancePercent }: { distancePercent: number }) {
  let color = "bg-emerald-50 border-emerald-200 text-emerald-800";
  let text = "Safe Zone";
  let desc = `${distancePercent.toFixed(1)}% above 200WMA`;

  if (distancePercent < 15) {
    color = "bg-red-50 border-red-200 text-red-800";
    text = "⚠️ Approaching Cycle Floor";
    desc = `Only ${distancePercent.toFixed(1)}% above 200WMA`;
  } else if (distancePercent < 30) {
    color = "bg-amber-50 border-amber-200 text-amber-800";
    text = "Caution Zone";
    desc = `${distancePercent.toFixed(1)}% above 200WMA`;
  }

  return (
    <div className={`${color} rounded-lg p-3 border`}>
      <div className="font-semibold text-sm">{text}</div>
      <div className="text-xs opacity-80">{desc}</div>
    </div>
  );
}

function MayerZone({ mayer }: { mayer: number }) {
  if (mayer < 0.8) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        <div className="text-emerald-800 font-semibold text-sm">🟢 Buy Zone</div>
        <div className="text-xs text-emerald-600">Mayer &lt; 0.8 — historically undervalued</div>
      </div>
    );
  }
  if (mayer > 2.4) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
        <div className="text-red-800 font-semibold text-sm">🔴 Sell Zone</div>
        <div className="text-xs text-red-600">Mayer &gt; 2.4 — bubble territory</div>
      </div>
    );
  }
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="text-gray-800 font-semibold text-sm">🟡 Normal Zone</div>
      <div className="text-xs text-gray-600">Mayer 0.8–2.4 — fair value range</div>
    </div>
  );
}

export function BtcDetail({ open, onClose }: BtcDetailProps) {
  const { data, isLoading } = useSWR<BtcData>(
    open ? "/api/btc" : null,
    fetcher,
  );

  return (
    <Modal open={open} onClose={onClose} title="Bitcoin Analysis">
      <div className="space-y-6">
        {/* Price Card */}
        <div className="rounded-lg border bg-gradient-to-br from-orange-50 to-amber-50 p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500 mb-1">BTC Price</div>
              {isLoading ? (
                <div className="h-8 w-36 bg-gray-200 rounded animate-pulse" />
              ) : data ? (
                <div className="text-2xl font-bold text-gray-900">{formatUsd(data.livePrice)}</div>
              ) : (
                <div className="text-2xl font-bold text-gray-400">—</div>
              )}
            </div>
            <div className="text-right">
              {data && (
                <div className={`text-sm font-medium ${data.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {data.changePercent >= 0 ? "+" : ""}{data.changePercent.toFixed(2)}%
                </div>
              )}
              {data && (
                <div className="text-xs text-gray-500 mt-1">
                  24h: {data.change24h >= 0 ? "+" : ""}{formatUsd(data.change24h)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alert Zone */}
        {data && <AlertZone distancePercent={data.distancePercent} />}

        {/* Key Metrics Grid */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-gray-500" />
            Cycle Indicators
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-[10px] text-gray-500 mb-1">200-Week MA</div>
              {isLoading ? (
                <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
              ) : data ? (
                <>
                  <div className="text-lg font-bold text-cyan-600">{formatUsd(data.wma200)}</div>
                  <div className="text-[10px] text-gray-500">Cycle floor indicator</div>
                </>
              ) : (
                <div className="text-lg font-bold text-gray-400">—</div>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-[10px] text-gray-500 mb-1">Distance from 200WMA</div>
              {isLoading ? (
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
              ) : data ? (
                <>
                  <div className="text-lg font-bold text-gray-900">+{data.distancePercent.toFixed(1)}%</div>
                  <div className="text-[10px] text-gray-500">{data.distancePercent > 30 ? "Safe buffer" : data.distancePercent > 15 ? "Getting closer" : "Watch closely!"}</div>
                </>
              ) : (
                <div className="text-lg font-bold text-gray-400">—</div>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-[10px] text-gray-500 mb-1">Mayer Multiple</div>
              {isLoading ? (
                <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
              ) : data ? (
                <>
                  <div className={`text-lg font-bold ${data.mayerMultiple < 0.8 ? "text-emerald-600" : data.mayerMultiple > 2.4 ? "text-red-600" : "text-amber-600"}`}>
                    {data.mayerMultiple.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-gray-500">Price ÷ 200-Day MA</div>
                </>
              ) : (
                <div className="text-lg font-bold text-gray-400">—</div>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-[10px] text-gray-500 mb-1">200-Day SMA</div>
              {isLoading ? (
                <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
              ) : data ? (
                <>
                  <div className="text-lg font-bold text-gray-900">{formatUsd(data.sma200d)}</div>
                  <div className="text-[10px] text-gray-500">Mayer base</div>
                </>
              ) : (
                <div className="text-lg font-bold text-gray-400">—</div>
              )}
            </div>
          </div>
        </div>

        {/* Mayer Zone */}
        {data && <MayerZone mayer={data.mayerMultiple} />}

        {/* 200WMA Backtest */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            200WMA Touch History
          </h2>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-emerald-800">Hit Rate</span>
              <span className="text-sm font-bold text-emerald-700">4/4 (100%)</span>
            </div>
            <div className="text-[10px] text-emerald-600 mt-0.5">
              Every touch of 200WMA marked a generational bottom
            </div>
          </div>
          {data?.backtestTouches && (
            <div className="space-y-2">
              {data.backtestTouches.slice(0, 4).map((touch) => (
                <div key={touch.date} className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                  <div>
                    <div className="text-xs font-medium text-gray-900">{touch.date}</div>
                    <div className="text-[10px] text-gray-500">{formatUsd(touch.price)} → {formatUsd(touch.peakPrice)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-600">+{touch.returnPct.toLocaleString()}%</div>
                    <div className="text-[10px] text-gray-400">{touch.duration}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quantum Risk */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Quantum Risk
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="space-y-2 text-xs text-gray-700">
              <p><span className="font-medium">Timeline:</span> 5-15 year fuse — not imminent but real</p>
              <p><span className="font-medium">Vulnerability:</span> ECDSA signatures (all BTC transactions)</p>
              <p><span className="font-medium">Defense:</span> BIP-360 proposed for quantum-resistant outputs</p>
              <p><span className="font-medium">Implication:</span> One reason Dalio frames allocation as &ldquo;gold <em>or</em> alternative money&rdquo;</p>
            </div>
          </div>
        </div>

        {/* Dalio Framework */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            Position Sizing
          </h2>
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
            <p>• Within Dalio&apos;s 10-15% &ldquo;hard money&rdquo; bucket</p>
            <p>• BTC: superior portability, fixed supply math</p>
            <p>• Gold: 5,000 years track record, zero tech risk</p>
            <p>• Recommend: BTC 3-8% of total portfolio max</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
