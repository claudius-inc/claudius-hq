"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavSectionSwitcher } from "@/components/NavSectionSwitcher";

/* ── Primary sections ─────────────────────────────────────── */

interface SubTab {
  href: string;
  label: string;
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
    activePaths: ["/markets/portfolio"],
  },
  {
    label: "Research",
    href: "/markets/research",
    activePaths: ["/markets/research"],
  },
  {
    label: "Scanner",
    href: "/markets/scanner/stocks",
    activePaths: ["/markets/scanner"],
    subTabs: [
      { href: "/markets/scanner/stocks", label: "Stocks" },
      { href: "/markets/scanner/themes", label: "Themes" },
      { href: "/markets/scanner/sectors", label: "Sectors" },
      { href: "/markets/scanner/social", label: "Social" },
    ],
  },
];

/* ── Component ────────────────────────────────────────────── */

export function MarketsTabs() {
  const pathname = usePathname();

  return (
    <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4">
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <nav className="flex items-end space-x-4 min-w-max">
            {primaryTabs.map((tab) => {
              const active = tab.exact
                ? pathname === tab.href
                : tab.activePaths.some((p) => pathname.startsWith(p));
              const hasSubTabs = tab.subTabs && tab.subTabs.length > 0;
              // Transparent placeholder border keeps height identical between
              // active and inactive tabs, so the row doesn't shift on navigation.
              const borderCls = active
                ? "border-gray-900"
                : "border-transparent";

              if (hasSubTabs) {
                // The inner trigger button has its own `py-1`, so we shave 4px
                // off both pt and pb here to make the button's *text* align
                // with the plain Link tabs' text (not just the box bottoms).
                return (
                  <span
                    key={tab.label}
                    className={`min-h-[38px] flex items-end pt-1.5 pb-0.5 border-b-[2.5px] ${borderCls}`}
                  >
                    <NavSectionSwitcher
                      sections={tab.subTabs!}
                      placeholder={tab.label}
                    />
                  </span>
                );
              }

              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  className={`
                  min-h-[38px] flex items-end pt-2 pb-1.5 text-sm whitespace-nowrap border-b-[2.5px] ${borderCls}
                  ${
                    active
                      ? "font-semibold text-gray-900"
                      : "text-gray-400 hover:text-gray-700"
                  }
                `}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
