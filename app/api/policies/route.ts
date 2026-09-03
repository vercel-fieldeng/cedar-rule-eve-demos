import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzePolicy, validatePolicies } from "@/lib/cedar/engine";
import { getEngineMode, listPolicies, resetPolicies, upsertPolicy } from "@/lib/cedar/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/policies — every stored policy plus the engine mode. */
export async function GET() {
  const [policies, mode] = await Promise.all([listPolicies(), getEngineMode()]);
  return NextResponse.json({ policies, mode }, { headers: { "Cache-Control": "no-store" } });
}

const upsertSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-_]*$/i, "Use letters, numbers, dashes and underscores."),
  description: z.string().max(500).default(""),
  cedar: z.string().min(1).max(20_000),
  enabled: z.boolean().optional(),
  origin: z.enum(["seed", "console", "ai"]).optional(),
});

/**
 * POST /api/policies — create or replace a policy.
 *
 * Like AgentCore's CreatePolicy, the statement must pass strict schema
 * validation before it is stored; analysis findings are returned as warnings.
 */
export async function POST(request: Request) {
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const validation = validatePolicies(body.cedar);
  if (!validation.ok) {
    return NextResponse.json({ error: "Policy failed validation", validation }, { status: 422 });
  }
  if (validation.policyCount !== 1) {
    return NextResponse.json(
      { error: "Submit exactly one policy statement per record.", validation },
      { status: 422 },
    );
  }

  const analysis = analyzePolicy(body.cedar);
  const policy = await upsertPolicy(body);
  return NextResponse.json({ policy, validation, analysis });
}

/** DELETE /api/policies — restore the seed set. */
export async function DELETE() {
  await resetPolicies();
  const policies = await listPolicies();
  return NextResponse.json({ policies });
}
