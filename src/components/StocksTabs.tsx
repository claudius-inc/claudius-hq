"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/stocks", label: "Research" },
  { href: "/stocks/portfolio", label: "Portfolio" },
  { href: "/stocks/themes", label: "Themes" },
  { href: "/stocks/sectors", label: "Sectors" },
];

export function StocksTabs() {
  const pathname = usePathname();

  // Determine active tab based on pathname
  const getIsActive = (href: string) => {
    if (href === "/stocks") {
      return pathname === "/stocks";
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="border-b border-gray-200 mb-6 overflow-x-auto overflow-y-hidden">
      <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`
              py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap
              ${
                getIsActive(tab.href)
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
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
