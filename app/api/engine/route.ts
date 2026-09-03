import { NextResponse } from "next/server";
import { z } from "zod";
import { cedarVersion } from "@/lib/cedar/engine";
import { getEngineMode, setEngineMode } from "@/lib/cedar/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/engine — engine mode + Cedar version. */
export async function GET() {
  const mode = await getEngineMode();
  return NextResponse.json({ mode, cedarVersion: cedarVersion() }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({ mode: z.enum(["ENFORCE", "LOG_ONLY"]) });

/**
 * PUT /api/engine — switch between ENFORCE and LOG_ONLY, mirroring the
 * AgentCore policy-engine association modes.
 */
export async function PUT(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "mode must be ENFORCE or LOG_ONLY" }, { status: 400 });
  await setEngineMode(parsed.data.mode);
  return NextResponse.json({ mode: parsed.data.mode });
}
