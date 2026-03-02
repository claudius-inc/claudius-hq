import type { Metadata } from "next";
import { RegimeContent } from "./RegimeContent";

export const metadata: Metadata = {
  title: "Regime Analysis | Markets",
  description: "Track monetary regime shifts and financial repression indicators",
};

export default function RegimePage() {
  return <RegimeContent />;
}
