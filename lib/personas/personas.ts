/**
 * Explicitly simulated identities. Each persona has fixed attributes projected to
 * Cedar as `Eve::User` tags (string claims) or `Eve::ServicePrincipal`
 * attributes. They mirror the identity shapes AgentCore exposes to Cedar:
 *
 *   AgentCore::OAuthUser  (JWT claims as tags)   -> Eve::User
 *   AgentCore::IamEntity  (workload identity)    -> Eve::ServicePrincipal
 */
export type PersonaKind = "user" | "service";

export interface Persona {
  readonly id: string;
  readonly kind: PersonaKind;
  readonly label: string;
  readonly summary: string;
  /** Demo attributes. `sub` identifies the persona; other fields become Cedar tags. */
  readonly claims: Readonly<Record<string, string | readonly string[]>>;
}

export const PERSONAS: readonly Persona[] = [
  {
    id: "maya-support",
    kind: "user",
    label: "Maya (Support L1)",
    summary: "Read-only support agent. Can look up orders and customers, nothing else.",
    claims: {
      sub: "maya@orderdesk.demo",
      email: "maya@orderdesk.demo",
      role: "support",
      department: "customer-success",
      region: "us-west",
      scope: "orders:read customers:read",
    },
  },
  {
    id: "dev-support-lead",
    kind: "user",
    label: "Dev (Support Lead)",
    summary: "Can refund under 500 outright, larger refunds after approval; may cancel orders.",
    claims: {
      sub: "dev@orderdesk.demo",
      email: "dev@orderdesk.demo",
      role: "support-lead",
      department: "customer-success",
      region: "us-east",
      scope: "orders:read orders:write customers:read refunds:write",
    },
  },
  {
    id: "priya-finance",
    kind: "user",
    label: "Priya (Finance)",
    summary: "Approves refunds and applies discounts; cannot cancel orders or export data.",
    claims: {
      sub: "priya@orderdesk.demo",
      email: "priya@orderdesk.demo",
      role: "finance",
      department: "finance",
      region: "us-east",
      scope: "orders:read refunds:approve discounts:write",
    },
  },
  {
    id: "sam-admin",
    kind: "user",
    label: "Sam (Admin)",
    summary: "Full access, but still bound by guardrails such as the fraud-flag forbid.",
    claims: {
      sub: "sam@orderdesk.demo",
      email: "sam@orderdesk.demo",
      role: "admin",
      department: "operations",
      region: "eu-west",
      scope: "orders:* customers:* refunds:* discounts:* exports:*",
    },
  },
  {
    id: "contractor-eu",
    kind: "user",
    label: "Lena (Contractor, EU)",
    summary: "External contractor. Region-restricted and blocked from PII exports.",
    claims: {
      sub: "lena@contractor.example",
      email: "lena@contractor.example",
      role: "support",
      department: "external",
      region: "eu-west",
      employment: "contractor",
      scope: "orders:read",
    },
  },
  {
    id: "svc-nightly-reconciler",
    kind: "service",
    label: "svc-nightly-reconciler (Service)",
    summary: "Workload identity. Only read-only lookups and reconciliation exports are allowed.",
    claims: {
      sub: "svc-nightly-reconciler",
      client_id: "svc-nightly-reconciler",
      principal_kind: "service",
      scope: "orders:read exports:read",
    },
  },
];

export function findPersona(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

export const DEFAULT_PERSONA_ID = "dev-support-lead";
