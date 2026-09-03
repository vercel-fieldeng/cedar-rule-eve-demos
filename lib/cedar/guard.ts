import { defineTool, type ToolContext } from "eve/tools";
import type { z } from "zod";
import { authorize, principalFromSessionAuth } from "@/lib/cedar/engine";
import type { ToolName } from "@/lib/cedar/catalog";

/**
 * The Cedar enforcement point.
 *
 * eve hooks are observe-only, so enforcement lives at the tool boundary:
 * every business tool is wrapped with `guarded(...)`. Before `execute` runs we:
 *
 *   1. Resolve the Cedar principal from the eve session auth (JWT claims -> tags).
 *   2. Build the request (action = tool name, resource = the agent, context.input = tool input,
 *      context.system.now, context.session = temporal facts derived from the decision log).
 *   3. Ask the Cedar engine for a decision and record it.
 *   4. In ENFORCE mode a DENY short-circuits and returns a structured denial to the model.
 *      In LOG_ONLY mode the decision is recorded but the tool still executes.
 *
 * This mirrors the AgentCore Gateway -> Policy Engine interception, expressed
 * as a single composable wrapper inside eve.
 */

export interface GuardedToolOptions<TSchema extends z.ZodType> {
  description: string;
  inputSchema: TSchema;
  execute: (input: z.infer<TSchema>, ctx: ToolContext) => Promise<unknown> | unknown;
}

export interface PolicyDenied {
  denied: true;
  decision: "DENY";
  action: string;
  reason: string;
  determiningPolicies: string[];
  hint: string;
}

export function guarded<TSchema extends z.ZodType>(action: ToolName, options: GuardedToolOptions<TSchema>) {
  return defineTool({
    description: options.description,
    inputSchema: options.inputSchema,
    async execute(input, ctx) {
      const principal = principalFromSessionAuth(ctx.session.auth.current);
      const result = await authorize({
        principal,
        action,
        input: input as Record<string, unknown>,
        sessionId: ctx.session.id,
        turn: ctx.session.turn.sequence,
      });

      if (result.enforced) {
        const denial: PolicyDenied = {
          denied: true,
          decision: "DENY",
          action,
          reason:
            result.determiningPolicies.length > 0
              ? `Blocked by Cedar policy: ${result.determiningPolicies.join(", ")}`
              : "No Cedar policy permits this action for the current principal (default deny).",
          determiningPolicies: result.determiningPolicies,
          hint: "Tell the user which policy blocked the request and what they can do instead. Do not retry with different parameters unless the user asks.",
        };
        return denial;
      }

      const output = await options.execute(input as z.infer<TSchema>, ctx);
      if (result.decision === "DENY") {
        // LOG_ONLY mode: surface the would-be denial next to the real result.
        const base =
          typeof output === "object" && output !== null ? (output as Record<string, unknown>) : { result: output };
        return {
          ...base,
          _policy: { mode: "LOG_ONLY", wouldDeny: true, determiningPolicies: result.determiningPolicies },
        };
      }
      return output;
    },
  });
}
