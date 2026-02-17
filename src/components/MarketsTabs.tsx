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
  /** Pathnames that make this primary tab active */
  activePaths: string[];
  exact?: boolean; // primary tab active only on exact match
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
    activePaths: ["/markets/portfolio", "/markets/alerts"],
    subTabs: [
      { href: "/markets/portfolio", label: "Holdings", exact: true },
      { href: "/markets/portfolio#watchlist", label: "Watchlist" },
      { href: "/markets/alerts", label: "Alerts" },
    ],
  },
  {
    label: "Research",
    href: "/markets/research",
    activePaths: ["/markets/research", "/markets/analysts"],
    subTabs: [
      { href: "/markets/research", label: "Reports", exact: true },
      { href: "/markets/analysts", label: "Analysts" },
    ],
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
      { href: "/markets/btc", label: "BTC" },
    ],
  },
];

/* ── Component ────────────────────────────────────────────── */

export function MarketsTabs() {
  const pathname = usePathname();

  // Which primary tab is active?
  const activeSection = primaryTabs.find((tab) => {
    if (tab.exact) return pathname === tab.href;
    return tab.activePaths.some((p) => pathname.startsWith(p));
  });

  const subTabs = activeSection?.subTabs;

  const isSubActive = (sub: SubTab, allSubs: SubTab[]) => {
    // For hash links, only active if no other exact sub-tab matches first
    if (sub.href.includes("#")) {
      // If we're on the base path AND no exact sub-tab claims it, this one is never auto-active
      // Hash tabs need client-side hash detection
      if (typeof window !== "undefined" && window.location.hash) {
        return sub.href.includes(window.location.hash);
      }
      return false;
    }
    if (sub.exact) return pathname === sub.href;
    return pathname.startsWith(sub.href);
  };

  return (
    <div className="mb-4 space-y-1">
      {/* Primary tabs */}
      <div className="overflow-x-auto overflow-y-hidden scrollbar-hide -mx-1 px-1">
        <nav className="flex space-x-1.5 min-w-max">
          {primaryTabs.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : tab.activePaths.some((p) => pathname.startsWith(p));
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={`
                  min-h-[44px] flex items-center py-2 px-4 md:px-5 font-semibold text-sm transition-colors whitespace-nowrap rounded-full
                  ${
                    active
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }
                `}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Secondary tabs */}
      {subTabs && subTabs.length > 0 && (
        <div className="overflow-x-auto overflow-y-hidden scrollbar-hide -mx-1 px-1">
          <nav className="flex space-x-3 min-w-max border-b border-gray-200">
            {subTabs.map((sub) => {
              const active = isSubActive(sub, subTabs);
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  className={`
                    min-h-[44px] flex items-center pb-2 text-sm transition-colors whitespace-nowrap border-b-2
                    ${
                      active
                        ? "border-gray-900 text-gray-900 font-medium"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }
                  `}
                >
                  {sub.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
