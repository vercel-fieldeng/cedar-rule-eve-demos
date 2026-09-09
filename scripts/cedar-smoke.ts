import { TOOL_NAMES, type ToolName } from "../lib/cedar/catalog";
import { emptyAuthorizationSession, type AuthorizationSessionDocument } from "../lib/cedar/documents";
import { buildSessionContext, evaluate, validatePolicies } from "../lib/cedar/engine";
import { SEED_POLICIES } from "../lib/cedar/seed-policies";
import { findPersona } from "../lib/personas/personas";
import { principalFromPersona } from "../lib/personas/principal";

const now = "2026-09-09T14:00:00.000Z";
const policies = Object.fromEntries(SEED_POLICIES.filter((policy) => policy.enabled).map((policy) => [policy.id, policy.cedar]));

function completed(
  session: AuthorizationSessionDocument,
  action: ToolName,
  input: Record<string, unknown>,
  completedAt = "2026-09-09T13:30:00.000Z",
) {
  session.completed.push({ operationId: `${action}-${session.completed.length}`, action, input, policyRevision: 1, completedAt });
}

async function check(input: {
  name: string;
  personaId: string;
  action: ToolName;
  toolInput: Record<string, unknown>;
  expected: "ALLOW" | "DENY";
  prepare?: (state: AuthorizationSessionDocument) => void;
}) {
  const persona = findPersona(input.personaId);
  if (!persona) throw new Error(`Unknown persona ${input.personaId}`);
  const state = emptyAuthorizationSession(`smoke-${input.name}`, now);
  input.prepare?.(state);
  const result = await evaluate({
    principal: principalFromPersona(persona),
    action: input.action,
    input: input.toolInput,
    policies,
    mode: "ENFORCE",
    policyRevision: 1,
    now,
    session: buildSessionContext(state, now, 1, input.toolInput),
  });
  if (!result.valid || result.decision !== input.expected) {
    throw new Error(`${input.name}: expected ${input.expected}, received ${result.decision}; ${result.errors.join("; ")}`);
  }
  console.log(`PASS ${input.name}`);
}

const validation = validatePolicies(Object.fromEntries(SEED_POLICIES.map((policy) => [policy.id, policy.cedar])));
if (!validation.ok) throw new Error(`Default policies are invalid: ${validation.issues.map((issue) => issue.message).join("; ")}`);
if (TOOL_NAMES.length !== 8) throw new Error(`Expected 8 catalog tools, found ${TOOL_NAMES.length}`);

await check({ name: "support reads order", personaId: "maya-support", action: "lookup_order", toolInput: { orderId: "ORD-1001" }, expected: "ALLOW" });
await check({ name: "support refund denied", personaId: "maya-support", action: "process_refund", toolInput: { orderId: "ORD-1001", amount: 50, reason: "defective" }, expected: "DENY" });
await check({ name: "lead small refund", personaId: "dev-support-lead", action: "process_refund", toolInput: { orderId: "ORD-1001", amount: 120, reason: "defective" }, expected: "ALLOW" });
await check({
  name: "same-order approval",
  personaId: "dev-support-lead",
  action: "process_refund",
  toolInput: { orderId: "ORD-1002", amount: 800, reason: "defective" },
  expected: "ALLOW",
  prepare: (state) => completed(state, "approve_refund", { orderId: "ORD-1002", amount: 800 }),
});
await check({
  name: "unrelated approval denied",
  personaId: "dev-support-lead",
  action: "process_refund",
  toolInput: { orderId: "ORD-1002", amount: 800, reason: "defective" },
  expected: "DENY",
  prepare: (state) => completed(state, "approve_refund", { orderId: "ORD-1004", amount: 800 }),
});
await check({
  name: "expired approval denied",
  personaId: "dev-support-lead",
  action: "process_refund",
  toolInput: { orderId: "ORD-1002", amount: 800, reason: "defective" },
  expected: "DENY",
  prepare: (state) => completed(state, "approve_refund", { orderId: "ORD-1002", amount: 800 }, "2026-09-09T12:59:59.000Z"),
});
await check({
  name: "count cap",
  personaId: "dev-support-lead",
  action: "process_refund",
  toolInput: { orderId: "ORD-1004", amount: 100, reason: "goodwill" },
  expected: "DENY",
  prepare: (state) => {
    for (let index = 0; index < 3; index += 1) completed(state, "process_refund", { orderId: "ORD-1004", amount: 100 });
  },
});
await check({
  name: "budget cap",
  personaId: "sam-admin",
  action: "process_refund",
  toolInput: { orderId: "ORD-1004", amount: 900, reason: "goodwill" },
  expected: "DENY",
  prepare: (state) => {
    completed(state, "approve_refund", { orderId: "ORD-1004", amount: 2100 });
    completed(state, "process_refund", { orderId: "ORD-1004", amount: 1200 });
  },
});
await check({ name: "fraud forbid", personaId: "sam-admin", action: "process_refund", toolInput: { orderId: "ORD-1001", amount: 10, reason: "fraud" }, expected: "DENY" });
await check({ name: "customer sequencing denied", personaId: "maya-support", action: "lookup_customer", toolInput: { customerId: "CUST-1" }, expected: "DENY" });
await check({
  name: "customer sequencing allowed",
  personaId: "maya-support",
  action: "lookup_customer",
  toolInput: { customerId: "CUST-1" },
  expected: "ALLOW",
  prepare: (state) => completed(state, "lookup_order", { orderId: "ORD-1001" }),
});

console.log(`Cedar smoke passed with ${SEED_POLICIES.length} policies.`);
