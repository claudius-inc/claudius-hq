import { Nav } from "@/components/Nav";
import { MarketsTabs } from "@/components/MarketsTabs";

export default function MarketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-clip">
      <Nav />
      <MarketsTabs />
      <main className="mx-auto px-4 py-2 max-w-6xl">{children}</main>
    </div>
  );
}
