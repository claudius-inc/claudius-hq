"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/markets", label: "Dashboard", exact: true },
  { href: "/markets/research", label: "Research" },
  { href: "/markets/portfolio", label: "Portfolio" },
  { href: "/markets/themes", label: "Themes" },
  { href: "/markets/sectors", label: "Sectors" },
  { href: "/markets/macro", label: "Macro" },
  { href: "/markets/alerts", label: "Alerts" },
];

export function MarketsTabs() {
  const pathname = usePathname();

  // Determine active tab based on pathname
  const getIsActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="mb-6 overflow-x-auto overflow-y-hidden scrollbar-hide">
      <nav className="flex space-x-2 min-w-max">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`
              py-2 px-4 font-medium text-sm transition-colors whitespace-nowrap rounded-full
              ${
                getIsActive(tab.href, tab.exact)
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }
            `}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
