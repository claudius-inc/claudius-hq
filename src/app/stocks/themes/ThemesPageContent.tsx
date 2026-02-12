"use client";

import { useState, useEffect, useCallback } from "react";
import { ThemeWithPerformance } from "@/lib/types";
import { ThemesTab } from "@/components/ThemesTab";

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
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <ThemesTab initialThemes={themes} />;
}
