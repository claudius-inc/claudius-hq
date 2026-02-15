import type { Metadata } from "next";
import { AlertsPageContent } from "./AlertsPageContent";

export const metadata: Metadata = {
  title: "Price Alerts | Stocks",
  description: "Manage stock price alerts with accumulation and strong buy zones",
};

export default function AlertsPage() {
  return <AlertsPageContent />;
}
