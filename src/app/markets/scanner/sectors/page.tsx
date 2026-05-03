import type { Metadata } from "next";
import { GlobalMarkets } from "./_components/GlobalMarkets";

export const metadata: Metadata = {
  title: "Scanner – Sectors | Markets",
  description: "Global market sectors overview",
};

export default function ScannerSectorsPage() {
  return <GlobalMarkets hideHero />;
}
