"use client";

import { ThemeWithPerformance } from "@/lib/types";
import { ThemesTab } from "@/components/ThemesTab";

interface ThemesPageContentProps {
  initialThemes: ThemeWithPerformance[];
}

export function ThemesPageContent({ initialThemes }: ThemesPageContentProps) {
  return <ThemesTab initialThemes={initialThemes} />;
}
