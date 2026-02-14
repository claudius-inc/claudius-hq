"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ResearchPage {
  id: number;
  slug: string;
  title: string;
}

interface ProjectSidebarProps {
  projectId: number;
  projectName: string;
  researchPages: ResearchPage[];
  hasPlanTech: boolean;
  hasPlanDistribution: boolean;
}

export function ProjectSidebar({
  projectId,
  projectName,
  researchPages,
  hasPlanTech,
  hasPlanDistribution,
}: ProjectSidebarProps) {
  const pathname = usePathname();
  const [researchExpanded, setResearchExpanded] = useState(
    pathname.includes("/research")
  );
  const [planExpanded, setPlanExpanded] = useState(
    pathname.includes("/plan")
  );

  const isActive = (path: string) => pathname === path;
  const isActivePrefix = (prefix: string) => pathname.startsWith(prefix);

  const basePath = `/projects/${projectId}`;

  const navItems = [
    { href: basePath, label: "Overview", icon: "📋" },
  ];

  return (
    <aside className="w-64 flex-shrink-0 hidden lg:block">
      <nav className="sticky top-20 space-y-1">
        {/* Project name header */}
        <div className="px-3 py-2 mb-2">
          <Link href={basePath} className="text-sm font-semibold text-gray-900 hover:text-emerald-600 transition-colors">
            {projectName}
          </Link>
        </div>

        {/* Overview */}
        <Link
          href={basePath}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
            isActive(basePath)
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <span>📋</span>
          <span>Overview</span>
        </Link>

        {/* Research - Expandable */}
        {researchPages.length > 0 && (
          <div>
            <button
              onClick={() => setResearchExpanded(!researchExpanded)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                isActivePrefix(`${basePath}/research`)
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>🔬</span>
                <span>Research</span>
                <span className="text-xs text-gray-400">({researchPages.length})</span>
              </div>
              <svg
                className={`w-4 h-4 transition-transform ${researchExpanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {researchExpanded && (
              <div className="ml-4 mt-1 space-y-1 border-l-2 border-gray-200 pl-3">
                {researchPages.map((page) => (
                  <Link
                    key={page.id}
                    href={`${basePath}/research/${page.slug}`}
                    className={`block px-2 py-1.5 text-sm rounded transition-colors truncate ${
                      isActive(`${basePath}/research/${page.slug}`)
                        ? "bg-gray-900 text-white"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                    title={page.title}
                  >
                    {page.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Plan - Expandable */}
        {(hasPlanTech || hasPlanDistribution) && (
          <div>
            <button
              onClick={() => setPlanExpanded(!planExpanded)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                isActivePrefix(`${basePath}/plan`)
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>🗺️</span>
                <span>Plan</span>
              </div>
              <svg
                className={`w-4 h-4 transition-transform ${planExpanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {planExpanded && (
              <div className="ml-4 mt-1 space-y-1 border-l-2 border-gray-200 pl-3">
                {hasPlanTech && (
                  <Link
                    href={`${basePath}/plan/tech`}
                    className={`block px-2 py-1.5 text-sm rounded transition-colors ${
                      isActive(`${basePath}/plan/tech`)
                        ? "bg-gray-900 text-white"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    🛠️ Tech Stack
                  </Link>
                )}
                {hasPlanDistribution && (
                  <Link
                    href={`${basePath}/plan/distribution`}
                    className={`block px-2 py-1.5 text-sm rounded transition-colors ${
                      isActive(`${basePath}/plan/distribution`)
                        ? "bg-gray-900 text-white"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    📣 Distribution
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action Plan */}
        <Link
          href={`${basePath}/action-plan`}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
            isActive(`${basePath}/action-plan`)
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <span>🎯</span>
          <span>Action Plan</span>
        </Link>
      </nav>
    </aside>
  );
}

// Mobile TOC Button
export function ProjectMobileTOC({
  projectId,
  projectName,
  researchPages,
  hasPlanTech,
  hasPlanDistribution,
}: ProjectSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;
  const basePath = `/projects/${projectId}`;

  return (
    <div className="lg:hidden fixed bottom-4 left-4 z-50">
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-12 h-12 bg-emerald-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-emerald-700 transition-colors"
          aria-label="Navigation"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute bottom-14 left-0 w-72 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
            <div className="p-3">
              <p className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {projectName}
              </p>
              
              <Link
                href={basePath}
                onClick={() => setIsOpen(false)}
                className={`block px-3 py-2 text-sm rounded-lg mb-1 ${
                  isActive(basePath)
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                📋 Overview
              </Link>

              {researchPages.length > 0 && (
                <>
                  <p className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">
                    Research
                  </p>
                  {researchPages.map((page) => (
                    <Link
                      key={page.id}
                      href={`${basePath}/research/${page.slug}`}
                      onClick={() => setIsOpen(false)}
                      className={`block px-3 py-2 text-sm rounded-lg mb-1 truncate ${
                        isActive(`${basePath}/research/${page.slug}`)
                          ? "bg-gray-900 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {page.title}
                    </Link>
                  ))}
                </>
              )}

              {(hasPlanTech || hasPlanDistribution) && (
                <>
                  <p className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">
                    Plan
                  </p>
                  {hasPlanTech && (
                    <Link
                      href={`${basePath}/plan/tech`}
                      onClick={() => setIsOpen(false)}
                      className={`block px-3 py-2 text-sm rounded-lg mb-1 ${
                        isActive(`${basePath}/plan/tech`)
                          ? "bg-gray-900 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      🛠️ Tech Stack
                    </Link>
                  )}
                  {hasPlanDistribution && (
                    <Link
                      href={`${basePath}/plan/distribution`}
                      onClick={() => setIsOpen(false)}
                      className={`block px-3 py-2 text-sm rounded-lg mb-1 ${
                        isActive(`${basePath}/plan/distribution`)
                          ? "bg-gray-900 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      📣 Distribution
                    </Link>
                  )}
                </>
              )}

              <Link
                href={`${basePath}/action-plan`}
                onClick={() => setIsOpen(false)}
                className={`block px-3 py-2 text-sm rounded-lg mt-2 ${
                  isActive(`${basePath}/action-plan`)
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                🎯 Action Plan
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
