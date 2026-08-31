import { NextResponse } from "next/server";
import { livenessBody } from "@/lib/health/payload";

export async function GET() {
  return NextResponse.json({ ...livenessBody(), ts: new Date().toISOString() });
}
