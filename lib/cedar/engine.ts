import * as cedar from "@cedar-policy/cedar-wasm/nodejs";
import type { EngineMode } from "../db/schema";
import { AGENT_ID, TOOL_NAMES, type ToolName } from "./catalog";
import { AGENT_RESOURCE, ENTITY_TYPES, getCedarSchema } from "./schema";
import {
  getEnabledPolicyText,
  getEngineMode,
  listExecutedActionsForSession,
  recordDecision,
} from "./store";

/* ------------------------------------------------------------------ */
/* Principal                                                            */
/* ------------------------------------------------------------------ */

export interface CedarPrincipal {
  /** "user" -> Eve::User, "service" -> Eve::ServicePrincipal */
  readonly kind: "user" | "service";
  readonly id: string;
  /** String-valued claims. Arrays are joined with a space so `like` works. */
  readonly tags: Readonly<Record<string, string>>;
}

/** Builds a Cedar principal from eve's verified session auth attributes. */
export function principalFromSessionAuth(auth: {
  readonly principalId: string;
  readonly principalType: string;
  readonly subject?: string;
  readonly attributes: Readonly<Record<string, string | readonly string[]>>;
} | null): CedarPrincipal {
  if (!auth) {
    return { kind: "service", id: "anonymous-local-dev", tags: { role: "local-dev" } };
  }
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(auth.attributes)) {
    tags[k] = Array.isArray(v) ? (v as readonly string[]).join(" ") : (v as string);
  }
  const isService = tags.principal_kind === "service" || auth.principalType === "vercel-oidc";
  return {
    kind: isService ? "service" : "user",
    id: auth.subject ?? auth.principalId,
    tags,
  };
}

/* ------------------------------------------------------------------ */
/* Context                                                              */
/* ------------------------------------------------------------------ */

interface PriorSummary {
  count: number;
  latest: string;
  orderIds: string[];
  customerIds: string[];
  amountTotal: number;
}

export interface SessionCedarContext {
  id: string;
  turn: number;
  counts: Record<ToolName, number>;
  prior: Partial<Record<ToolName, PriorSummary>>;
}

/**
 * Builds `context.session` from the decision log: every action that actually
 * executed earlier in this eve session. This provides temporal policy parity
 * (approval-before, count caps, budget caps) without a separate policy-session
 * service.
 */
export async function buildSessionContext(sessionId: string, turn: number): Promise<SessionCedarContext> {
  const rows = await listExecutedActionsForSession(sessionId);
  const counts = Object.fromEntries(TOOL_NAMES.map((t) => [t, 0])) as Record<ToolName, number>;
  const prior: Partial<Record<ToolName, PriorSummary>> = {};
  for (const row of rows) {
    const tool = row.action as ToolName;
    if (!(tool in counts)) continue;
    counts[tool] += 1;
    const input = (row.input ?? {}) as Record<string, unknown>;
    const entry = (prior[tool] ??= {
      count: 0,
      latest: row.createdAt.toISOString(),
      orderIds: [],
      customerIds: [],
      amountTotal: 0,
    });
    entry.count += 1;
    entry.latest = row.createdAt.toISOString();
    if (typeof input.orderId === "string" && !entry.orderIds.includes(input.orderId)) {
      entry.orderIds.push(input.orderId);
    }
    if (typeof input.customerId === "string" && !entry.customerIds.includes(input.customerId)) {
      entry.customerIds.push(input.customerId);
    }
    if (typeof input.amount === "number") entry.amountTotal += Math.trunc(input.amount);
  }
  return { id: sessionId, turn, counts, prior };
}

function toCedarDatetime(iso: string) {
  return { __extn: { fn: "datetime", arg: iso } };
}

/** Encodes the JS session context into Cedar JSON (datetime extension values). */
function encodeSessionContext(s: SessionCedarContext) {
  const prior: Record<string, unknown> = {};
  for (const [tool, p] of Object.entries(s.prior)) {
    if (!p) continue;
    prior[tool] = { ...p, latest: toCedarDatetime(p.latest) };
  }
  return { id: s.id, turn: s.turn, counts: s.counts, prior };
}

/* ------------------------------------------------------------------ */
/* Authorization                                                        */
/* ------------------------------------------------------------------ */

