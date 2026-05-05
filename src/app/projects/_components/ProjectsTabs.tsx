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
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <nav className="flex items-end space-x-4 min-w-max">
            {tabs.map((tab) => {
              const active = tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
              // Transparent placeholder border keeps height identical between
              // active and inactive tabs, so the row doesn't shift on navigation.
              const borderCls = active
                ? "border-gray-900"
                : "border-transparent";

              return (
                <Link
                  key={tab.href}
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
