// Legacy compatibility layer - re-exports from new Drizzle setup
// TODO: Migrate all imports to use @/db directly

import { rawClient } from "@/db";

// Re-export raw client as default for backward compatibility with raw SQL queries
export default rawClient;

// Legacy ensureDB is no longer needed - Drizzle handles connections automatically
export function ensureDB(): Promise<void> {
  return Promise.resolve();
}

// Legacy initDB no longer needed - schema is managed by Drizzle migrations
export async function initDB(): Promise<void> {
  // No-op: Drizzle Kit manages migrations now
  // Run: npx drizzle-kit push (for dev) or npx drizzle-kit migrate (for prod)
  console.log("Note: Using Drizzle ORM - run 'npx drizzle-kit push' to sync schema");
}
