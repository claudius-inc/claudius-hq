import { MarketsTabs } from "@/components/MarketsTabs";

export default function MacroLayout({
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
