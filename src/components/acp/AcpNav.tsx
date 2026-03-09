"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavTab {
  label: string;
  href: string;
  exact?: boolean;
}

const tabs: NavTab[] = [
  { label: "Dashboard", href: "/acp", exact: true },
  { label: "Offerings", href: "/acp/offerings" },
  { label: "Tasks", href: "/acp/tasks" },
  { label: "Strategy", href: "/acp/strategy" },
  { label: "Marketing", href: "/acp/marketing" },
  { label: "Decisions", href: "/acp/decisions" },
];

export function AcpNav() {
  const pathname = usePathname();

  const isActive = (tab: NavTab) => {
    if (tab.exact) return pathname === tab.href;
    return pathname.startsWith(tab.href);
  };

  return (
    <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4">
        <div className="overflow-x-auto overflow-y-hidden scrollbar-hide -mx-1 px-1">
          <nav className="flex items-center space-x-4 min-w-max">
            {tabs.map((tab) => {
              const active = isActive(tab);
              return (
                <Link
                  key={tab.href}
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
      </div>
    </div>
  );
}
