"use client";

import React, { useState } from "react";
import { PageHero } from "@/components/PageHero";

interface EndpointConfig {
  name: string;
  method: string;
  path: string;
  description: string;
  fields: {
    name: string;
    label: string;
    type: "select" | "text" | "number" | "checkbox";
    options?: string[];
    defaultValue?: string | number | boolean;
    placeholder?: string;
  }[];
}

const ENDPOINTS: EndpointConfig[] = [
  {
    name: "Crypto Signal",
    method: "POST",
    path: "/api/acp/crypto-signal",
    description: "Get trading signal for a crypto asset",
    fields: [
      {
        name: "asset",
        label: "Asset",
        type: "select",
        options: ["BTC", "ETH", "SOL", "HYPE"],
        defaultValue: "BTC",
      },
    ],
  },
  {
    name: "Gold Signal",
    method: "POST",
    path: "/api/acp/gold-signal",
    description: "Gold trading signal with technicals + macro analysis",
    fields: [
      {
        name: "detailed",
        label: "Include detailed analysis",
        type: "checkbox",
        defaultValue: true,
      },
    ],
  },
  {
    name: "Stock Scan",
    method: "POST",
    path: "/api/acp/stock-scan",
    description: "Scan stocks by market (US/HK/JP)",
    fields: [
      {
        name: "market",
        label: "Market",
        type: "select",
        options: ["US", "HK", "JP"],
        defaultValue: "US",
      },
    ],
  },
  {
    name: "Alt Picks",
    method: "POST",
    path: "/api/acp/alt-picks",
    description: "Get altcoin picks with analysis",
    fields: [],
  },
  {
    name: "War Update",
    method: "POST",
    path: "/api/acp/war-update",
    description: "Middle East conflict updates with market implications",
    fields: [
      {
        name: "includeMarketImpact",
        label: "Include market impact",
        type: "checkbox",
        defaultValue: true,
      },
      {
        name: "limit",
        label: "Event limit",
        type: "number",
        defaultValue: 20,
        placeholder: "20",
      },
    ],
  },
];

function EndpointCard({
  endpoint,
  apiKey,
}: {
  endpoint: EndpointConfig;
  apiKey: string;
}): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string | number | boolean>>(() => {
    const initial: Record<string, string | number | boolean> = {};
    endpoint.fields.forEach((field) => {
      if (field.defaultValue !== undefined) {
        initial[field.name] = field.defaultValue;
      }
    });
    return initial;
  });

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch(endpoint.path, {
        method: endpoint.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
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

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{endpoint.name}</h3>
          <p className="text-sm text-gray-600">{endpoint.description}</p>
        </div>
        <span className="px-2 py-1 text-xs font-mono bg-blue-100 text-blue-700 rounded">
          {endpoint.method}
        </span>
      </div>

      {/* Path */}
      <div className="mb-4 p-2 bg-gray-100 rounded font-mono text-sm text-gray-700 overflow-x-auto">
        {endpoint.path}
      </div>

      {/* Form Fields */}
      {endpoint.fields.length > 0 ? (
        <div className="space-y-3 mb-4">
          {endpoint.fields.map((field) => (
            <div key={field.name} className="flex items-center gap-3">
              <label className="text-sm text-gray-600 min-w-[140px]">
                {field.label}:
              </label>
              {field.type === "select" ? (
                <select
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={String(formData[field.name] ?? "")}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                >
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === "text" ? (
                <input
                  type="text"
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={String(formData[field.name] ?? "")}
                  placeholder={field.placeholder}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                />
              ) : field.type === "number" ? (
                <input
                  type="number"
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={String(formData[field.name] ?? "")}
                  placeholder={field.placeholder}
                  onChange={(e) =>
                    handleFieldChange(field.name, parseInt(e.target.value, 10) || 0)
                  }
                />
              ) : field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  className="w-5 h-5 bg-gray-50 border border-gray-300 rounded"
                  checked={Boolean(formData[field.name])}
                  onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className={`w-full py-2 px-4 rounded font-medium text-sm transition-colors ${
          loading
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {loading ? "Loading..." : "Send Request"}
      </button>

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Response Display */}
      {response && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Response:</span>
            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(response, null, 2))}
              className="text-xs text-blue-600 hover:text-blue-500"
            >
              Copy JSON
            </button>
          </div>
          <pre className="p-3 bg-gray-100 rounded text-xs text-gray-800 overflow-auto max-h-96 font-mono">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AcpTestPage() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-6">
      <PageHero
        title="ACP Endpoint Tester"
        subtitle="Test all ACP signal endpoints with live requests"
      />

      {/* API Key Input */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">API Configuration</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 min-w-[100px]">API Key:</label>
          <div className="flex-1 relative">
            <input
              type={showKey ? "text" : "password"}
              className="w-full px-3 py-2 pr-20 bg-gray-50 border border-gray-300 rounded text-gray-900 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter HQ_API_KEY"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          All POST endpoints require authentication via Bearer token.
        </p>
      </div>

      {/* Endpoint Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {ENDPOINTS.map((endpoint) => (
          <EndpointCard key={endpoint.path} endpoint={endpoint} apiKey={apiKey} />
        ))}
      </div>

      {/* Quick Reference */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick Reference</h3>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            <strong className="text-gray-800">Crypto Signal:</strong> Returns BUY/SELL/HOLD with
            technical indicators, funding rates, and sentiment.
          </p>
          <p>
            <strong className="text-gray-800">Gold Signal:</strong> Technical + macro analysis
            including RSI, MACD, Fed rates, DXY, and price targets.
          </p>
          <p>
            <strong className="text-gray-800">Stock Scan:</strong> Screens stocks by market using
            fundamental + technical scoring.
          </p>
          <p>
            <strong className="text-gray-800">Alt Picks:</strong> Curated altcoin picks with
            analysis and risk assessment.
          </p>
          <p>
            <strong className="text-gray-800">War Update:</strong> Middle East conflict events with
            risk level, casualties, and market implications.
          </p>
        </div>
      </div>
    </div>
  );
}
