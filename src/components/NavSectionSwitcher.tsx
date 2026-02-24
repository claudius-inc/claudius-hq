"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";

interface Section {
  href: string;
  label: string;
}

export function NavSectionSwitcher({ sections }: { sections: Section[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const current =
    sections.find(
      (s) => pathname === s.href || pathname.startsWith(s.href + "/")
    ) ?? null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900 transition-colors py-1 px-1.5 -mx-1.5 rounded-md hover:bg-gray-100"
      >
        <span className={current ? "font-medium" : "text-gray-400"}>
          {current?.label ?? "Navigate"}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
          {sections.map((section) => {
            const active =
              pathname === section.href ||
              pathname.startsWith(section.href + "/");
            return (
              <Link
                key={section.href}
                href={section.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                  active
                    ? "text-gray-900 font-medium bg-gray-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {section.label}
                {active && <Check className="w-3.5 h-3.5 text-gray-900" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
