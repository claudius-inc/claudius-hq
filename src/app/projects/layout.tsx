import { Nav } from "@/components/Nav";
import { ProjectsTabs } from "@/components/ProjectsTabs";

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-clip">
      <Nav />
      <ProjectsTabs />
      <main className="mx-auto px-4 py-6 max-w-6xl">{children}</main>
    </div>
  );
}
