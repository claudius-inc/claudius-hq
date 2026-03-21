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
  { label: "API Test", href: "/acp/test" },
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
        <div className="flex items-center justify-between">
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
          <a
            href="https://app.virtuals.io/acp/agent/2039"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap flex items-center gap-1"
          >
            View on Virtuals
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
