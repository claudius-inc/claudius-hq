/**
 * Centralized Cache Invalidation Utility
 * 
 * This module provides helper functions and mappings for invalidating
 * Next.js ISR cache when data changes.
 * 
 * Usage from API routes:
 *   import { revalidateProjects, revalidateResearch } from "@/lib/revalidate";
 *   await revalidateProjects();
 *   await revalidateResearch("AAPL");
 */

import { revalidatePath, revalidateTag } from "next/cache";

// ============================================================================
// Cache Tags
// ============================================================================

/**
 * Cache tags for use with fetch() and revalidateTag()
 * 
 * Example usage in data fetching:
 *   fetch(url, { next: { tags: [CACHE_TAGS.PROJECTS] } })
 */
export const CACHE_TAGS = {
  // Projects
  PROJECTS: "projects",
  PROJECT_DETAIL: "project-detail",
  IDEAS: "ideas",
  
  // Markets
  THEMES: "themes",
  RESEARCH: "research",
  SCANNER: "scanner",
  PORTFOLIO: "portfolio",
  SECTORS: "sectors",
  
  // Market Data
  MACRO: "macro",
  GOLD: "gold",
  BTC: "btc",
  OIL: "oil",
} as const;

// ============================================================================
// Path Mappings
// ============================================================================

/**
 * Invalidation mapping - documents which paths to invalidate when data changes
 * 
 * Data Change          → Paths to Invalidate
 * ─────────────────────────────────────────────
 * Projects             → /projects, /projects/[id]
 * Ideas                → /projects/ideas
 * Themes               → /markets/themes
 * Research reports     → /markets/research, /markets/research/[ticker]
 * Scanner data         → /markets/scanner
 * Portfolio            → /markets/portfolio
 * Sectors              → /markets/sectors
 */

const PATHS = {
  // Projects
  PROJECTS_LIST: "/projects",
  PROJECTS_IDEAS: "/projects/ideas",
  
  // Markets
  MARKETS_HOME: "/markets",
  THEMES: "/markets/themes",
  RESEARCH_LIST: "/markets/research",
  SCANNER: "/markets/scanner",
  PORTFOLIO: "/markets/portfolio",
  SECTORS: "/markets/sectors",
} as const;

// ============================================================================
// Revalidation Functions
// ============================================================================

/**
 * Revalidate project-related pages
 * Call when: project created, updated, or deleted
 * 
 * @param projectId - Optional specific project ID to also invalidate its detail page
 */
export function revalidateProjects(projectId?: string | number): void {
  revalidatePath(PATHS.PROJECTS_LIST);
  revalidateTag(CACHE_TAGS.PROJECTS);
  
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    revalidateTag(CACHE_TAGS.PROJECT_DETAIL);
  }
}

/**
 * Revalidate ideas page
 * Call when: idea created, updated, or deleted
 */
export function revalidateIdeas(): void {
  revalidatePath(PATHS.PROJECTS_IDEAS);
  revalidateTag(CACHE_TAGS.IDEAS);
}

/**
 * Revalidate themes page
 * Call when: theme data updated
 */
export function revalidateThemes(): void {
  revalidatePath(PATHS.THEMES);
  revalidateTag(CACHE_TAGS.THEMES);
}

/**
 * Revalidate research pages
 * Call when: research report created, updated, or deleted
 * 
 * @param slug - Optional report slug (ticker or kebab-case slug) to invalidate specific report page
 */
export function revalidateResearch(slug?: string): void {
  revalidatePath(PATHS.RESEARCH_LIST);
  revalidateTag(CACHE_TAGS.RESEARCH);
  
  if (slug) {
    revalidatePath(`/markets/research/${slug}`);
  }
}

/**
 * Revalidate scanner page
 * Call when: scanner data refreshed
 */
export function revalidateScanner(): void {
  revalidatePath(PATHS.SCANNER);
  revalidateTag(CACHE_TAGS.SCANNER);
}

/**
 * Revalidate portfolio page
 * Call when: portfolio positions updated
 */
export function revalidatePortfolio(): void {
  revalidatePath(PATHS.PORTFOLIO);
  revalidateTag(CACHE_TAGS.PORTFOLIO);
}

/**
 * Revalidate sectors page
 * Call when: sector data updated
 */
export function revalidateSectors(): void {
  revalidatePath(PATHS.SECTORS);
  revalidateTag(CACHE_TAGS.SECTORS);
}

/**
 * Revalidate all market pages
 * Call when: major market data refresh
 */
export function revalidateAllMarkets(): void {
  revalidatePath(PATHS.MARKETS_HOME);
  revalidateThemes();
  revalidateResearch();
  revalidateScanner();
  revalidatePortfolio();
  revalidateSectors();
}

/**
 * Revalidate specific paths
 * For use by the API endpoint or ad-hoc invalidation
 * 
 * @param paths - Array of paths to revalidate
 */
export function revalidatePaths(paths: string[]): void {
  for (const path of paths) {
    revalidatePath(path);
  }
}

/**
 * Revalidate specific tags
 * For use by the API endpoint or ad-hoc invalidation
 * 
 * @param tags - Array of tags to revalidate
 */
export function revalidateTags(tags: string[]): void {
  for (const tag of tags) {
    revalidateTag(tag);
  }
}

// ============================================================================
// Convenience: Bulk Operations
// ============================================================================

export type RevalidationScope = 
  | "projects"
  | "ideas"
  | "themes"
  | "research"
  | "scanner"
  | "portfolio"
  | "sectors"
  | "all-markets";

/**
 * Revalidate by scope name
 * Useful for API endpoints that receive a scope string
 * 
 * @param scope - The scope to revalidate
 * @param id - Optional ID for scopes that support it (projects, research)
 */
export function revalidateByScope(scope: RevalidationScope, id?: string): void {
  switch (scope) {
    case "projects":
      revalidateProjects(id);
      break;
    case "ideas":
      revalidateIdeas();
      break;
    case "themes":
      revalidateThemes();
      break;
    case "research":
      revalidateResearch(id);
      break;
    case "scanner":
      revalidateScanner();
      break;
    case "portfolio":
      revalidatePortfolio();
      break;
    case "sectors":
      revalidateSectors();
      break;
    case "all-markets":
      revalidateAllMarkets();
      break;
  }
}
