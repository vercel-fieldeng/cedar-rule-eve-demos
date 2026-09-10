import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { TOOL_CATALOG, TOOL_NAMES } from "@/lib/cedar/catalog";
import { analyzePolicy, validatePolicies } from "@/lib/cedar/engine";
import { getCedarSchema } from "@/lib/cedar/schema";
import { PERSONAS } from "@/lib/personas/personas";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "anthropic/claude-sonnet-4.6";

const bodySchema = z.object({
  prompt: z.string().min(4).max(2000),
});

const outputSchema = z.object({
  id: z
    .string()
    .describe("kebab-case policy id, e.g. forbid-weekend-cancellations"),
  description: z.string().describe("One or two sentences describing intent and effect."),
  cedar: z.string().describe("Exactly one Cedar policy statement, starting with @id(...)."),
  notes: z.string().describe("Anything ambiguous in the request that was assumed."),
});
type Draft = z.infer<typeof outputSchema>;

function systemPrompt() {
  const tools = TOOL_NAMES.map(
    (n) => `- ${n}${TOOL_CATALOG[n].mutating ? " (mutating)" : " (read-only)"}: ${TOOL_CATALOG[n].description}`,
  ).join("\n");
  const personas = PERSONAS.map((p) => {
    const claims = Object.entries(p.claims)
      .filter(([k]) => k !== "sub")
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v}`)
      .join(" ");
    return `- ${p.kind === "user" ? `Eve::User::"${p.claims.sub}"` : `Eve::ServicePrincipal::"${p.claims.sub}"`} (${p.label}) tags: ${claims}`;
  }).join("\n");

  return `You translate plain-English authorization rules into ONE Cedar policy for an AI agent
named "orderdesk". The policy is validated in STRICT mode against the schema below, so it
must type-check exactly.

## Cedar schema (generated from the agent's tools)
${getCedarSchema()}

## Conventions
- Principals: Eve::User (simulated human attributes exposed as string tags) or Eve::ServicePrincipal (simulated workload).
- Actions: Eve::Action::"<tool_name>" — one per agent tool.
- Resource: always Eve::Agent::"orderdesk".
- Tool arguments are in context.input.<field>. Optional fields MUST be guarded:
  use \`context.input has field && context.input.field == ...\`.
- Current time is context.system.now (datetime). Use .toTime(), .toDate(), .durationSince(), duration("1h").
  There is no weekday accessor; express business hours with toTime() only.
- Session history is in context.session:
  - context.session.counts.<tool> (Long): successful plus in-flight calls, used for conservative limits.
  - context.session.prior has <tool> then context.session.prior.<tool>.{count, latest (datetime), orderIds (Set<String>), customerIds (Set<String>), amountTotal (Long)}.
  - context.session.refundApproval is optional and contains { orderId, availableAmount, latest } for fresh, successful, unconsumed approval capacity on the current order.
  Always guard optional fields with \`context.session has refundApproval &&\` or \`context.session.prior has <tool> &&\`.
- Tags: use principal.hasTag("k") && principal.getTag("k") == "v". Multi-valued claims are space-joined strings; match with \`like "*value*"\`.
- Money amounts are Long (whole units). No decimals in Cedar.
- Prefer a forbid for guardrails ("never", "block", "must not") and a permit for grants.
- Always start with @id("<same id as the id field>").
- Return exactly one policy statement ending with a semicolon. No prose, no code fences in the cedar field.

## Tools
${tools}

## Known principals
${personas}`;
}

/**
 * POST /api/policies/author — natural language → validated Cedar.
 *
 * Mirrors AgentCore's policy authoring service: generate, validate against
 * the schema, repair once if validation fails, then return with analysis
 * findings. Nothing is saved; the console lets the user review and save.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const system = systemPrompt();
  let attempt = 0;
  let lastErrors: string[] = [];
  let previousCedar = "";
  let draft: Draft | null = null;

  while (attempt < 2) {
    attempt += 1;
    const repair: string =
      lastErrors.length > 0
        ? `\n\nYour previous attempt failed strict validation with these errors. Fix them and return the corrected policy:\n${lastErrors
            .map((e) => `- ${e}`)
            .join("\n")}\n\nPrevious policy:\n${previousCedar}`
        : "";

    const { output } = await generateText({
      model: MODEL,
      system,
      prompt: `Rule: ${parsed.data.prompt}${repair}`,
      output: Output.object({ schema: outputSchema }),
    });

    const generated: Draft = output;
    const cedarText = generated.cedar.trim().replace(/^```(?:cedar)?\s*|\s*```$/g, "");
    draft = { ...generated, cedar: cedarText };
    previousCedar = cedarText;
    const validation = validatePolicies(cedarText);
    if (validation.ok && validation.policyCount === 1) {
      const analysis = analyzePolicy(cedarText);
      return NextResponse.json(
        { draft, validation, analysis, attempts: attempt, model: MODEL },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    lastErrors = validation.issues.map((i) => i.message);
    if (validation.policyCount !== 1 && validation.ok) {
      lastErrors.push("Return exactly one policy statement.");
    }
  }

  return NextResponse.json(
    {
      error: "The generated policy did not pass validation after a repair attempt.",
      draft,
      validation: draft ? validatePolicies(draft.cedar) : undefined,
      attempts: attempt,
      model: MODEL,
    },
    { status: 422 },
  );
}
