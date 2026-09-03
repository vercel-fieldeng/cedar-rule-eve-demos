/**
 * Seed policy set. Each entry demonstrates one AgentCore Policy capability
 * expressed against the eve schema. Descriptions carry the AgentCore parity
 * note shown in the console.
 *
 * Cedar semantics (same as AgentCore): default deny; any matching `forbid`
 * wins over every `permit`.
 */
export interface SeedPolicy {
  readonly id: string;
  readonly description: string;
  readonly cedar: string;
  readonly enabled?: boolean;
}

const A = (tool: string) => `Eve::Action::"${tool}"`;
const AGENT = `Eve::Agent::"orderdesk"`;

export const SEED_POLICIES: readonly SeedPolicy[] = [
  /* ---------------------------------------------------------------- */
  /* 1. Role-based read access                                          */
  /* ---------------------------------------------------------------- */
  {
    id: "read-access-for-staff",
    description:
      "Any authenticated user with an orders:read scope may look up orders and customers. Mirrors AgentCore's basic permit on OAuthUser with a scope claim tag.",
    cedar: `@id("read-access-for-staff")
permit (
  principal is Eve::User,
  action in [${A("lookup_order")}, ${A("lookup_customer")}],
  resource == ${AGENT}
)
when {
  principal.hasTag("scope") &&
  (principal.getTag("scope") like "*orders:read*" || principal.getTag("scope") like "*orders:\\**")
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 2. Service principal (IamEntity analogue)                          */
  /* ---------------------------------------------------------------- */
  {
    id: "service-reconciler-readonly",
    description:
      "The nightly reconciler workload may look up orders and run non-PII summary exports. Mirrors AgentCore's AgentCore::IamEntity principal for machine callers.",
    cedar: `@id("service-reconciler-readonly")
permit (
  principal == Eve::ServicePrincipal::"svc-nightly-reconciler",
  action in [${A("lookup_order")}, ${A("lookup_customer")}, ${A("export_customer_data")}],
  resource == ${AGENT}
)
when {
  !(action == ${A("export_customer_data")}) ||
  (context.input.format == "summary" && context.input.includePii == false)
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 3. Input-parameter constraint (amount threshold)                   */
  /* ---------------------------------------------------------------- */
  {
    id: "refund-under-500-for-leads",
    description:
      "Support leads and admins may process refunds below 500 without approval. Mirrors AgentCore's context.input parameter constraints on tool arguments.",
    cedar: `@id("refund-under-500-for-leads")
permit (
  principal is Eve::User,
  action == ${A("process_refund")},
  resource == ${AGENT}
)
when {
  principal.hasTag("role") &&
  ["support-lead", "admin"].contains(principal.getTag("role")) &&
  context.input.amount < 500
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 4. Temporal: approval-before-action                                */
  /* ---------------------------------------------------------------- */
  {
    id: "refund-large-requires-prior-approval",
    description:
      "Refunds of 500 or more are allowed only if approve_refund already ran in this session for the same order and covered the amount. Mirrors AgentCore temporal policies (Dogwood) 'action B only after action A'.",
    cedar: `@id("refund-large-requires-prior-approval")
permit (
  principal is Eve::User,
  action == ${A("process_refund")},
  resource == ${AGENT}
)
when {
  principal.hasTag("role") &&
  ["support-lead", "admin"].contains(principal.getTag("role")) &&
  context.input.amount >= 500 &&
  context.session.prior has approve_refund &&
  context.session.prior.approve_refund.orderIds.contains(context.input.orderId) &&
  context.session.prior.approve_refund.amountTotal >= context.input.amount
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 5. Finance approves refunds                                        */
  /* ---------------------------------------------------------------- */
  {
    id: "finance-approves-refunds",
    description:
      "Only finance (or admin) may record refund approvals, and only up to 5000. Role tag plus input threshold.",
    cedar: `@id("finance-approves-refunds")
permit (
  principal is Eve::User,
  action == ${A("approve_refund")},
  resource == ${AGENT}
)
when {
  principal.hasTag("role") &&
  ["finance", "admin"].contains(principal.getTag("role")) &&
  context.input.amount <= 5000
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 6. Guardrail forbid (overrides every permit)                       */
  /* ---------------------------------------------------------------- */
  {
    id: "forbid-fraud-refunds",
    description:
      "No one, not even admins, may refund with reason 'fraud' through the agent; fraud cases go to a human queue. Mirrors AgentCore forbid guardrails that override all permits.",
    cedar: `@id("forbid-fraud-refunds")
forbid (
  principal,
  action == ${A("process_refund")},
  resource
)
when { context.input.reason == "fraud" };`,
  },

  /* ---------------------------------------------------------------- */
  /* 7. Temporal: per-session count cap                                 */
  /* ---------------------------------------------------------------- */
  {
    id: "forbid-more-than-3-refunds-per-session",
    description:
      "At most 3 refunds may be processed in one agent session. Mirrors AgentCore temporal 'count of action A in session' limits.",
    cedar: `@id("forbid-more-than-3-refunds-per-session")
forbid (
  principal,
  action == ${A("process_refund")},
  resource
)
when { context.session.counts.process_refund >= 3 };`,
  },

  /* ---------------------------------------------------------------- */
  /* 8. Temporal: cumulative budget cap                                 */
  /* ---------------------------------------------------------------- */
  {
    id: "forbid-refund-budget-over-2000",
    description:
      "The running total refunded in a session plus this refund may not exceed 2000. Mirrors AgentCore temporal aggregate/budget policies.",
    cedar: `@id("forbid-refund-budget-over-2000")
forbid (
  principal,
  action == ${A("process_refund")},
  resource
)
when {
  context.session.prior has process_refund &&
  context.session.prior.process_refund.amountTotal + context.input.amount > 2000
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 9. Cancel orders                                                   */
  /* ---------------------------------------------------------------- */
  {
    id: "leads-cancel-orders",
    description: "Support leads and admins may cancel orders.",
    cedar: `@id("leads-cancel-orders")
permit (
  principal is Eve::User,
  action == ${A("cancel_order")},
  resource == ${AGENT}
)
when {
  principal.hasTag("role") &&
  ["support-lead", "admin"].contains(principal.getTag("role"))
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 10. Region-scoped shipping changes                                 */
  /* ---------------------------------------------------------------- */
  {
    id: "shipping-changes-domestic-only",
    description:
      "Shipping addresses may be changed by leads/admins, but only to US or CA destinations unless the caller is an admin. Combines a role tag with an input allow-list.",
    cedar: `@id("shipping-changes-domestic-only")
permit (
  principal is Eve::User,
  action == ${A("update_shipping_address")},
  resource == ${AGENT}
)
when {
  principal.hasTag("role") &&
  (
    principal.getTag("role") == "admin" ||
    (principal.getTag("role") == "support-lead" && ["US", "CA"].contains(context.input.country))
  )
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 11. Discounts with input constraint                                */
  /* ---------------------------------------------------------------- */
  {
    id: "finance-discounts-up-to-30",
    description:
      "Finance may apply discounts up to 30%; admins have no cap. Mirrors AgentCore numeric input constraints.",
    cedar: `@id("finance-discounts-up-to-30")
permit (
  principal is Eve::User,
  action == ${A("apply_discount")},
  resource == ${AGENT}
)
when {
  principal.hasTag("role") &&
  (
    principal.getTag("role") == "admin" ||
    (principal.getTag("role") == "finance" && context.input.percent <= 30)
  )
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 12. PII export restricted                                          */
  /* ---------------------------------------------------------------- */
  {
    id: "admins-export-pii",
    description: "Only admins may run full exports that include PII.",
    cedar: `@id("admins-export-pii")
permit (
  principal is Eve::User,
  action == ${A("export_customer_data")},
  resource == ${AGENT}
)
when { principal.hasTag("role") && principal.getTag("role") == "admin" };`,
  },
  {
    id: "forbid-contractor-pii",
    description:
      "External contractors may never receive PII, regardless of any other permit. Uses the 'employment' tag; mirrors AgentCore forbid on a claim tag.",
    cedar: `@id("forbid-contractor-pii")
forbid (
  principal is Eve::User,
  action == ${A("export_customer_data")},
  resource
)
when {
  principal.hasTag("employment") &&
  principal.getTag("employment") == "contractor"
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 13. Time-of-day guardrail (disabled by default)                    */
  /* ---------------------------------------------------------------- */
  {
    id: "forbid-mutations-outside-business-hours",
    description:
      "Blocks refunds and cancellations outside 08:00-20:00 UTC using context.system.now. Disabled by default so the demo works at any hour; enable it to see datetime extension policies.",
    enabled: false,
    cedar: `@id("forbid-mutations-outside-business-hours")
forbid (
  principal,
  action in [${A("process_refund")}, ${A("cancel_order")}],
  resource
)
when {
  context.system.now.toTime() < duration("8h") ||
  context.system.now.toTime() > duration("20h")
};`,
  },

  /* ---------------------------------------------------------------- */
  /* 14. Region match (disabled by default)                             */
  /* ---------------------------------------------------------------- */
  {
    id: "forbid-eu-staff-on-us-only-tools",
    description:
      "Example of a tag-based forbid: EU-region staff may not cancel orders. Disabled by default; enable to see Sam (eu-west admin) lose cancel_order.",
    enabled: false,
    cedar: `@id("forbid-eu-staff-on-us-only-tools")
forbid (
  principal is Eve::User,
  action == ${A("cancel_order")},
  resource
)
when { principal.hasTag("region") && principal.getTag("region") like "eu-*" };`,
  },
];
