import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "vantiops-360",
    timestamp: new Date().toISOString(),
  });
}
