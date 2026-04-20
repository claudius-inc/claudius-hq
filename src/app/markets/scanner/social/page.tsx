import type { Metadata } from "next";
import { SocialPageContent } from "./SocialPageContent";

export const metadata: Metadata = {
  title: "Scanner – Social | Markets",
  description: "Stock tickers from curated Twitter accounts",
};

export const dynamic = "force-dynamic";

export default function SocialPage() {
  return <SocialPageContent />;
}
