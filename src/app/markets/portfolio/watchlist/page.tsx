import type { Metadata } from "next";
import { WatchlistPageContent } from "./WatchlistPageContent";

export const metadata: Metadata = {
  title: "Watchlist | Portfolio",
  description: "Track stocks you're watching",
};

export default function WatchlistPage() {
  return <WatchlistPageContent />;
}
