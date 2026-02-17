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

  const isSubActive = (sub: SubTab) => {
    if (sub.exact) return pathname === sub.href;
    // For hash links, match on path portion only
    const subPath = sub.href.split("#")[0];
    if (sub.href.includes("#")) return pathname === subPath;
    return pathname.startsWith(subPath);
  };

  return (
    <div className="mb-6 space-y-2">
      {/* Primary tabs */}
      <div className="overflow-x-auto overflow-y-hidden scrollbar-hide">
        <nav className="flex space-x-2 min-w-max">
          {primaryTabs.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : tab.activePaths.some((p) => pathname.startsWith(p));
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={`
                  py-2 px-5 font-semibold text-sm transition-colors whitespace-nowrap rounded-full
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
        <div className="overflow-x-auto overflow-y-hidden scrollbar-hide">
          <nav className="flex space-x-4 min-w-max border-b border-gray-200">
            {subTabs.map((sub) => {
              const active = isSubActive(sub);
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  className={`
                    pb-2 text-sm transition-colors whitespace-nowrap border-b-2
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
