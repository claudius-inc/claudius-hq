"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLink {
  href: string;
  label: string;
  badge?: number;
}

export function MobileMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden p-2 -mr-2 text-gray-500 hover:text-gray-900 transition-colors"
        aria-label="Toggle menu"
      >
        {open ? (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>

      {open && (
        <div className="md:hidden absolute top-12 left-0 right-0 bg-gray-50 border-b border-gray-200 shadow-sm z-50">
          <div className="px-4 py-2 space-y-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  pathname === link.href
                    ? "bg-gray-800 text-gray-100 font-medium"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {link.label}
                {link.badge && link.badge > 0 ? (
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold text-white bg-blue-500 rounded-full min-w-[18px]">
                    {link.badge > 9 ? "9+" : link.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
