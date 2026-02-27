import type { Metadata } from "next";
import { SectorsView } from "@/components/SectorsView";

// Revalidate every 5 minutes for ISR caching
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Sectors | Stocks",
};

export default function SectorsPage() {
  return <SectorsView />;
}
