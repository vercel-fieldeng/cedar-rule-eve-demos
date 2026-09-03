import { NextResponse } from "next/server";
import { z } from "zod";
import { isToolName, TOOL_CATALOG } from "@/lib/cedar/catalog";
import {
  emptySessionContext,
  evaluate,
  type PolicySet,
  type SessionCedarContext,
  validatePolicies,
} from "@/lib/cedar/engine";
import { getEnabledPolicySet, getEngineMode } from "@/lib/cedar/store";
import { findPersona } from "@/lib/personas/personas";
import { principalFromPersona } from "@/lib/personas/principal";

export const runtime = "nodejs";

const priorSchema = z.object({
  count: z.number().int().nonnegative(),
  latest: z.string(),
  orderIds: z.array(z.string()).default([]),
  customerIds: z.array(z.string()).default([]),
  amountTotal: z.number().int().nonnegative().default(0),
});

const schema = z.object({
  personaId: z.string().min(1),
  action: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
  /** ISO timestamp for `context.system.now`. Defaults to the real clock. */
  now: z.string().datetime().optional(),
  /** Optional synthetic session history for temporal policies. */
  session: z
    .object({
      counts: z.record(z.string(), z.number().int().nonnegative()).default({}),
      prior: z.record(z.string(), priorSchema).default({}),
    })
    .optional(),
  /** Evaluate against an unsaved draft instead of stored policies. */
  draft: z.object({ id: z.string().min(1), cedar: z.string().min(1) }).optional(),
  /** Whether to include the stored (enabled) policies alongside the draft. */
  includeStored: z.boolean().default(true),
});

/**
 * POST /api/policies/test — dry-run authorization (AgentCore's test-policy).
 *
 * Nothing is logged: this evaluates the exact same request the guard would
 * build, but with a chosen persona, input, clock and session history.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const persona = findPersona(body.personaId);
  if (!persona) return NextResponse.json({ error: `Unknown persona ${body.personaId}` }, { status: 404 });
  if (!isToolName(body.action)) {
    return NextResponse.json({ error: `Unknown action ${body.action}` }, { status: 404 });
  }

  // Coerce the input through the tool's own Zod schema so the Cedar request
  // has the right types (Long vs String) exactly as in production.
  const inputParsed = TOOL_CATALOG[body.action].inputSchema.safeParse(body.input);
  if (!inputParsed.success) {
    return NextResponse.json(
      { error: "Input does not match the tool schema", issues: inputParsed.error.issues },
      { status: 422 },
    );
  }

  const policies: PolicySet = body.includeStored ? await getEnabledPolicySet() : {};
  let draftValidation = undefined;
  if (body.draft) {
    draftValidation = validatePolicies(body.draft.cedar);
    if (!draftValidation.ok) {
      return NextResponse.json({ error: "Draft failed validation", validation: draftValidation }, { status: 422 });
    }
    policies[body.draft.id] = body.draft.cedar;
  }

  const base = emptySessionContext("dry-run");
  const session: SessionCedarContext = body.session
    ? {
        ...base,
        counts: { ...base.counts, ...(body.session.counts as Partial<typeof base.counts>) },
        prior: body.session.prior as SessionCedarContext["prior"],
      }
    : base;

  const mode = await getEngineMode();
  const result = await evaluate({
    principal: principalFromPersona(persona),
    action: body.action,
    input: inputParsed.data as Record<string, unknown>,
    sessionId: "dry-run",
    turn: 0,
    now: body.now,
    session,
    policies,
    mode,
  });

  return NextResponse.json({
    result,
    policyIds: Object.keys(policies),
    draftValidation,
  });
}
