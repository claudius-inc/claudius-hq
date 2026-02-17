import type { Metadata } from "next";
import { TradeJournalContent } from "./TradeJournalContent";

export const metadata: Metadata = {
  title: "Trade Journal | Markets",
  description: "Reflective trade journal — log thesis, track outcomes, learn from history",
};

export default function TradeJournalPage() {
  return <TradeJournalContent />;
}
