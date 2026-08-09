import { NextRequest, NextResponse } from "next/server";
import { syncAllActiveSources } from "@/lib/ingestion/sync";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Allow long-running multi-source sync on Vercel Pro. */
export const maxDuration = 300;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const header = request.headers.get("x-cron-secret");
  return header === secret;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = createServiceRoleClient();
    const result = await syncAllActiveSources({
      client,
      log: (message, extra) => {
        console.info("[sync-sources]", message, extra ?? "");
      },
    });

    const failed = result.sources.filter((s) => s.status === "failure").length;
    return NextResponse.json({
      ok: failed === 0,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[sync-sources]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Manual trigger alias (same auth). */
export async function POST(request: NextRequest) {
  return GET(request);
}
