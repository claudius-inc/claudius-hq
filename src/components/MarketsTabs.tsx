"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";

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
  const tabRefs = useRef<Record<string, HTMLElement | null>>({});
  const navRef = useRef<HTMLDivElement>(null);
  const [caretLeft, setCaretLeft] = useState<number | null>(null);

  // Which primary tab is active?
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

  // Calculate caret position (centered under active primary tab)
  useEffect(() => {
    if (!activeSection || !hasSubTabs) {
      setCaretLeft(null);
      return;
    }
    const el = tabRefs.current[activeSection.label];
    const nav = navRef.current;
    if (el && nav) {
      const navRect = nav.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setCaretLeft(elRect.left - navRect.left + elRect.width / 2);
    }
  }, [pathname, activeSection, hasSubTabs]);

  return (
    <div className="mb-4">
      {/* Primary tabs */}
      <div
        ref={navRef}
        className="overflow-x-auto overflow-y-hidden scrollbar-hide -mx-1 px-1"
      >
        <nav className="flex items-center space-x-1.5 min-w-max">
          {primaryTabs.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : tab.activePaths.some((p) => pathname.startsWith(p));

            return (
              <Link
                key={tab.label}
                ref={(el) => {
                  tabRefs.current[tab.label] = el;
                }}
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

      {/* Floating sub-tabs beneath active primary tab */}
      {hasSubTabs && (
        <div className="relative mt-1.5">
          {/* Caret connector */}
          {caretLeft !== null && (
            <div
              className="absolute -top-1 w-2 h-2 bg-gray-100 border-t border-l border-gray-200 rotate-45 z-10"
              style={{ left: `${caretLeft - 4}px` }}
            />
          )}

          {/* Sub-tab chips */}
          <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
            <div
              className="flex items-center gap-1 min-w-max"
              style={
                caretLeft !== null
                  ? { paddingLeft: `max(0px, ${caretLeft - 60}px)` }
                  : undefined
              }
            >
              <div className="inline-flex items-center gap-0.5 bg-gray-100 border border-gray-200 rounded-lg p-0.5">
                {subTabs.map((sub) => {
                  const subActive = isSubActive(sub);
                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={`
                        min-h-[36px] flex items-center px-3 text-sm whitespace-nowrap rounded-md transition-all
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
          </div>
        </div>
      )}
    </div>
  );
}
