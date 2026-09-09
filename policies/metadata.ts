export interface DefaultPolicyMetadata {
  readonly id: string;
  readonly description: string;
  readonly enabled: boolean;
}

export const DEFAULT_POLICY_METADATA: readonly DefaultPolicyMetadata[] = [
  { id: "read-access-for-staff", enabled: true, description: "Any authenticated user with an orders:read scope may look up orders and customers." },
  { id: "forbid-customer-lookup-before-order-lookup", enabled: true, description: "Human callers must successfully look up an order before opening a customer profile in the same session." },
  { id: "service-reconciler-readonly", enabled: true, description: "The nightly reconciler workload may look up orders and customers." },
  { id: "service-reconciler-summary-exports", enabled: true, description: "The reconciler may export customer data only in summary format without PII." },
  { id: "refund-under-500-for-leads", enabled: true, description: "Support leads and admins may process refunds below 500 without approval." },
  { id: "refund-large-requires-prior-approval", enabled: true, description: "Refunds of 500 or more require fresh, unconsumed approval capacity for the same order." },
  { id: "finance-approves-refunds", enabled: true, description: "Only finance or admin may record refund approvals, up to 5000." },
  { id: "forbid-fraud-refunds", enabled: true, description: "Fraud-related refunds always go to a human queue, even for admins." },
  { id: "forbid-more-than-3-refunds-per-session", enabled: true, description: "At most three successful or in-flight refunds may exist in one session." },
  { id: "forbid-refund-budget-over-2000", enabled: true, description: "Successful and in-flight refunds may not exceed 2000 per session." },
  { id: "leads-cancel-orders", enabled: true, description: "Support leads and admins may cancel orders." },
  { id: "shipping-changes-domestic-only", enabled: true, description: "Leads may ship only to US or CA destinations; admins may ship anywhere." },
  { id: "finance-discounts-up-to-30", enabled: true, description: "Finance may apply discounts up to 30%; admins have no policy cap." },
  { id: "admins-export-pii", enabled: true, description: "Only admins may run full exports that include PII." },
  { id: "forbid-contractor-pii", enabled: true, description: "External contractors may never receive customer exports." },
  { id: "forbid-mutations-outside-business-hours", enabled: false, description: "Optionally block refunds and cancellations outside 08:00–20:00 UTC." },
  { id: "forbid-eu-staff-on-us-only-tools", enabled: false, description: "Optionally block EU-region staff from cancelling orders." },
] as const;
