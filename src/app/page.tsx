import type { Metadata } from "next";
import db, { ensureDB } from "@/lib/db";
import { Project } from "@/lib/types";
import { ProjectCards } from "@/components/ProjectCards";
import { Nav } from "@/components/Nav";
import { EmptyState } from "@/components/EmptyState";
import Link from "next/link";
import { Rocket, Lightbulb, TrendingUp } from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard",
};

// Revalidate dashboard every 60 seconds
export const revalidate = 60;

async function getData() {
  await ensureDB();
  try {
    const [projectsRes, ideasRes, reportsRes] = await Promise.all([
      db.execute("SELECT * FROM projects ORDER BY updated_at DESC"),
      db.execute("SELECT COUNT(*) as count FROM ideas"),
      db.execute("SELECT COUNT(*) as count FROM stock_reports"),
    ]);

    return {
      projects: projectsRes.rows as unknown as Project[],
      ideasCount: Number((ideasRes.rows[0] as unknown as { count: number }).count),
      reportsCount: Number((reportsRes.rows[0] as unknown as { count: number }).count),
    };
  } catch {
    return {
      projects: [],
      ideasCount: 0,
      reportsCount: 0,
    };
  }
}

export default async function Dashboard() {
  const { projects, ideasCount, reportsCount } = await getData();

  const inProgress = projects.filter((p) => p.status === "in_progress").length;
  const blocked = projects.filter((p) => p.status === "blocked").length;
  const done = projects.filter((p) => p.status === "done").length;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Projects</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{projects.length}</div>
          </div>
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">In Progress</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{inProgress}</div>
          </div>
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Ideas</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{ideasCount}</div>
          </div>
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Reports</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{reportsCount}</div>
          </div>
        </div>

        {/* Projects */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
            <Link href="/projects" className="text-sm text-gray-400 hover:text-gray-700">
              View all →
            </Link>
          </div>
          {projects.length > 0 ? (
            <ProjectCards projects={projects} />
          ) : (
            <EmptyState
              icon={<Rocket className="w-6 h-6 text-gray-400" />}
              title="No projects yet"
              description="Add them via the API."
            />
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/projects/ideas" className="card-hover group">
            <div className="flex items-center gap-3">
              <Lightbulb className="w-6 h-6 text-amber-500" />
              <div>
                <h3 className="font-medium text-gray-900 group-hover:text-emerald-600 transition-colors">
                  Ideas Pipeline
                </h3>
                <p className="text-sm text-gray-500">{ideasCount} ideas in the pipeline</p>
              </div>
            </div>
          </Link>
          <Link href="/markets" className="card-hover group">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-emerald-500" />
              <div>
                <h3 className="font-medium text-gray-900 group-hover:text-emerald-600 transition-colors">
                  Stock Research
                </h3>
                <p className="text-sm text-gray-500">{reportsCount} Sun Tzu reports</p>
              </div>
            </div>
          </Link>
          <Link href="/acp/showcase" className="card-hover group">
            <div className="flex items-center gap-3">
              <Rocket className="w-6 h-6 text-purple-500" />
              <div>
                <h3 className="font-medium text-gray-900 group-hover:text-purple-600 transition-colors">
                  ACP Marketplace
                </h3>
                <p className="text-sm text-gray-500">31+ AI-powered offerings</p>
              </div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
