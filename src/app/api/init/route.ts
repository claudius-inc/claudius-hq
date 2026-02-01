import { NextResponse } from "next/server";
import { initDB } from "@/lib/db";

export async function POST() {
  try {
    await initDB();
    return NextResponse.json({ ok: true, message: "Database initialized" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
