import { defineTool, type ToolContext } from "eve/tools";
import type { z } from "zod";
import type { ToolName } from "@/lib/cedar/catalog";
import { authorizationRunner } from "@/lib/cedar/operation-runner";
import { principalFromSessionAuth } from "@/lib/personas/principal";

export interface GuardedToolOptions<TSchema extends z.ZodType> {
  description: string;
  inputSchema: TSchema;
  execute: (input: z.infer<TSchema>, ctx: ToolContext) => Promise<unknown> | unknown;
  isSuccess?: (output: unknown) => boolean;
}

export interface PolicyDenied {
  authorized: false;
  denied: true;
  decision: "DENY";
  outcome: "blocked";
  action: string;
  policyRevision: number;
  reason: string;
  determiningPolicies: string[];
  errors: string[];
  hint: string;
}

export function guarded<TSchema extends z.ZodType>(action: ToolName, options: GuardedToolOptions<TSchema>) {
  return defineTool({
    description: options.description,
    inputSchema: options.inputSchema,
    async execute(input, ctx) {
      const principal = principalFromSessionAuth(ctx.session.auth.current);
      const result = await authorizationRunner.run({
        principal,
        action,
        input: input as Record<string, unknown>,
        sessionId: ctx.session.id,
        turn: ctx.session.turn.sequence,
        execute: async () => options.execute(input as z.infer<TSchema>, ctx),
        isSuccess: options.isSuccess,
      });

      if (result.kind === "blocked") {
        const evaluationFailed = !result.evaluation.valid;
        const denial: PolicyDenied = {
          authorized: false,
          denied: true,
          decision: "DENY",
          outcome: "blocked",
          action,
          policyRevision: result.evaluation.policyRevision,
          reason: evaluationFailed
            ? "Cedar evaluation failed closed; the tool was not executed."
            : result.evaluation.determiningPolicies.length > 0
              ? `Blocked by Cedar policy: ${result.evaluation.determiningPolicies.join(", ")}`
              : "No Cedar policy permits this action for the current principal (default deny).",
          determiningPolicies: result.evaluation.determiningPolicies,
          errors: result.evaluation.errors,
          hint: "Explain the denial and do not claim that the business operation happened.",
        };
        return denial;
      }

      const base =
        typeof result.output === "object" && result.output !== null
          ? (result.output as Record<string, unknown>)
          : { result: result.output };
      return {
        ...base,
        authorized: true,
        outcome: result.outcome,
        decisionId: result.decisionId,
        policyRevision: result.evaluation.policyRevision,
        ...(result.evaluation.decision === "DENY"
          ? {
              logOnly: true,
              _policy: {
                mode: "LOG_ONLY",
                wouldDeny: true,
                determiningPolicies: result.evaluation.determiningPolicies,
              },
            }
          : {}),
      };
    },
  });
}
