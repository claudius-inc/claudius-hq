import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

interface GHCommit {
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
  html_url: string;
}

interface GHPullRequest {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
}

interface GHIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string };
  created_at: string;
  pull_request?: unknown;
}

async function ghFetch<T>(url: string): Promise<T | null> {
  if (!GITHUB_TOKEN) return null;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url.replace(/\.git$/, ""));
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  } catch {
    // not a valid URL
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");

    if (!GITHUB_TOKEN) {
      return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 503 });
    }

    let sql = "SELECT id, name, repo_url FROM projects";
    const args: (string | number)[] = [];
    if (projectId) {
      sql += " WHERE id = ?";
      args.push(Number(projectId));
    }

    const projectsRes = await db.execute({ sql, args });
    const projects = projectsRes.rows as unknown as { id: number; name: string; repo_url: string }[];

    const results: Record<
      number,
      {
        project_name: string;
        repo: string;
        commits: { sha: string; message: string; author: string; date: string; url: string }[];
        pull_requests: { number: number; title: string; state: string; url: string; author: string }[];
        issues: { number: number; title: string; state: string; url: string; author: string }[];
      }
    > = {};

    for (const p of projects) {
      const parsed = parseRepoUrl(p.repo_url);
      if (!parsed) continue;

      const base = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;

      const [commits, prs, issues] = await Promise.all([
        ghFetch<GHCommit[]>(`${base}/commits?per_page=5`),
        ghFetch<GHPullRequest[]>(`${base}/pulls?state=all&per_page=5&sort=updated&direction=desc`),
        ghFetch<GHIssue[]>(`${base}/issues?state=all&per_page=5&sort=updated&direction=desc`),
      ]);

      results[p.id] = {
        project_name: p.name,
        repo: `${parsed.owner}/${parsed.repo}`,
        commits: (commits || []).map((c) => ({
          sha: c.sha.slice(0, 7),
          message: c.commit.message.split("\n")[0],
          author: c.commit.author.name,
          date: c.commit.author.date,
          url: c.html_url,
        })),
        pull_requests: (prs || []).map((pr) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          url: pr.html_url,
          author: pr.user.login,
        })),
        issues: ((issues || []).filter((i) => !i.pull_request)).map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          url: i.html_url,
          author: i.user.login,
        })),
      };
    }

    return NextResponse.json({ github: results });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
