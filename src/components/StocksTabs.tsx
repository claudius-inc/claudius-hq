"use client";

import { useSearchParams, useRouter } from "next/navigation";

export type StocksTab = "research" | "watchlist" | "portfolio";

interface StocksTabsProps {
  activeTab: StocksTab;
}

export function StocksTabs({ activeTab }: StocksTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabs: { id: StocksTab; label: string; icon: string }[] = [
    { id: "research", label: "Research", icon: "📊" },
    { id: "watchlist", label: "Watchlist", icon: "👀" },
    { id: "portfolio", label: "Portfolio", icon: "💼" },
  ];

  const handleTabChange = (tab: StocksTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "research") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const queryString = params.toString();
    router.push(`/stocks${queryString ? `?${queryString}` : ""}`);
  };

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex space-x-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`
              flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
              ${
                activeTab === tab.id
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
