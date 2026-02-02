import db, { ensureDB } from "@/lib/db";
import { Nav } from "@/components/Nav";
import { HealthStatus } from "@/components/HealthStatus";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getData() {
  await ensureDB();

  // Projects with repo URLs (GitHub integration)
  const projectsRes = await db.execute(
    "SELECT id, name, repo_url, deploy_url FROM projects ORDER BY name"
  );
  const projects = projectsRes.rows as unknown as {
    id: number;
    name: string;
    repo_url: string;
    deploy_url: string;
  }[];

  // Latest health checks
  let healthChecks: {
    project_id: number;
    project_name: string;
    url: string;
    status_code: number;
    response_time_ms: number;
    ok: boolean;
  }[] = [];
  try {
    const healthRes = await db.execute(`
      SELECT hc.*, p.name as project_name
      FROM health_checks hc
      JOIN projects p ON hc.project_id = p.id
      WHERE hc.id IN (
        SELECT MAX(id) FROM health_checks GROUP BY project_id
      )
      ORDER BY hc.checked_at DESC
    `);
    healthChecks = (
      healthRes.rows as unknown as {
        project_id: number;
        project_name: string;
        url: string;
        status_code: number;
        response_time_ms: number;
      }[]
    ).map((r) => ({
      ...r,
      ok: r.status_code >= 200 && r.status_code < 400,
    }));
  } catch {
    // health_checks table may not exist yet
  }

  const githubConfigured = !!process.env.GITHUB_TOKEN;
  const githubProjects = projects.filter((p) => p.repo_url);
  const deployedProjects = projects.filter((p) => p.deploy_url);

  return { projects, healthChecks, githubConfigured, githubProjects, deployedProjects };
}

export default async function IntegrationsPage() {
  const { healthChecks, githubConfigured, githubProjects, deployedProjects } =
    await getData();

  const integrations = [
    {
      name: "GitHub",
      emoji: "🐙",
      description: "Repository activity, commits, PRs, and issues",
      configured: githubConfigured,
      details: githubConfigured
        ? `${githubProjects.length} project${githubProjects.length !== 1 ? "s" : ""} linked`
        : "GITHUB_TOKEN not set in .env.local",
      projects: githubProjects,
    },
    {
      name: "Health Monitoring",
      emoji: "🏥",
      description: "Uptime and response time checks for deployed services",
      configured: deployedProjects.length > 0,
      details: `${deployedProjects.length} deployment${deployedProjects.length !== 1 ? "s" : ""} monitored`,
      projects: deployedProjects,
    },
    {
      name: "Turso Database",
      emoji: "🗄️",
      description: "SQLite edge database for all HQ data",
      configured: true,
      details: "Connected via libsql client",
      projects: [],
    },
  ];

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">🔌 Integrations</h1>

        {/* Integration Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {integrations.map((int) => (
            <div key={int.name} className="card">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{int.emoji}</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{int.name}</h3>
                  <p className="text-xs text-gray-400">{int.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    int.configured ? "bg-emerald-500" : "bg-gray-300"
                  }`}
                />
                <span
                  className={`text-sm ${
                    int.configured ? "text-emerald-600" : "text-gray-400"
                  }`}
                >
                  {int.configured ? "Active" : "Not configured"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{int.details}</p>
              {int.projects.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {int.projects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="status-badge bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      {p.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Health Status Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">🏥 Health Status</h2>
            <a
              href="/api/integrations/health"
              className="text-sm text-emerald-600 hover:text-emerald-700"
            >
              Run checks →
            </a>
          </div>
          <div className="card">
            <HealthStatus checks={healthChecks} />
          </div>
        </div>

        {/* GitHub Repos */}
        {githubConfigured && githubProjects.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">🐙 Connected Repositories</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {githubProjects.map((p) => {
                let repoDisplay = p.repo_url;
                try {
                  const u = new URL(p.repo_url.replace(/\.git$/, ""));
                  repoDisplay = u.pathname.slice(1);
                } catch {
                  // keep original
                }
                return (
                  <div key={p.id} className="card-hover">
                    <div className="flex items-center justify-between">
                      <div>
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-medium text-gray-900 hover:text-emerald-600 transition-colors"
                        >
                          {p.name}
                        </Link>
                        <p className="text-xs text-gray-400 mt-0.5">{repoDisplay}</p>
                      </div>
                      <a
                        href={p.repo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-400 hover:text-gray-700"
                      >
                        Open →
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
