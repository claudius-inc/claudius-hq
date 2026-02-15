import type { Metadata } from "next";
import { MacroContent } from "./MacroContent";

export const metadata: Metadata = {
  title: "Macro Dashboard | Stocks",
};

export default function MacroDashboardPage() {
  return <MacroContent />;
}
