/**
 * Offline smoke test for the Cedar core. No database required.
 *
 *   npx tsx scripts/cedar-smoke.ts
 */
import { SEED_POLICIES } from "../lib/cedar/seed-policies";
import { getCedarSchema } from "../lib/cedar/schema";
import {
  analyzePolicy,
  cedarVersion,
  emptySessionContext,
  evaluate,
  validatePolicies,
  type CedarPrincipal,
  type SessionCedarContext,
} from "../lib/cedar/engine";
import { PERSONAS } from "../lib/personas/personas";

const allPolicies = Object.fromEntries(
  SEED_POLICIES.filter((p) => p.enabled !== false).map((p) => [p.id, p.cedar]),
);
const withBusinessHours = Object.fromEntries(SEED_POLICIES.map((p) => [p.id, p.cedar]));

console.log(`cedar ${cedarVersion()}`);
console.log("--- schema ---");
console.log(getCedarSchema());

console.log("\n--- validate seed policies ---");
const report = validatePolicies(allPolicies);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);

console.log("\n--- analysis per policy ---");
for (const p of SEED_POLICIES) {
  const findings = analyzePolicy(p.cedar);
  console.log(`${p.id}: ${findings.map((f) => `[${f.kind}] ${f.message}`).join(" | ")}`);
}

const SHORT: Record<string, string> = {
  maya: "maya-support",
  dev: "dev-support-lead",
  priya: "priya-finance",
  sam: "sam-admin",
  lena: "contractor-eu",
  reconciler: "svc-nightly-reconciler",
};

function principal(short: string): CedarPrincipal {
  const persona = PERSONAS.find((p) => p.id === SHORT[short]);
  if (!persona) throw new Error(`unknown persona ${short}`);
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(persona.claims)) {
    if (k === "sub") continue;
    tags[k] = Array.isArray(v) ? v.join(" ") : String(v);
  }
  return { kind: persona.kind, id: String(persona.claims.sub), tags };
}

interface Case {
  name: string;
  persona: string;
  action: Parameters<typeof evaluate>[0]["action"];
  input: Record<string, unknown>;
  expect: "ALLOW" | "DENY";
  now?: string;
  session?: SessionCedarContext;
  /** Use the full set including disabled-by-default policies. */
  allPolicies?: boolean;
}

const inWindow = "2026-09-03T15:00:00Z"; // 15:00 UTC, inside business hours
const afterHours = "2026-09-03T23:30:00Z"; // 23:30 UTC

