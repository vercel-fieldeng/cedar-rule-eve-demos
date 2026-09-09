import { NextResponse } from "next/server";
import { z } from "zod";
import { StalePolicyConfigError, deletePolicy, setPolicyEnabled } from "@/lib/cedar/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const patchSchema = z.object({ enabled: z.boolean(), expectedEtag: z.string().min(1) });
const deleteSchema = z.object({ expectedEtag: z.string().min(1) });

function conflict(error: unknown) {
  return error instanceof StalePolicyConfigError
    ? NextResponse.json({ error: error.message, code: "STALE_POLICY_CONFIG" }, { status: 409, headers: noStore })
    : null;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: noStore });
  try {
    const snapshot = await setPolicyEnabled(id, parsed.data.enabled, parsed.data.expectedEtag);
    return NextResponse.json(
      { policies: snapshot.config.policies, revision: snapshot.config.revision, etag: snapshot.etag },
      { headers: noStore },
    );
  } catch (error) {
    const response = conflict(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "expectedEtag is required" }, { status: 400, headers: noStore });
  try {
    const snapshot = await deletePolicy(id, parsed.data.expectedEtag);
    return NextResponse.json(
      { policies: snapshot.config.policies, revision: snapshot.config.revision, etag: snapshot.etag },
      { headers: noStore },
    );
  } catch (error) {
    const response = conflict(error);
    if (response) return response;
    throw error;
  }
}
