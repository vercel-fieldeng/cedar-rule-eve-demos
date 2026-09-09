import { NextResponse } from "next/server";
import { z } from "zod";
import { isToolName, TOOL_CATALOG, TOOL_NAMES } from "@/lib/cedar/catalog";
import { emptySessionContext, evaluate, type PolicySet, type SessionCedarContext, validatePolicies } from "@/lib/cedar/engine";
import { getEnabledPolicySet } from "@/lib/cedar/store";
import { findPersona } from "@/lib/personas/personas";
import { principalFromPersona } from "@/lib/personas/principal";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

const priorSchema = z.object({
  count: z.number().int().nonnegative(),
  latest: z.string().datetime(),
  orderIds: z.array(z.string()).default([]),
  customerIds: z.array(z.string()).default([]),
  amountTotal: z.number().int().nonnegative().default(0),
});

const schema = z.object({
  personaId: z.string().min(1),
  action: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
  now: z.string().datetime().optional(),
  session: z.object({
    counts: z.record(z.string(), z.number().int().nonnegative()).default({}),
    prior: z.record(z.string(), priorSchema).default({}),
    refundApproval: z.object({ orderId: z.string(), availableAmount: z.number().int().nonnegative(), latest: z.string().datetime() }).optional(),
  }).optional(),
  draft: z.object({ id: z.string().min(1), cedar: z.string().min(1) }).optional(),
  includeStored: z.boolean().default(true),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400, headers: noStore });
  }
  const body = parsed.data;
  const persona = findPersona(body.personaId);
  if (!persona) return NextResponse.json({ error: `Unknown persona ${body.personaId}` }, { status: 404, headers: noStore });
  if (!isToolName(body.action)) return NextResponse.json({ error: `Unknown action ${body.action}` }, { status: 404, headers: noStore });

  const inputParsed = TOOL_CATALOG[body.action].inputSchema.safeParse(body.input);
  if (!inputParsed.success) {
    return NextResponse.json({ error: "Input does not match the tool schema", issues: inputParsed.error.issues }, { status: 422, headers: noStore });
  }

  const stored = await getEnabledPolicySet();
  const policies: PolicySet = body.includeStored ? { ...stored.policies } : {};
  let draftValidation;
  if (body.draft) {
    draftValidation = validatePolicies(body.draft.cedar);
    if (!draftValidation.ok) {
      return NextResponse.json({ error: "Draft failed validation", validation: draftValidation }, { status: 422, headers: noStore });
    }
    policies[body.draft.id] = body.draft.cedar;
  }

  const base = emptySessionContext("dry-run");
  const session: SessionCedarContext = body.session
    ? {
        ...base,
        counts: Object.fromEntries(TOOL_NAMES.map((tool) => [tool, body.session?.counts[tool] ?? 0])) as SessionCedarContext["counts"],
        prior: body.session.prior as SessionCedarContext["prior"],
        refundApproval: body.session.refundApproval,
      }
    : base;
  const result = await evaluate({
    principal: principalFromPersona(persona),
    action: body.action,
    input: inputParsed.data as Record<string, unknown>,
    now: body.now ?? new Date().toISOString(),
    session,
    policies,
    mode: stored.mode,
    policyRevision: stored.revision,
  });

  return NextResponse.json({ result, policyIds: Object.keys(policies), draftValidation, testedRevision: stored.revision }, { headers: noStore });
}