export interface AuthorizeRequest {
  principal: CedarPrincipal;
  action: ToolName;
  input: Record<string, unknown>;
  sessionId: string;
  turn: number;
  /** Override "now" (ISO). Used by the dry-run tester. */
  now?: string;
  /** Override session context (dry-run). */
  session?: SessionCedarContext;
  /** Override policies (dry-run against unsaved edits). */
  policies?: string;
}

export interface AuthorizeResult {
  decision: "ALLOW" | "DENY";
  mode: EngineMode;
  /** True when the tool was blocked (DENY in ENFORCE). */
  enforced: boolean;
  determiningPolicies: string[];
  errors: string[];
  durationMs: number;
  /** The exact Cedar request, for the console's "explain" view. */
  request: {
    principal: { type: string; id: string };
    action: { type: string; id: string };
    resource: { type: string; id: string };
    context: unknown;
  };
  entities: unknown[];
}

function buildEntities(p: CedarPrincipal) {
  const type = p.kind === "user" ? ENTITY_TYPES.user : ENTITY_TYPES.service;
  return [
    { uid: { type, id: p.id }, attrs: {}, parents: [], tags: p.tags },
    { uid: { type: AGENT_RESOURCE.type, id: AGENT_RESOURCE.id }, attrs: {}, parents: [] },
  ];
}

/** Pure evaluation: no DB reads, no logging. Used by `authorize` and dry-run. */
export async function evaluate(req: AuthorizeRequest & { policies: string; mode: EngineMode }): Promise<AuthorizeResult> {
  const started = performance.now();
  const now = req.now ?? new Date().toISOString();
  const session = req.session ?? (await buildSessionContext(req.sessionId, req.turn));
  const principalType = req.principal.kind === "user" ? ENTITY_TYPES.user : ENTITY_TYPES.service;

  const request = {
    principal: { type: principalType, id: req.principal.id },
    action: { type: ENTITY_TYPES.action, id: req.action },
    resource: { type: AGENT_RESOURCE.type, id: AGENT_RESOURCE.id },
    context: {
      input: req.input,
      system: { now: toCedarDatetime(now) },
      session: encodeSessionContext(session),
    },
  };
  const entities = buildEntities(req.principal);

  const result = cedar.isAuthorized({
    ...request,
    policies: { staticPolicies: req.policies },
    entities,
    schema: getCedarSchema(),
  });

  let decision: "ALLOW" | "DENY" = "DENY";
  let determiningPolicies: string[] = [];
  let errors: string[] = [];

  if (result.type === "success") {
    decision = result.response.decision === "allow" ? "ALLOW" : "DENY";
    determiningPolicies = Array.from(result.response.diagnostics.reason);
    errors = result.response.diagnostics.errors.map((e) => `${e.policyId}: ${e.error.message}`);
  } else {
    errors = result.errors.map((e) => e.message);
  }

  const enforced = decision === "DENY" && req.mode === "ENFORCE";
  return {
    decision,
    mode: req.mode,
    enforced,
    determiningPolicies,
    errors,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    request: { ...request, context: { ...request.context, system: { now } } },
    entities,
  };
}

/** Live authorization used by the tool guard: loads policies + mode, logs the decision. */
export async function authorize(req: AuthorizeRequest): Promise<AuthorizeResult & { decisionId: number }> {
  const [{ text: policies }, mode] = await Promise.all([getEnabledPolicyText(), getEngineMode()]);
  const result = await evaluate({ ...req, policies, mode });
  const decisionId = await recordDecision({
    sessionId: req.sessionId,
    principalType: req.principal.kind === "user" ? ENTITY_TYPES.user : ENTITY_TYPES.service,
    principalId: req.principal.id,
    action: req.action,
    resource: `${AGENT_RESOURCE.type}::"${AGENT_ID}"`,
    input: req.input,
    context: {
      principalTags: req.principal.tags,
      system: (result.request.context as { system: unknown }).system,
      session: {
        turn: req.turn,
        counts: (result.request.context as { session: SessionCedarContext }).session.counts,
      },
    },
    decision: result.decision,
    mode,
    enforced: result.enforced,
    determiningPolicies: result.determiningPolicies,
    errors: result.errors,
    durationMs: result.durationMs,
  });
  return { ...result, decisionId };
}

