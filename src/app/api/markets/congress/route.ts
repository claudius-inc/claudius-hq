import { NextResponse } from "next/server";
import { fetchCongressData } from "@/lib/markets/congress";

export const revalidate = 300; // 5 min cache

export async function GET() {
  const data = await fetchCongressData();
  return NextResponse.json({
    ...data,
    updatedAt: new Date().toISOString(),
  });
}
