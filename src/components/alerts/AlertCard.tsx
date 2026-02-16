import Link from "next/link";
import { Bell, Edit2, Eye, Pause, Play, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import {
  StockAlert,
  ZoneStatus,
  formatPrice,
  formatPct,
  getZoneStatus,
} from "./types";

interface AlertCardProps {
  alert: StockAlert;
  onEdit: (alert: StockAlert) => void;
  onToggleStatus: (alert: StockAlert) => void;
  onDelete: (id: number) => void;
}

export function AlertCard({
  alert,
  onEdit,
  onToggleStatus,
  onDelete,
}: AlertCardProps) {
  const zoneStatus: ZoneStatus = getZoneStatus(alert);

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <Link
          href={`/markets/${alert.ticker.toLowerCase()}`}
          className="flex flex-col hover:text-blue-600"
        >
          <span className="font-medium">{alert.ticker}</span>
          {alert.companyName && (
            <span className="text-xs text-gray-500 truncate max-w-[150px]">
              {alert.companyName}
            </span>
          )}
        </Link>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="font-medium">{formatPrice(alert.currentPrice)}</div>
        <div
          className={`text-xs ${
            (alert.dayChange ?? 0) >= 0 ? "text-green-600" : "text-red-600"
          }`}
        >
          {formatPct(alert.dayChange)}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        {alert.accumulateLow !== null && alert.accumulateHigh !== null ? (
          <span
            className={`px-2 py-1 rounded text-xs ${
              zoneStatus === "accumulate"
                ? "bg-amber-100 text-amber-700 font-medium"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {formatPrice(alert.accumulateLow)} -{" "}
            {formatPrice(alert.accumulateHigh)}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {alert.strongBuyLow !== null && alert.strongBuyHigh !== null ? (
          <span
            className={`px-2 py-1 rounded text-xs ${
              zoneStatus === "strong-buy"
                ? "bg-emerald-100 text-emerald-700 font-medium"
                : zoneStatus === "below-strong-buy"
                  ? "bg-red-100 text-red-700 font-medium"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {formatPrice(alert.strongBuyLow)} -{" "}
            {formatPrice(alert.strongBuyHigh)}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            alert.status === "watching"
              ? "bg-blue-100 text-blue-700"
              : alert.status === "triggered"
                ? "bg-amber-100 text-amber-700"
                : "bg-gray-100 text-gray-500"
          }`}
        >
          {alert.status === "watching" && <><Eye className="w-3.5 h-3.5 inline mr-1" />Watching</>}
          {alert.status === "triggered" && <><Bell className="w-3.5 h-3.5 inline mr-1" />Triggered</>}
          {alert.status === "paused" && <><Pause className="w-3.5 h-3.5 inline mr-1" />Paused</>}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600 text-sm">
        {formatDate(alert.lastTriggered)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => onEdit(alert)}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToggleStatus(alert)}
            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
            title={alert.status === "paused" ? "Resume" : "Pause"}
          >
            {alert.status === "paused" ? (
              <Play className="w-4 h-4" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => onDelete(alert.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
