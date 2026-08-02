import { NextResponse } from "next/server";
import { calculateQualityReport } from "@/lib/server/quality-service";
import { parseFiltersFromRequest, FilterValidationError } from "@/lib/server/query-filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    let filters;
    try {
      filters = parseFiltersFromRequest(request);
    } catch (e) {
      if (e instanceof FilterValidationError) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: e.message, details: e.errors } },
          { status: 422 }
        );
      }
      throw e;
    }

    const report = await calculateQualityReport(filters);
    return NextResponse.json(report);
  } catch (error) {
    console.error("Quality API error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to compute quality metrics" } },
      { status: 500 }
    );
  }
}
