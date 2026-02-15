import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Create the libsql client
const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Create the Drizzle ORM instance
export const db = drizzle(client, { schema });

// Export schema for convenience
export * from "./schema";

// Re-export the raw client for cases where we need direct SQL
export { client, client as rawClient };
