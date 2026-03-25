"use client";

import { useState } from "react";
import { ScannerResults } from "./ScannerResults";
import { UniverseManager } from "./UniverseManager";
import type { ParsedScan } from "../types";

type Tab = "results" | "universe";

const TABS: { value: Tab; label: string }[] = [
  { value: "results", label: "Results" },
  { value: "universe", label: "Universe" },
];

export function ScannerTabs({ scan }: { scan: ParsedScan | null }) {
  const [tab, setTab] = useState<Tab>("results");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              tab === t.value
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "results" ? (
        <ScannerResults scan={scan} />
      ) : (
        <UniverseManager />
      )}
    </div>
  );
}
