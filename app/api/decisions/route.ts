import { NextResponse } from "next/server";
import { clearDecisions, listDecisions } from "@/lib/cedar/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const afterId = url.searchParams.get("afterId") ?? undefined;
  const parsedLimit = Number(url.searchParams.get("limit") ?? 100);
  const decisions = await listDecisions({
    sessionId,
    afterId,
    limit: Number.isFinite(parsedLimit) ? parsedLimit : 100,
  });
  return NextResponse.json({ decisions }, { headers: noStore });
}

export async function DELETE(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? undefined;
  const deleted = await clearDecisions(sessionId);
  return NextResponse.json({ ok: true, deleted, scope: sessionId ? "session" : "all" }, { headers: noStore });
}
