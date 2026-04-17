import { NextResponse } from "next/server";

/**
 * Health check endpoint for deployment verification
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
