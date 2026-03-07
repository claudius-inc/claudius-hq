import type { Metadata } from "next";
import { MacroPageContent } from "./MacroPageContent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Macro | Claudius HQ",
  description: "Macro dashboard with regime analysis, market indicators, and economic data",
};

export default function MacroPage() {
  return <MacroPageContent />;
}
