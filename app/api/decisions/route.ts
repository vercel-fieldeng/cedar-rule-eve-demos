import { NextResponse } from "next/server";
import { clearDecisions, listDecisions } from "@/lib/cedar/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/decisions?sessionId=&afterId=&limit=
 *
 * The authorization audit log (AgentCore ships these to CloudWatch). The
 * console polls this with SWR to render decisions as they land.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const afterId = url.searchParams.get("afterId");
  const limit = url.searchParams.get("limit");
  const decisions = await listDecisions({
    sessionId,
    afterId: afterId ? Number(afterId) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  return NextResponse.json({ decisions }, { headers: { "Cache-Control": "no-store" } });
}

/** DELETE /api/decisions — clear the log. */
export async function DELETE() {
  await clearDecisions();
  return NextResponse.json({ ok: true });
}
