"use client";

import { useState } from "react";
import { SectorMomentum } from "./SectorMomentum";
import { GlobalMarkets } from "./GlobalMarkets";

type SectorSubTab = "us" | "global";

export function SectorsView() {
  const [subTab, setSubTab] = useState<SectorSubTab>("us");

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          onClick={() => setSubTab("us")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            subTab === "us"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          🇺🇸 US Sectors
        </button>
        <button
          onClick={() => setSubTab("global")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            subTab === "global"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          🌍 Global Markets
        </button>
      </div>

      {/* Content */}
      {subTab === "us" && <SectorMomentum />}
      {subTab === "global" && <GlobalMarkets />}
    </div>
  );
}
