import { NextResponse } from "next/server";
import { z } from "zod";
import { cedarVersion } from "@/lib/cedar/engine";
import { StalePolicyConfigError, getEngineMode, setEngineMode } from "@/lib/cedar/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const state = await getEngineMode();
  return NextResponse.json({ ...state, cedarVersion: cedarVersion() }, { headers: noStore });
}

const schema = z.object({ mode: z.enum(["ENFORCE", "LOG_ONLY"]), expectedEtag: z.string().min(1) });

export async function PUT(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "mode and expectedEtag are required" }, { status: 400, headers: noStore });
  }
  try {
    const snapshot = await setEngineMode(parsed.data.mode, parsed.data.expectedEtag);
    return NextResponse.json(
      { mode: snapshot.config.mode, revision: snapshot.config.revision, etag: snapshot.etag },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof StalePolicyConfigError) {
      return NextResponse.json({ error: error.message, code: "STALE_POLICY_CONFIG" }, { status: 409, headers: noStore });
    }
    throw error;
  }
}
