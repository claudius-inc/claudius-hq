import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import { db, memoriaTags } from "@/db";
import { asc } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  if (!checkApiAuth(request)) return unauthorizedResponse();
  try {
  if (!checkApiAuth(request)) return unauthorizedResponse();
    const tags = await db.select().from(memoriaTags).orderBy(asc(memoriaTags.name));
    return NextResponse.json({ tags });
  } catch (e) {
    logger.error("api/memoria/tags", "Failed to list tags", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, color } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const [tag] = await db
      .insert(memoriaTags)
      .values({ name: name.toLowerCase().trim(), color: color || null })
      .returning();

    return NextResponse.json({ tag }, { status: 201 });
  } catch (e) {
    logger.error("api/memoria/tags", "Failed to create tag", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
