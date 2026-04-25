import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { ThemesPageContent } from "@/app/markets/themes/ThemesPageContent";

export const metadata: Metadata = {
  title: "Scanner – Themes | Markets",
  description: "Track thematic baskets and their performance",
};

export default function ScannerThemesPage() {
  return <ThemesPageContent hideHero />;
}
