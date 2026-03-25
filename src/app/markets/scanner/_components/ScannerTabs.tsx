"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { ScannerResults } from "./ScannerResults";
import { UniverseManager } from "./UniverseManager";
import { GlobalMarkets } from "@/components/GlobalMarkets";
import { ThemesPageContent } from "@/app/markets/themes/ThemesPageContent";
import type { ParsedScan } from "../types";

type Tab = "results" | "universe" | "themes" | "sectors";

function TabButton({
  active,
  onClick,
  className = "",
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function ScannerTabs({ scan }: { scan: ParsedScan | null }) {
  const [tab, setTab] = useState<Tab>("results");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {/* Stocks split button */}
        <div className="flex rounded-lg overflow-hidden">
          <TabButton
            active={tab === "results"}
            onClick={() => setTab("results")}
            className="rounded-none rounded-l-lg"
          >
            Stocks
          </TabButton>
          <TabButton
            active={tab === "universe"}
            onClick={() => setTab("universe")}
            className={`rounded-none rounded-r-lg border-l ${
              tab === "results" || tab === "universe"
                ? "border-gray-700"
                : "border-gray-200"
            }`}
          >
            <Pencil size={14} />
          </TabButton>
        </div>

        {/* Standard tabs */}
        <TabButton
          active={tab === "themes"}
          onClick={() => setTab("themes")}
          className="rounded-lg"
        >
          Themes
        </TabButton>
        <TabButton
          active={tab === "sectors"}
          onClick={() => setTab("sectors")}
          className="rounded-lg"
        >
          Sectors
        </TabButton>
      </div>

      {tab === "results" && <ScannerResults scan={scan} />}
      {tab === "universe" && <UniverseManager />}
      {tab === "themes" && <ThemesPageContent hideHero />}
      {tab === "sectors" && <GlobalMarkets hideHero />}
    </div>
  );
}
