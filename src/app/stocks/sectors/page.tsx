import type { Metadata } from "next";
import { SectorsView } from "@/components/SectorsView";

export const metadata: Metadata = {
  title: "Sectors | Stocks",
};

export default function SectorsPage() {
  return <SectorsView />;
}
