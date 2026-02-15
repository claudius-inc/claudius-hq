import type { Metadata } from "next";
import { AnalystsPageContent } from "./AnalystsPageContent";

export const metadata: Metadata = {
  title: "Analysts Tracker | Markets",
  description: "Track top analysts and their stock calls",
};

export default function AnalystsPage() {
  return <AnalystsPageContent />;
}
