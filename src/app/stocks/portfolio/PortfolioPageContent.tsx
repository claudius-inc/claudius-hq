"use client";

import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with file upload
const IBKRPortfolio = dynamic(() => import('@/components/IBKRPortfolio'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
    </div>
  ),
});

export function PortfolioPageContent() {
  return <IBKRPortfolio />;
}
