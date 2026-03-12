import type { Metadata } from "next";
import { ThemesPageContent } from "./ThemesPageContent";
import { ThemeWithPerformance } from "@/lib/types";

// Revalidate every 5 minutes for ISR caching
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Themes | Stocks",
};

async function getThemes(): Promise<ThemeWithPerformance[]> {
  try {
    // Build absolute URL for server-side fetch
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || "http://localhost:3000";
    
    const res = await fetch(`${baseUrl}/api/themes`, {
      next: { revalidate: 300 },
    });
    
    if (!res.ok) {
      console.error("Failed to fetch themes:", res.status);
      return [];
    }
    
    const data = await res.json();
    return data.themes || [];
  } catch (e) {
    console.error("Failed to fetch themes:", e);
    return [];
  }
}

export default async function ThemesPage() {
  const themes = await getThemes();
  return <ThemesPageContent initialThemes={themes} />;
}