/* ------------------------------------------------------------------ */
/* Validation & analysis                                                */
/* ------------------------------------------------------------------ */

export interface ValidationIssue {
  severity: "error" | "warning";
  policyId?: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  /** Ids parsed from @id annotations, in order. */
  policyIds: string[];
  policyCount: number;
}

/** Strict schema validation against the generated schema (AgentCore validates on create). */
export function validatePolicies(policyText: string): ValidationReport {
  const issues: ValidationIssue[] = [];
  const parsed = cedar.policySetTextToParts(policyText);
  let policyIds: string[] = [];
  let policyCount = 0;

  if (parsed.type === "failure") {
    for (const e of parsed.errors) issues.push({ severity: "error", message: e.message });
    return { ok: false, issues, policyIds, policyCount };
  }
  policyCount = parsed.policies.length;
  policyIds = parsed.policies.map((p) => idAnnotationOf(p)).filter((x): x is string => Boolean(x));

  const v = cedar.validate({
    validationSettings: { mode: "strict" },
    schema: getCedarSchema(),
    policies: { staticPolicies: policyText },
  });
  if (v.type === "failure") {
    for (const e of v.errors) issues.push({ severity: "error", message: e.message });
    return { ok: false, issues, policyIds, policyCount };
  }
  for (const e of v.validationErrors) {
    issues.push({ severity: "error", policyId: e.policyId, message: e.error.message });
  }
  for (const w of v.validationWarnings) {
    issues.push({ severity: "warning", policyId: w.policyId, message: w.warning.message });
  }
  for (const w of v.otherWarnings) issues.push({ severity: "warning", message: w.message });
  return { ok: !issues.some((i) => i.severity === "error"), issues, policyIds, policyCount };
}

function idAnnotationOf(policyText: string): string | undefined {
  const m = policyText.match(/@id\("([^"]+)"\)/);
  return m?.[1];
}

export interface AnalysisFinding {
  kind: "always-permits" | "always-forbids" | "never-fires" | "unconditional" | "info";
  message: string;
}

/**
 * Lightweight policy analysis, the eve-side analogue of AgentCore's
 * "policy analysis" (always allow / always deny / impossible). Uses structural
 * checks plus a probe matrix of representative requests.
 */
