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
    <div className="mb-6 overflow-x-auto overflow-y-hidden scrollbar-hide">
      <nav className="flex space-x-2 min-w-max">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`
              py-2 px-4 font-medium text-sm transition-colors whitespace-nowrap rounded-full
              ${
                getIsActive(tab.href)
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
