import { Nav } from "@/components/Nav";
import { StocksTabs } from "@/components/StocksTabs";

export default function StocksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <StocksTabs />
        {children}
      </main>
    </div>
  );
}
