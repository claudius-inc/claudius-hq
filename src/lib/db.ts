/**
 * Database Compatibility Layer
 *
 * This module provides backward compatibility for code that used the legacy
 * database setup. New code should import directly from @/db instead.
 *
 * @deprecated Import from @/db directly for new code
 */

import { rawClient } from "@/db";

// Re-export raw client as default for backward compatibility with raw SQL queries
export default rawClient;

/**
 * Legacy ensureDB - no longer needed, Drizzle handles connections automatically
 * @deprecated No longer needed with Drizzle ORM
 */
export function ensureDB(): Promise<void> {
  return Promise.resolve();
}

/**
 * Legacy initDB - no longer needed, schema is managed by Drizzle migrations
 * @deprecated Run 'npx drizzle-kit push' instead
 */
export async function initDB(): Promise<void> {
  console.log("Note: Using Drizzle ORM - run 'npx drizzle-kit push' to sync schema");
}
