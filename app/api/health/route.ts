import { NextResponse } from "next/server";
import { livenessBody } from "@/lib/health/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...livenessBody(), ts: new Date().toISOString() });
}