export function analyzePolicy(policyText: string): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const parsed = cedar.policySetTextToParts(policyText);
  if (parsed.type === "failure" || parsed.policies.length === 0) return findings;
  const single = parsed.policies[0];
  const effect = /^\s*(?:@\w+\([^)]*\)\s*)*permit/.test(single) ? "permit" : "forbid";

  const scopeAll = /(permit|forbid)\s*\(\s*principal\s*,\s*action\s*,\s*resource\s*\)/.test(single);
  const hasWhen = /\bwhen\s*\{/.test(single);
  const hasUnless = /\bunless\s*\{/.test(single);

  if (scopeAll && !hasWhen && !hasUnless) {
    findings.push({
      kind: effect === "permit" ? "always-permits" : "always-forbids",
      message:
        effect === "permit"
          ? "Unconditional permit on every principal, action and resource. This grants full access to the agent."
          : "Unconditional forbid on every principal, action and resource. This blocks every tool call.",
    });
  } else if (!hasWhen && !hasUnless) {
    findings.push({
      kind: "unconditional",
      message: `This ${effect} has a scope but no when/unless clause; it fires for every request matching the scope.`,
    });
  }

  if (/when\s*\{\s*(false)\s*\}/.test(single)) {
    findings.push({ kind: "never-fires", message: "The when clause is literally false; this policy can never fire." });
  }
  if (/when\s*\{\s*(true)\s*\}/.test(single)) {
    findings.push({ kind: "unconditional", message: "The when clause is literally true; conditions are redundant." });
  }

  // Probe matrix: does this permit ever allow / does this forbid ever fire for the demo personas?
  const probes = probeRequests();
  let fired = 0;
  for (const probe of probes) {
    const r = cedar.isAuthorized({
      ...probe.request,
      policies: { staticPolicies: single },
      entities: probe.entities,
      schema: getCedarSchema(),
    });
    if (r.type !== "success") continue;
    if (effect === "permit" && r.response.decision === "allow") fired += 1;
    if (effect === "forbid" && r.response.diagnostics.reason.length > 0) fired += 1;
  }
  if (fired === 0) {
    findings.push({
      kind: "never-fires",
      message: `This ${effect} did not fire for any of ${probes.length} representative requests across the demo personas and tools. It may be unreachable or depend on session history.`,
    });
  } else if (fired === probes.length) {
    findings.push({
      kind: effect === "permit" ? "always-permits" : "always-forbids",
      message: `This ${effect} fired for all ${probes.length} representative requests.`,
    });
  } else {
    findings.push({ kind: "info", message: `Fired for ${fired} of ${probes.length} representative requests.` });
  }
  return findings;
}

function probeRequests() {
  const personas: CedarPrincipal[] = [
    { kind: "user", id: "maya@orderdesk.demo", tags: { role: "support", region: "us-west", scope: "orders:read" } },
    { kind: "user", id: "dev@orderdesk.demo", tags: { role: "support-lead", region: "us-east", scope: "orders:read orders:write refunds:write" } },
    { kind: "user", id: "priya@orderdesk.demo", tags: { role: "finance", region: "us-east", scope: "refunds:approve discounts:write" } },
    { kind: "user", id: "sam@orderdesk.demo", tags: { role: "admin", region: "eu-west", scope: "orders:* refunds:* exports:*" } },
    { kind: "user", id: "lena@contractor.example", tags: { role: "support", region: "eu-west", employment: "contractor", scope: "orders:read" } },
    { kind: "service", id: "svc-nightly-reconciler", tags: { principal_kind: "service", scope: "orders:read exports:read" } },
  ];
  const inputs: Record<ToolName, Record<string, unknown>[]> = {
    lookup_order: [{ orderId: "ORD-1001" }],
    lookup_customer: [{ customerId: "CUST-1" }],
    approve_refund: [{ orderId: "ORD-1001", amount: 800 }],
    process_refund: [
      { orderId: "ORD-1001", amount: 120, reason: "defective" },
      { orderId: "ORD-1002", amount: 800, reason: "fraud" },
    ],
    cancel_order: [{ orderId: "ORD-1003", notifyCustomer: true }],
    update_shipping_address: [
      { orderId: "ORD-1003", country: "US", line1: "1 Main", city: "Austin", postalCode: "78701" },
      { orderId: "ORD-1003", country: "DE", line1: "1 Str", city: "Berlin", postalCode: "10115" },
    ],
    apply_discount: [{ orderId: "ORD-1001", percent: 20 }, { orderId: "ORD-1001", percent: 60 }],
    export_customer_data: [
      { customerId: "CUST-1", format: "summary", includePii: false },
      { customerId: "CUST-1", format: "full", includePii: true },
    ],
  };
  const emptySession: SessionCedarContext = {
    id: "probe",
    turn: 1,
    counts: Object.fromEntries(TOOL_NAMES.map((t) => [t, 0])) as Record<ToolName, number>,
    prior: {},
  };
  const out: { request: Record<string, unknown>; entities: unknown[] }[] = [];
  for (const p of personas) {
    for (const tool of TOOL_NAMES) {
      for (const input of inputs[tool]) {
        out.push({
          request: {
            principal: { type: p.kind === "user" ? ENTITY_TYPES.user : ENTITY_TYPES.service, id: p.id },
            action: { type: ENTITY_TYPES.action, id: tool },
            resource: AGENT_RESOURCE,
            context: {
              input,
              system: { now: toCedarDatetime("2026-09-03T14:00:00Z") },
              session: encodeSessionContext(emptySession),
            },
          },
          entities: buildEntities(p),
        });
      }
    }
  }
  return out;
}

export function emptySessionContext(sessionId = "dry-run"): SessionCedarContext {
  return {
    id: sessionId,
    turn: 1,
    counts: Object.fromEntries(TOOL_NAMES.map((t) => [t, 0])) as Record<ToolName, number>,
    prior: {},
  };
}

export function cedarVersion(): string {
  return cedar.getCedarVersion();
}
