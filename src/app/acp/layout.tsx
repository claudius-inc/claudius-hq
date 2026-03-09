import { Nav } from "@/components/Nav";
import { AcpNav } from "@/components/acp";

export default function AcpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-clip">
      <Nav />
      <AcpNav />
      <main className="mx-auto px-4 py-4 max-w-6xl">{children}</main>
    </div>
  );
}
