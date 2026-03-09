"use client";

import { Info } from "lucide-react";

interface StrategyParam {
  id: string;
  category?: string | null;
  key: string;
  value?: string | null;
  notes?: string | null;
}

interface AcpStrategyFieldProps {
  param: StrategyParam;
}

function formatKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: string | null | undefined): string {
  if (!value) return "—";

  // Try to parse as JSON for arrays/objects
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.join(", ");
    }
    if (typeof parsed === "object") {
      return JSON.stringify(parsed);
    }
    return String(parsed);
  } catch {
    return value;
  }
}

export function AcpStrategyField({ param }: AcpStrategyFieldProps) {
  const formattedKey = formatKey(param.key);
  const formattedValue = formatValue(param.value);

  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-50 last:border-0">
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-700">{formattedKey}</span>
          {param.notes && (
            <div className="group relative">
              <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {param.notes}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded">
        {formattedValue}
      </div>
    </div>
  );
}
