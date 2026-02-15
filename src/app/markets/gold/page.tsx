import type { Metadata } from "next";
import { GoldContent } from "./GoldContent";

export const metadata: Metadata = {
  title: "Gold Analysis | Markets",
};

export default function GoldPage() {
  return <GoldContent />;
}
