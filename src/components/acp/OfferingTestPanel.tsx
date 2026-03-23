"use client";

import { useState } from "react";
import { Play, Copy, Check, Loader2 } from "lucide-react";

interface FieldConfig {
  name: string;
  label: string;
  type: "select" | "text" | "number" | "checkbox";
  options?: string[];
  defaultValue?: string | number | boolean;
  placeholder?: string;
}

interface EndpointConfig {
  path: string;
  method: string;
  fields: FieldConfig[];
}

// Map offering names to their API endpoints and fields
const OFFERING_ENDPOINTS: Record<string, EndpointConfig> = {
  btc_signal: {
    path: "/api/acp/crypto-signal",
    method: "POST",
    fields: [
      { name: "asset", label: "Asset", type: "text", defaultValue: "BTC" },
      { name: "timeframe", label: "Timeframe", type: "select", options: ["4h", "daily", "weekly"], defaultValue: "daily" },
    ],
  },
  eth_signal: {
    path: "/api/acp/crypto-signal",
    method: "POST",
    fields: [
      { name: "asset", label: "Asset", type: "text", defaultValue: "ETH" },
      { name: "timeframe", label: "Timeframe", type: "select", options: ["4h", "daily", "weekly"], defaultValue: "daily" },
    ],
  },
  sol_signal: {
    path: "/api/acp/crypto-signal",
    method: "POST",
    fields: [
      { name: "asset", label: "Asset", type: "text", defaultValue: "SOL" },
      { name: "timeframe", label: "Timeframe", type: "select", options: ["4h", "daily", "weekly"], defaultValue: "daily" },
    ],
  },
  hype_signal: {
    path: "/api/acp/crypto-signal",
    method: "POST",
    fields: [
      { name: "asset", label: "Asset", type: "text", defaultValue: "HYPE" },
      { name: "timeframe", label: "Timeframe", type: "select", options: ["4h", "daily", "weekly"], defaultValue: "daily" },
    ],
  },
  gold_signal: {
    path: "/api/acp/gold-signal",
    method: "POST",
    fields: [
      { name: "detailed", label: "Include detailed analysis", type: "checkbox", defaultValue: true },
    ],
  },
  us_stock_scan: {
    path: "/api/acp/stock-scan",
    method: "POST",
    fields: [
      { name: "market", label: "Market", type: "text", defaultValue: "US" },
    ],
  },
  hkex_stock_scan: {
    path: "/api/acp/stock-scan",
    method: "POST",
    fields: [
      { name: "market", label: "Market", type: "text", defaultValue: "HK" },
    ],
  },
  jp_stock_scan: {
    path: "/api/acp/stock-scan",
    method: "POST",
    fields: [
      { name: "market", label: "Market", type: "text", defaultValue: "JP" },
    ],
  },
  alt_picks_scan: {
    path: "/api/acp/alt-picks",
    method: "POST",
    fields: [],
  },
  war_update: {
    path: "/api/acp/war-update",
    method: "POST",
    fields: [
      { name: "includeMarketImpact", label: "Include market impact", type: "checkbox", defaultValue: true },
      { name: "limit", label: "Event limit", type: "number", defaultValue: 20, placeholder: "20" },
    ],
  },
  token_alpha_report: {
    path: "/api/acp/token-alpha",
    method: "POST",
    fields: [
      { name: "tokenAddress", label: "Token Address", type: "text", placeholder: "0x..." },
      { name: "chain", label: "Chain", type: "select", options: ["base", "ethereum", "arbitrum", "optimism"], defaultValue: "base" },
    ],
  },
};

interface OfferingTestPanelProps {
  offeringName: string;
}

export function OfferingTestPanel({ offeringName }: OfferingTestPanelProps) {
  const config = OFFERING_ENDPOINTS[offeringName];
  
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState<Record<string, string | number | boolean>>(() => {
    const initial: Record<string, string | number | boolean> = {};
    config?.fields.forEach((field) => {
      if (field.defaultValue !== undefined) {
        initial[field.name] = field.defaultValue;
      }
    });
    return initial;
  });

  if (!config) {
    return (
      <div className="text-sm text-gray-500 italic">
        No API test available for this offering
      </div>
    );
  }

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch(config.path, {
        method: config.method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || data.error || `HTTP ${res.status}`);
      } else {
        setResponse(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (name: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCopy = () => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border-t border-gray-200 pt-3 mt-3">
      <div className="text-xs font-medium text-gray-700 mb-3">API Test</div>
      
      {/* Endpoint info */}
      <div className="mb-3 px-2 py-1.5 bg-gray-100 rounded font-mono text-xs text-gray-600 flex items-center gap-2">
        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-semibold">
          {config.method}
        </span>
        <span className="truncate">{config.path}</span>
      </div>

      {/* Form Fields */}
      {config.fields.length > 0 && (
        <div className="space-y-2 mb-3">
          {config.fields.map((field) => (
            <div key={field.name} className="flex items-center gap-2">
              <label className="text-xs text-gray-600 min-w-[100px]">
                {field.label}:
              </label>
              {field.type === "select" ? (
                <select
                  className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={String(formData[field.name] ?? "")}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                >
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : field.type === "text" ? (
                <input
                  type="text"
                  className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={String(formData[field.name] ?? "")}
                  placeholder={field.placeholder}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                />
              ) : field.type === "number" ? (
                <input
                  type="number"
                  className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={String(formData[field.name] ?? "")}
                  placeholder={field.placeholder}
                  onChange={(e) => handleFieldChange(field.name, parseInt(e.target.value, 10) || 0)}
                />
              ) : field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  className="w-4 h-4 bg-gray-50 border border-gray-200 rounded"
                  checked={Boolean(formData[field.name])}
                  onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          loading
            ? "bg-gray-200 text-gray-500 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
        {loading ? "Running..." : "Run Test"}
      </button>

      {/* Error Display */}
      {error && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Response Display */}
      {response && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-600">Response:</span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="p-2 bg-gray-100 rounded text-[11px] text-gray-800 overflow-auto max-h-64 font-mono">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Export the list of supported offerings for reference
export const SUPPORTED_OFFERINGS = Object.keys(OFFERING_ENDPOINTS);
