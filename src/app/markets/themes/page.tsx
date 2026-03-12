import type { Metadata } from "next";
import { ThemesPageContent } from "./ThemesPageContent";

// Revalidate every 5 minutes for ISR caching
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Themes | Stocks",
};

export default function ThemesPage() {
  return <ThemesPageContent />;
}
