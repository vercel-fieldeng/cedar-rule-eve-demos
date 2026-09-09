import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzePolicy, validatePolicies } from "@/lib/cedar/engine";
import { StalePolicyConfigError, listPolicies, resetPolicies, upsertPolicy } from "@/lib/cedar/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const snapshot = await listPolicies();
  return NextResponse.json(
    {
      policies: snapshot.policies,
      mode: snapshot.mode,
      revision: snapshot.revision,
      etag: snapshot.etag,
      updatedAt: snapshot.config.updatedAt,
      updatedBy: snapshot.config.updatedBy,
    },
    { headers: noStore },
  );
}

const upsertSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-_]*$/i, "Use letters, numbers, dashes and underscores."),
  description: z.string().max(500).default(""),
  cedar: z.string().min(1).max(20_000),
  enabled: z.boolean().optional(),
  origin: z.enum(["seed", "console", "ai"]).optional(),
  expectedEtag: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400, headers: noStore });
  }
  const { expectedEtag, ...body } = parsed.data;
  const validation = validatePolicies(body.cedar);
  if (!validation.ok) {
    return NextResponse.json({ error: "Policy failed validation", validation }, { status: 422, headers: noStore });
  }
  if (validation.policyCount !== 1) {
    return NextResponse.json({ error: "Submit exactly one policy statement per record.", validation }, { status: 422, headers: noStore });
  }
  try {
    const analysis = analyzePolicy(body.cedar);
    const { policy, snapshot } = await upsertPolicy(body, expectedEtag);
    return NextResponse.json(
      { policy, validation, analysis, revision: snapshot.config.revision, etag: snapshot.etag },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof StalePolicyConfigError) {
      return NextResponse.json({ error: error.message, code: "STALE_POLICY_CONFIG" }, { status: 409, headers: noStore });
    }
    throw error;
  }
}

const resetSchema = z.object({ expectedEtag: z.string().min(1) });

export async function DELETE(request: Request) {
  const parsed = resetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "expectedEtag is required" }, { status: 400, headers: noStore });
  try {
    const snapshot = await resetPolicies(parsed.data.expectedEtag);
    return NextResponse.json(
      { policies: snapshot.config.policies, mode: snapshot.config.mode, revision: snapshot.config.revision, etag: snapshot.etag },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof StalePolicyConfigError) {
      return NextResponse.json({ error: error.message, code: "STALE_POLICY_CONFIG" }, { status: 409, headers: noStore });
    }
    throw error;
  }
}
