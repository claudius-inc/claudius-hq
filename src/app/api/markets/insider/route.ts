import { NextResponse } from "next/server";
import { fetchInsiderData } from "@/lib/insider";

export const revalidate = 300; // 5 min cache

export async function GET() {
  const data = await fetchInsiderData();
  return NextResponse.json({
    ...data,
    updatedAt: new Date().toISOString(),
  });
}
