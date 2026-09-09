/**
 * Guided demo scenarios. Each one names the persona to switch to, the
 * prompt to send in the chat, what Cedar should decide, and the AgentCore
 * Policy feature it mirrors. Policy ids reference lib/cedar/seed-policies.ts.
 */
export interface Scenario {
  id: string;
  title: string;
  agentcore: string;
  personaId: string;
  prompt: string;
  expect: string;
  policies: string[];
  /** Console prep before running the prompt, if any. */
  setup?: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "rbac-allow",
    title: "Role-based permit",
    agentcore: "Principal attribute conditions on AgentCore::OAuthUser (JWT claims as tags)",
    personaId: "dev-support-lead",
    prompt: "Look up order ORD-1001, then refund $120 on it for a defective item. Do not ask me to confirm.",
    expect:
      "ALLOW on lookup_order (read-access-for-staff) and ALLOW on process_refund because role=support-lead and amount < 500.",
    policies: ["read-access-for-staff", "refund-under-500-for-leads"],
  },
  {
    id: "rbac-deny",
    title: "Default deny for L1 support",
    agentcore: "Cedar default-deny: with no matching permit the answer is DENY",
    personaId: "maya-support",
    prompt: "Refund $120 on ORD-1001 for a defective item. Do not ask me to confirm.",
    expect: "DENY on process_refund: no permit covers role=support. The agent explains the denial and offers to escalate.",
    policies: ["refund-under-500-for-leads"],
  },
  {
    id: "input-threshold",
    title: "Tool-input threshold",
    agentcore: "Conditions on tool arguments through context.input.<field>",
    personaId: "dev-support-lead",
    prompt: "Refund $750 on ORD-1002, reason: damaged in transit. Do not ask me to confirm.",
    expect: "DENY: amount >= 500 and there is no prior approve_refund in this session.",
    policies: ["refund-under-500-for-leads", "refund-large-requires-prior-approval"],
  },
  {
    id: "temporal-approval",
    title: "Temporal: approval before a large refund",
    agentcore: "Temporal policies: action B allowed only after action A earlier in the same session",
    personaId: "sam-admin",
    prompt:
      "Record an approval for a $750 refund on ORD-1002 (approver: Sam, reason: damaged in transit), then process that $750 refund on ORD-1002. Do not ask me to confirm.",
    expect:
      "ALLOW on approve_refund (finance-approves-refunds), then ALLOW on process_refund: same order, amount covered, approval less than 1h old.",
    policies: ["finance-approves-refunds", "refund-large-requires-prior-approval"],
  },
  {
    id: "temporal-count",
    title: "Temporal: at most 3 refunds per session",
    agentcore: "Session counters over prior tool calls (context.session.counts)",
    personaId: "dev-support-lead",
    prompt:
      "Process four separate $100 refunds on ORD-1004, reason: goodwill. Run them one after another without asking me to confirm.",
    expect: "ALLOW three times, then DENY on the fourth (forbid-more-than-3-refunds-per-session).",
    policies: ["forbid-more-than-3-refunds-per-session"],
  },
  {
    id: "temporal-budget",
    title: "Temporal: per-session refund budget",
    agentcore: "Aggregates over session history (sum of prior refund amounts)",
    personaId: "sam-admin",
    prompt:
      "Approve $2100 of refund capacity on ORD-1004 (approver Sam, reason: lost shipment), process a $1200 refund, then process another $900 refund on ORD-1004 for the same reason. Do not ask me to confirm.",
    expect: "The $1200 refund is allowed and consumes approval capacity; the $900 one is DENIED because 1200 + 900 exceeds the 2000 session budget.",
    policies: ["forbid-refund-budget-over-2000", "refund-large-requires-prior-approval"],
  },
  {
    id: "temporal-sequence",
    title: "Temporal: sequencing",
    agentcore: "Ordering constraints: customer lookup only after an order lookup",
    personaId: "maya-support",
    prompt: "Show me the profile for customer CUST-1.",
    expect: "DENY on lookup_customer while lookup_order count is 0. Ask for ORD-1001 first, then retry to see ALLOW.",
    policies: ["forbid-customer-lookup-before-order-lookup", "read-access-for-staff"],
  },
  {
    id: "forbid-override",
    title: "Forbid beats every permit",
    agentcore: "forbid guardrails that override permits, with `like` pattern matching",
    personaId: "sam-admin",
    prompt: "Refund $50 on ORD-1003, reason: suspected fraud. Do not ask me to confirm.",
    expect: "DENY even for an admin: forbid-fraud-refunds matches reason like \"*fraud*\".",
    policies: ["forbid-fraud-refunds", "refund-under-500-for-leads"],
  },
  {
    id: "service-principal",
    title: "Service principal",
    agentcore: "AgentCore::IamEntity for machine callers, plus `has` guards on optional inputs",
    personaId: "svc-nightly-reconciler",
    prompt:
      "Export customer data for CUST-2 in summary format, then export the same customer in full format including PII. Do not ask me to confirm.",
    expect: "ALLOW on the summary export; DENY on the full/PII export (service-reconciler-summary-exports).",
    policies: ["service-reconciler-readonly", "service-reconciler-summary-exports"],
  },
  {
    id: "contractor-forbid",
    title: "Attribute-based forbid",
    agentcore: "Forbid on a principal attribute (employment=contractor) regardless of role",
    personaId: "contractor-eu",
    prompt: "Export customer data for CUST-3 in summary format. Do not ask me to confirm.",
    expect: "DENY: forbid-contractor-pii blocks any export_customer_data for contractors.",
    policies: ["forbid-contractor-pii"],
  },
  {
    id: "log-only",
    title: "LOG_ONLY mode",
    agentcore: "Policy engine mode: LOG_ONLY records the decision without blocking the tool",
    personaId: "maya-support",
    setup: "Switch the engine to LOG_ONLY in the header first.",
    prompt: "Refund $120 on ORD-1001 for a defective item. Do not ask me to confirm.",
    expect: "The refund executes, but the log shows DENY with enforced=false. Switch back to ENFORCE afterwards.",
    policies: ["refund-under-500-for-leads"],
  },
  {
    id: "time-window",
    title: "Business-hours window",
    agentcore: "context.system.now with the Cedar datetime and duration extensions",
    personaId: "dev-support-lead",
    setup: "Enable forbid-mutations-outside-business-hours in the Policies tab.",
    prompt: "Cancel order ORD-1005, reason: customer request. Do not ask me to confirm.",
    expect: "ALLOW between 08:00 and 20:00 UTC, DENY otherwise. The Test tab lets you pin the clock to see both outcomes.",
    policies: ["forbid-mutations-outside-business-hours", "leads-cancel-orders"],
  },
];
