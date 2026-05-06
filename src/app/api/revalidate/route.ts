import { NextRequest, NextResponse } from "next/server";
import { isApiAuthenticated } from "@/lib/auth/auth";
import {
  revalidatePaths,
  revalidateTags,
  revalidateByScope,
  CACHE_TAGS,
  type RevalidationScope,
} from "@/lib/cache/revalidate";

/**
 * POST /api/revalidate
 * 
 * Invalidate Next.js ISR cache for specific paths, tags, or scopes.
 * Requires HQ_API_KEY authentication.
 * 
 * Request body options:
 * 
 * 1. Invalidate specific paths:
 *    { "paths": ["/projects", "/projects/123"] }
 * 
 * 2. Invalidate specific tags:
 *    { "tags": ["projects", "research"] }
 * 
 * 3. Invalidate by scope (with optional ID):
 *    { "scope": "projects", "id": "123" }
 *    { "scope": "research", "id": "AAPL" }
 *    { "scope": "all-markets" }
 * 
 * Valid scopes: projects, ideas, themes, research, scanner, portfolio, sectors, all-markets
 * 
 * Response:
 *    { "success": true, "revalidated": { "paths": [...], "tags": [...], "scope": "..." } }
 */
export async function POST(req: NextRequest) {
  // Auth check
  if (!isApiAuthenticated(req)) {
    return NextResponse.json(
      { error: "Unauthorized - HQ_API_KEY required" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { paths, tags, scope, id } = body;

    const revalidated: {
      paths?: string[];
      tags?: string[];
      scope?: string;
    } = {};

    // Validate at least one option is provided
    if (!paths && !tags && !scope) {
      return NextResponse.json(
        {
          error: "At least one of 'paths', 'tags', or 'scope' is required",
          validScopes: [
            "projects",
            "ideas",
            "themes",
            "research",
            "scanner",
            "portfolio",
            "sectors",
            "all-markets",
          ],
          validTags: Object.values(CACHE_TAGS),
        },
        { status: 400 }
      );
    }

    // Revalidate paths
    if (paths && Array.isArray(paths) && paths.length > 0) {
      revalidatePaths(paths);
      revalidated.paths = paths;
    }

    // Revalidate tags
    if (tags && Array.isArray(tags) && tags.length > 0) {
      revalidateTags(tags);
      revalidated.tags = tags;
    }

    // Revalidate by scope
    if (scope) {
      const validScopes: RevalidationScope[] = [
        "projects",
        "ideas",
        "themes",
        "research",
        "scanner",
        "portfolio",
        "sectors",
        "all-markets",
      ];

      if (!validScopes.includes(scope as RevalidationScope)) {
        return NextResponse.json(
          {
            error: `Invalid scope '${scope}'`,
            validScopes,
          },
          { status: 400 }
        );
      }

      revalidateByScope(scope as RevalidationScope, id);
      revalidated.scope = id ? `${scope}:${id}` : scope;
    }

    return NextResponse.json({
      success: true,
      revalidated,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to revalidate: ${String(e)}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/revalidate
 * 
 * Returns documentation and available options for the revalidation endpoint.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/revalidate",
    description: "Invalidate Next.js ISR cache",
    authentication: "Required - HQ_API_KEY via x-api-key header or Bearer token",
    options: {
      paths: {
        type: "string[]",
        description: "Specific paths to revalidate",
        example: ["/projects", "/markets/research/AAPL"],
      },
      tags: {
        type: "string[]",
        description: "Cache tags to revalidate",
        validTags: Object.values(CACHE_TAGS),
      },
      scope: {
        type: "string",
        description: "Predefined scope to revalidate",
        validScopes: [
          "projects",
          "ideas",
          "themes",
          "research",
          "scanner",
          "portfolio",
          "sectors",
          "all-markets",
        ],
      },
      id: {
        type: "string",
        description: "Optional ID for scopes that support it (projects, research)",
      },
    },
    invalidationMapping: {
      projects: {
        paths: ["/projects", "/projects/[id]"],
        tags: ["projects", "project-detail"],
      },
      ideas: {
        paths: ["/projects/ideas"],
        tags: ["ideas"],
      },
      themes: {
        paths: ["/markets/themes"],
        tags: ["themes"],
      },
      research: {
        paths: ["/markets/research", "/markets/research/[ticker]"],
        tags: ["research"],
      },
      scanner: {
        paths: ["/markets/scanner"],
        tags: ["scanner"],
      },
      portfolio: {
        paths: ["/markets/portfolio"],
        tags: ["portfolio"],
      },
      sectors: {
        paths: ["/markets/sectors"],
        tags: ["sectors"],
      },
    },
    examples: {
      revalidateProjects: {
        method: "POST",
        body: { scope: "projects" },
      },
      revalidateSpecificProject: {
        method: "POST",
        body: { scope: "projects", id: "123" },
      },
      revalidateResearchReport: {
        method: "POST",
        body: { scope: "research", id: "AAPL" },
      },
      revalidateMultiplePaths: {
        method: "POST",
        body: { paths: ["/projects", "/markets/themes", "/markets/scanner"] },
      },
      revalidateAllMarkets: {
        method: "POST",
        body: { scope: "all-markets" },
      },
    },
  });
}
