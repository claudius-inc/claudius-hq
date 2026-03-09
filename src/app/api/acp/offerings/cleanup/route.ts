import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { inArray } from "drizzle-orm";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// DELETE: Remove offerings by name
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { names } = body;

    if (!Array.isArray(names)) {
      return NextResponse.json({ error: "names array required" }, { status: 400 });
    }

    await db.delete(acpOfferings).where(inArray(acpOfferings.name, names));

    return NextResponse.json({ success: true, deleted: names });
  } catch (error) {
    console.error("Error deleting offerings:", error);
    return NextResponse.json({ error: "Failed to delete offerings" }, { status: 500 });
  }
}
