"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ── Primary sections ─────────────────────────────────────── */

interface SubTab {
  href: string;
  label: string;
  exact?: boolean;
}

interface PrimaryTab {
  label: string;
  href: string;
  activePaths: string[];
  exact?: boolean;
  subTabs?: SubTab[];
}

const primaryTabs: PrimaryTab[] = [
  {
    label: "Dashboard",
    href: "/markets",
    activePaths: ["/markets"],
    exact: true,
  },
  {
    label: "Portfolio",
    href: "/markets/portfolio",
    activePaths: [
      "/markets/portfolio",
      "/markets/portfolio/watchlist",
      "/markets/alerts",
    ],
    subTabs: [
      { href: "/markets/portfolio", label: "Holdings", exact: true },
      { href: "/markets/portfolio/watchlist", label: "Watchlist" },
      { href: "/markets/alerts", label: "Alerts" },
    ],
  },
  {
    label: "Research",
    href: "/markets/research",
    activePaths: ["/markets/research"],
  },
  {
    label: "Markets",
    href: "/markets/macro",
    activePaths: [
      "/markets/macro",
      "/markets/sectors",
      "/markets/themes",
      "/markets/gold",
      "/markets/btc",
    ],
    subTabs: [
      { href: "/markets/macro", label: "Macro" },
      { href: "/markets/sectors", label: "Sectors" },
      { href: "/markets/themes", label: "Themes" },
      { href: "/markets/gold", label: "Gold" },
      { href: "/markets/btc", label: "Crypto" },
    ],
  },
];

/* ── Component ────────────────────────────────────────────── */

export function MarketsTabs() {
  const pathname = usePathname();

  const activeSection = primaryTabs.find((tab) => {
    if (tab.exact) return pathname === tab.href;
    return tab.activePaths.some((p) => pathname.startsWith(p));
  });

  const subTabs = activeSection?.subTabs;
  const hasSubTabs = subTabs && subTabs.length > 0;

  const isSubActive = (sub: SubTab) => {
    if (sub.href.includes("#")) {
      if (typeof window !== "undefined" && window.location.hash) {
        return sub.href.includes(window.location.hash);
      }
      return false;
    }
    if (sub.exact) return pathname === sub.href;
    return pathname.startsWith(sub.href);
  };

  return (
    <div className="space-y-2 bg-white/90 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4">
        {/* Primary tabs */}
        <div className="overflow-x-auto overflow-y-hidden scrollbar-hide -mx-1 px-1">
          <nav className="flex items-center space-x-4 min-w-max">
            {primaryTabs.map((tab) => {
              const active = tab.exact
                ? pathname === tab.href
                : tab.activePaths.some((p) => pathname.startsWith(p));

              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  className={`
                  min-h-[38px] flex items-end py-2 text-sm whitespace-nowrap
                  ${
                    active
                      ? "font-semibold text-gray-900"
                      : "text-gray-400 hover:text-gray-700"
                  }
                `}
                >
                  {tab.label}
                  {active && (
                    <span className="flex flex-col items-start gap-0.5 -ml-0.5">
                      <span className="w-1.5 h-[1px] bg-gray-900" />
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Mini pill sub-tabs */}
        {hasSubTabs && (
          <div className="overflow-x-auto scrollbar-hide -mx-1 px-1 py-2">
            <div className="flex items-center gap-1.5 min-w-max bg-gray-100/80 rounded-full px-1.5 py-1 w-fit">
              {subTabs.map((sub) => {
                const subActive = isSubActive(sub);
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    className={`
                    min-h-[32px] flex items-center px-3 text-xs whitespace-nowrap rounded-full transition-all
                    ${
                      subActive
                        ? "bg-white text-gray-900 font-medium shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }
                  `}
                  >
                    {sub.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
