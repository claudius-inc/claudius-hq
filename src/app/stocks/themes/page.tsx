import type { Metadata } from "next";
import { ThemesPageContent } from "./ThemesPageContent";

export const metadata: Metadata = {
  title: "Themes | Stocks",
};

export default function ThemesPage() {
  return <ThemesPageContent />;
}
