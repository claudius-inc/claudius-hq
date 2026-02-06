"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface ResearchSidebarProps {
  projectId: number;
  pages: { slug: string; title: string }[];
}

export function ResearchSidebar({ projectId, pages }: ResearchSidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <span>{isOpen ? "▼" : "▶"}</span>
        <span>Research Pages ({pages.length})</span>
      </button>

      {/* Sidebar nav */}
      <nav className={`${isOpen ? "block" : "hidden"} lg:block`}>
        <div className="space-y-0.5">
          <Link
            href={`/projects/${projectId}/research`}
            className={`block px-3 py-1.5 text-sm rounded transition-colors ${
              pathname === `/projects/${projectId}/research`
                ? "bg-emerald-50 text-emerald-700 font-medium"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            ← All Pages
          </Link>
          <div className="border-t border-gray-100 my-2" />
          {pages.map((page) => {
            const href = `/projects/${projectId}/research/${page.slug}`;
            const isActive = pathname === href;
            return (
              <Link
                key={page.slug}
                href={href}
                className={`block px-3 py-1.5 text-sm rounded transition-colors ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 font-medium"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                {page.title}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
