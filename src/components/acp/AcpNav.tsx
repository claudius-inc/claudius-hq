"use client";

import Link from "next/link";

export function AcpNav() {
  return (
    <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between py-2">
          <Link
            href="/acp/offerings"
            className="text-sm font-semibold text-gray-900"
          >
            ACP Offerings
          </Link>
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
