"use client";

import { useState, useEffect, useCallback } from "react";
import { ThemeWithPerformance } from "@/lib/types";
import { PageHero } from "@/components/PageHero";
import { ThemesTab } from "@/components/ThemesTab";
import { ThemesTableSkeleton } from "@/components/Skeleton";

interface ThemeLite {
  id: number;
  name: string;
  description: string;
  created_at: string;
  stocks: string[];
}

export function ThemesPageContent({ hideHero = false }: { hideHero?: boolean } = {}) {
  const [themesLite, setThemesLite] = useState<ThemeLite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // Fast: just get theme metadata from DB
      const res = await fetch("/api/themes/lite");
      const data = await res.json();
      setThemesLite(data.themes || []);
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

  return (
    <>
      {!hideHero && (
        <PageHero
          title="Investment Themes"
          subtitle="Track themed baskets and their performance"
        />
      )}
      <ThemesTab initialThemesLite={themesLite} hideHero={hideHero} />
    </>
  );
}
