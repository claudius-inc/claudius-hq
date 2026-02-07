"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Don't auto-refresh on report detail pages (reading experience)
    // Only refresh on dashboard/listing pages
    const isReportPage = pathname.startsWith("/stocks/") && pathname !== "/stocks";
    if (isReportPage) return;

    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(id);
  }, [router, intervalMs, pathname]);

  return null;
}
