import type { Metadata } from "next";
import { PortfolioPageContent } from "./PortfolioPageContent";

export const metadata: Metadata = {
  title: "Portfolio | Claudius HQ",
  description: "Investment clarity journal and portfolio holdings",
};

export default function PortfolioPage() {
  return <PortfolioPageContent />;
}
