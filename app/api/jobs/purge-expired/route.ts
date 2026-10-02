import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, serverError } from "@/lib/api";
import { purgeExpiredData } from "@/lib/retention";

function hasCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Retention sweep. Call at least hourly from a scheduler with
 * `Authorization: Bearer $CRON_SECRET`. Safe to run repeatedly.
 */
export async function POST(request: NextRequest) {
  if (!hasCronSecret(request)) return apiError("Not authorized.", 401, "unauthorized");
  try {
    return NextResponse.json(await purgeExpiredData());
  } catch (error) {
    return serverError({ route: "POST /api/jobs/purge-expired" }, error);
  }
}
