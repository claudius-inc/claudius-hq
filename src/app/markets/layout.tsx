import { Nav } from "@/components/Nav";
import { MarketsTabs } from "@/components/MarketsTabs";

export default function MarketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <MarketsTabs />
        {children}
      </main>
    </div>
  );
}
