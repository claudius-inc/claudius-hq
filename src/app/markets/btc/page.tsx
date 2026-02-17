import type { Metadata } from "next";
import { BtcContent } from "./BtcContent";

export const metadata: Metadata = {
  title: "BTC 200WMA Indicator | Markets",
};

export default function BtcPage() {
  return <BtcContent />;
}
