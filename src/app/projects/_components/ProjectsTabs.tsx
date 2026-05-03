"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/projects", label: "All Projects", exact: true },
  { href: "/projects/ideas", label: "Ideas" },
];

export function ProjectsTabs() {
  const pathname = usePathname();

  // Don't show tabs on individual project pages like /projects/[id]
  const isProjectDetail =
    pathname.startsWith("/projects/") &&
    !tabs.some((t) => pathname === t.href || pathname.startsWith(t.href + "/"));
  if (isProjectDetail) return null;

  return (
    <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4">
        <div className="overflow-x-auto overflow-y-hidden scrollbar-hide -mx-1 px-1">
          <nav className="flex items-center space-x-4 min-w-max">
            {tabs.map((tab) => {
              const active = tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);

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
