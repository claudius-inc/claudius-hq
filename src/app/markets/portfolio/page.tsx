import type { Metadata } from "next";
import { PortfolioPageContent } from "./PortfolioPageContent";

export const metadata: Metadata = {
  title: "IBKR Portfolio | Stocks",
  description: "Track your Interactive Brokers portfolio with live P&L",
};

export default function PortfolioPage() {
  return <PortfolioPageContent />;
}
