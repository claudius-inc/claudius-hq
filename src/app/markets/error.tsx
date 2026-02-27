"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function MarketsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Markets error:", error);
  }, [error]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-600" />
        </div>
        
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Markets data unavailable
        </h2>
        
        <p className="text-gray-600 mb-6">
          {error.message || "Failed to load market data. Please try again."}
        </p>
        
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
          
          <Link
            href="/markets"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Markets
          </Link>
        </div>
      </div>
    </div>
  );
}