const cases: Case[] = [
  { name: "support reads order", persona: "maya", action: "lookup_order", input: { orderId: "ORD-1001" }, expect: "ALLOW" },
  { name: "support cannot refund", persona: "maya", action: "process_refund", input: { orderId: "ORD-1001", amount: 50, reason: "defective" }, expect: "DENY" },
  { name: "lead refunds under cap w/o approval", persona: "dev", action: "process_refund", input: { orderId: "ORD-1001", amount: 120, reason: "defective" }, expect: "ALLOW", now: inWindow },
  { name: "lead refund >= 500 needs approval (none yet)", persona: "dev", action: "process_refund", input: { orderId: "ORD-1002", amount: 800, reason: "defective" }, expect: "DENY", now: inWindow },
  {
    name: "lead refund >= 500 after finance approval in-session",
    persona: "dev",
    action: "process_refund",
    input: { orderId: "ORD-1002", amount: 800, reason: "defective" },
    expect: "ALLOW",
    now: inWindow,
    session: {
      ...emptySessionContext("s1"),
      prior: { approve_refund: { count: 1, latest: "2026-09-03T14:50:00Z", orderIds: ["ORD-1002"], customerIds: [], amountTotal: 800 } },
    },
  },
  {
    name: "approval expired (>1h)",
    persona: "dev",
    action: "process_refund",
    input: { orderId: "ORD-1002", amount: 800, reason: "defective" },
    expect: "DENY",
    now: inWindow,
    session: {
      ...emptySessionContext("s1"),
      prior: { approve_refund: { count: 1, latest: "2026-09-03T13:00:00Z", orderIds: ["ORD-1002"], customerIds: [], amountTotal: 800 } },
    },
  },
  { name: "fraud reason always forbidden", persona: "sam", action: "process_refund", input: { orderId: "ORD-1001", amount: 10, reason: "suspected fraud" }, expect: "DENY", now: inWindow },
  { name: "finance approves refund", persona: "priya", action: "approve_refund", input: { orderId: "ORD-1002", amount: 800 }, expect: "ALLOW" },
  { name: "lead cannot approve own refunds", persona: "dev", action: "approve_refund", input: { orderId: "ORD-1002", amount: 800 }, expect: "DENY" },
  {
    name: "session refund count cap (3 already)",
    persona: "dev",
    action: "process_refund",
    input: { orderId: "ORD-1005", amount: 20, reason: "late" },
    expect: "DENY",
    now: inWindow,
    session: { ...emptySessionContext("s2"), counts: { ...emptySessionContext("s2").counts, process_refund: 3 } },
  },
  {
    name: "session refund budget cap",
    persona: "dev",
    action: "process_refund",
    input: { orderId: "ORD-1005", amount: 300, reason: "late" },
    expect: "DENY",
    now: inWindow,
    session: {
      ...emptySessionContext("s3"),
      counts: { ...emptySessionContext("s3").counts, process_refund: 1 },
      prior: { process_refund: { count: 1, latest: "2026-09-03T14:00:00Z", orderIds: ["ORD-1004"], customerIds: [], amountTotal: 1800 } },
    },
  },
  { name: "lead cancels order", persona: "dev", action: "cancel_order", input: { orderId: "ORD-1003", notifyCustomer: true }, expect: "ALLOW", now: inWindow },
  { name: "support cannot cancel", persona: "maya", action: "cancel_order", input: { orderId: "ORD-1003", notifyCustomer: true }, expect: "DENY", now: inWindow },
  { name: "[hours on] cancel after hours blocked", persona: "dev", action: "cancel_order", input: { orderId: "ORD-1003", notifyCustomer: true }, expect: "DENY", now: afterHours, allPolicies: true },
  { name: "[hours on] cancel in hours allowed", persona: "dev", action: "cancel_order", input: { orderId: "ORD-1003", notifyCustomer: true }, expect: "ALLOW", now: inWindow, allPolicies: true },
  { name: "[eu forbid on] eu admin cannot cancel", persona: "sam", action: "cancel_order", input: { orderId: "ORD-1003", notifyCustomer: true }, expect: "DENY", now: inWindow, allPolicies: true },
  { name: "lead ships to US", persona: "dev", action: "update_shipping_address", input: { orderId: "ORD-1003", country: "US", line1: "1 Main", city: "Austin", postalCode: "78701" }, expect: "ALLOW" },
  { name: "lead ships to DE (not domestic)", persona: "dev", action: "update_shipping_address", input: { orderId: "ORD-1003", country: "DE", line1: "1 Str", city: "Berlin", postalCode: "10115" }, expect: "DENY" },
  { name: "admin ships to DE", persona: "sam", action: "update_shipping_address", input: { orderId: "ORD-1003", country: "DE", line1: "1 Str", city: "Berlin", postalCode: "10115" }, expect: "ALLOW" },
  { name: "discount 20% ok", persona: "priya", action: "apply_discount", input: { orderId: "ORD-1001", percent: 20 }, expect: "ALLOW" },
  { name: "discount 60% too high", persona: "priya", action: "apply_discount", input: { orderId: "ORD-1001", percent: 60 }, expect: "DENY" },
  { name: "contractor cannot export PII", persona: "lena", action: "export_customer_data", input: { customerId: "CUST-1", format: "full", includePii: true }, expect: "DENY" },
  { name: "admin exports PII", persona: "sam", action: "export_customer_data", input: { customerId: "CUST-1", format: "full", includePii: true }, expect: "ALLOW" },
  { name: "service principal reads order", persona: "reconciler", action: "lookup_order", input: { orderId: "ORD-1001" }, expect: "ALLOW" },
  { name: "service principal cannot refund", persona: "reconciler", action: "process_refund", input: { orderId: "ORD-1001", amount: 5, reason: "x" }, expect: "DENY" },
  {
    name: "lookup customer requires lookup_order first",
    persona: "maya",
    action: "lookup_customer",
    input: { customerId: "CUST-1" },
    expect: "DENY",
  },
  {
    name: "lookup customer after lookup_order",
    persona: "maya",
    action: "lookup_customer",
    input: { customerId: "CUST-1" },
    expect: "ALLOW",
    session: {
      ...emptySessionContext("s4"),
      counts: { ...emptySessionContext("s4").counts, lookup_order: 1 },
      prior: { lookup_order: { count: 1, latest: "2026-09-03T14:59:00Z", orderIds: ["ORD-1001"], customerIds: [], amountTotal: 0 } },
    },
  },
];

async function main() {
console.log("\n--- authorization matrix ---");
let failures = 0;
for (const c of cases) {
  const r = await evaluate({
    principal: principal(c.persona),
    action: c.action,
    input: c.input,
    sessionId: c.session?.id ?? "smoke",
    turn: 1,
    now: c.now,
    session: c.session ?? emptySessionContext("smoke"),
    policies: c.allPolicies ? withBusinessHours : allPolicies,
    mode: "ENFORCE",
  });
  const ok = r.decision === c.expect;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(48)} -> ${r.decision.padEnd(5)} [${r.determiningPolicies.join(", ")}]${
      r.errors.length ? ` errors: ${r.errors.join("; ")}` : ""
    }`,
  );
}
console.log(`\n${cases.length - failures}/${cases.length} passed`);
process.exit(failures ? 1 : 0);
}

void main();
