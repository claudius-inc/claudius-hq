import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "claudius-inc";
const REPO_NAME = "claudius-hq";
const WORKFLOW_FILE = "scanner.yml";

export async function POST(request: NextRequest) {
  if (!GITHUB_TOKEN) {
    return NextResponse.json(
      { error: "GitHub token not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const markets = body.markets || "US,SGX,HK";

    // Trigger GitHub Actions workflow
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            markets,
          },
        }),
      }
    );

    if (response.status === 204) {
      return NextResponse.json({
        success: true,
        message: "Scanner workflow triggered",
        markets,
      });
    }

    const errorText = await response.text();
    console.error("GitHub API error:", response.status, errorText);
    
    return NextResponse.json(
      { error: `GitHub API error: ${response.status}` },
      { status: response.status }
    );
  } catch (error) {
    console.error("Failed to trigger workflow:", error);
    return NextResponse.json(
      { error: "Failed to trigger workflow" },
      { status: 500 }
    );
  }
}

// GET - Check last run status
export async function GET() {
  if (!GITHUB_TOKEN) {
    return NextResponse.json(
      { error: "GitHub token not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    const data = await response.json();
    const lastRun = data.workflow_runs?.[0];

    if (!lastRun) {
      return NextResponse.json({ lastRun: null });
    }

    return NextResponse.json({
      lastRun: {
        id: lastRun.id,
        status: lastRun.status,
        conclusion: lastRun.conclusion,
        createdAt: lastRun.created_at,
        updatedAt: lastRun.updated_at,
        htmlUrl: lastRun.html_url,
      },
    });
  } catch (error) {
    console.error("Failed to get workflow status:", error);
    return NextResponse.json(
      { error: "Failed to get workflow status" },
      { status: 500 }
    );
  }
}
