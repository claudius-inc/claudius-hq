"use client";

import { useState, useEffect } from "react";

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface ReportTOCProps {
  content: string;
}

export function ReportTOC({ content }: ReportTOCProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const [tocItems, setTocItems] = useState<TOCItem[]>([]);

  // Parse markdown headings from content
  useEffect(() => {
    const headingRegex = /^(#{2,3})\s+(.+)$/gm;
    const items: TOCItem[] = [];
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      items.push({ id, text, level });
    }

    setTocItems(items);
  }, [content]);

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const headings = tocItems.map((item) => document.getElementById(item.id));
      const scrollPosition = window.scrollY + 100;

      for (let i = headings.length - 1; i >= 0; i--) {
        const heading = headings[i];
        if (heading && heading.offsetTop <= scrollPosition) {
          setActiveId(tocItems[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [tocItems]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  };

  if (tocItems.length === 0) {
    return null;
  }

  return (
    <>
      {/* Desktop: Sticky sidebar */}
      <div className="hidden lg:block sticky top-20 h-fit">
        <div
          className={`transition-all duration-200 overflow-hidden ${
            isExpanded ? "w-52" : "w-12"
          }`}
        >
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            {/* Toggle button */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full p-3 flex items-center justify-center hover:bg-gray-50 transition-colors"
              aria-label={isExpanded ? "Collapse table of contents" : "Expand table of contents"}
            >
              <svg
                className={`w-5 h-5 text-gray-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
            </button>

            {/* TOC items */}
            {isExpanded && (
              <div className="border-t border-gray-100">
                <div className="p-2 max-h-[calc(100vh-200px)] overflow-y-auto">
                  <p className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Contents
                  </p>
                  {tocItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => scrollToSection(item.id)}
                      className={`w-full text-left px-2 py-1.5 text-sm rounded transition-colors ${
                        item.level === 3 ? "pl-4" : ""
                      } ${
                        activeId === item.id
                          ? "bg-emerald-50 text-emerald-700 font-medium"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <span className="line-clamp-2">{item.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Floating button */}
      <div className="lg:hidden fixed bottom-4 left-4 z-50">
        <div className="relative">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-12 h-12 bg-emerald-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-emerald-700 transition-colors"
            aria-label="Table of contents"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          {/* Mobile dropdown */}
          {isExpanded && (
            <div className="absolute bottom-14 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
              <div className="p-2">
                <p className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Contents
                </p>
                {tocItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      scrollToSection(item.id);
                      setIsExpanded(false);
                    }}
                    className={`w-full text-left px-2 py-2 text-sm rounded transition-colors ${
                      item.level === 3 ? "pl-4" : ""
                    } ${
                      activeId === item.id
                        ? "bg-emerald-50 text-emerald-700 font-medium"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <span className="line-clamp-2">{item.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
