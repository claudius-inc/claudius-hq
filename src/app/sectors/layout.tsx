import { MarketsTabs } from "@/components/MarketsTabs";

export default function SectorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketsTabs />
      <main>{children}</main>
    </>
  );
}
