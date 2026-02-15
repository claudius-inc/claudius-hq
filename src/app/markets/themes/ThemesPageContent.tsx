"use client";

import { useState, useEffect, useCallback } from "react";
import { ThemeWithPerformance } from "@/lib/types";
import { ThemesTab } from "@/components/ThemesTab";
import { ThemesTableSkeleton } from "@/components/Skeleton";

export function ThemesPageContent() {
  const [themes, setThemes] = useState<ThemeWithPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/themes");
      const data = await res.json();
      setThemes(data.themes || []);
    } catch (e) {
      console.error("Failed to fetch themes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <ThemesTableSkeleton />;
  }

  return <ThemesTab initialThemes={themes} />;
}
