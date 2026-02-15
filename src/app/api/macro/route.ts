import { NextResponse } from "next/server";
import { fetchMacroData } from "@/lib/fetch-macro-data";

// Cache for 1 hour (most data is daily at best)
export const revalidate = 3600;

export async function GET() {
  const data = await fetchMacroData();
  return NextResponse.json(data);
}
