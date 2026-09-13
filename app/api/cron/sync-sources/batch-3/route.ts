import { NextRequest } from "next/server";
import { handleSyncCronRequest } from "@/lib/ingestion/cron-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const ROUTE = "/api/cron/sync-sources/batch-3";

export async function GET(request: NextRequest) {
  return handleSyncCronRequest(request, { route: ROUTE, batchId: 3 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
