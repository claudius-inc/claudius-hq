import type { Metadata } from "next";
import { PortfolioPageContent } from "./PortfolioPageContent";

export const metadata: Metadata = {
  title: "Portfolio | Stocks",
};

export default function PortfolioPage() {
  return <PortfolioPageContent />;
}
