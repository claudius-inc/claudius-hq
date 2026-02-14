import { NextResponse } from "next/server";

// With Drizzle ORM, schema is managed via drizzle-kit
// Run: npx drizzle-kit push (for dev) or npx drizzle-kit migrate (for prod)
export async function POST() {
  return NextResponse.json({ 
    ok: true, 
    message: "Database managed by Drizzle ORM. Run 'npx drizzle-kit push' to sync schema." 
  });
}
