import type { Metadata } from "next";
import { SectorsPageContent } from "./SectorsPageContent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sectors & Themes | Claudius HQ",
  description: "Track sector rotation, investment themes, commodities, and crypto",
};

export default function SectorsPage() {
  return <SectorsPageContent />;
}
