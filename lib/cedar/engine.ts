import * as cedar from "@cedar-policy/cedar-wasm/nodejs";
import type { AuthorizationSessionDocument, EngineMode } from "./documents";
import { AGENT_ID, TOOL_NAMES, type ToolName } from "./catalog";
import { AGENT_RESOURCE, ENTITY_TYPES, getCedarSchema } from "./schema";

export type PolicySet = Record<string, string>;

export interface CedarPrincipal {
  readonly kind: "user" | "service";
  readonly id: string;
  readonly tags: Readonly<Record<string, string>>;
}

interface PriorSummary {
  count: number;
  latest: string;
  orderIds: string[];
  customerIds: string[];
  amountTotal: number;
}

export interface RefundApprovalContext {
  orderId: string;
  availableAmount: number;
  latest: string;
}

export interface SessionCedarContext {
  id: string;
  turn: number;
  counts: Record<ToolName, number>;
  prior: Partial<Record<ToolName, PriorSummary>>;
  refundApproval?: RefundApprovalContext;
}

function operationTime(operation: { completedAt?: string; createdAt?: string }): string {
  return operation.completedAt ?? operation.createdAt ?? new Date(0).toISOString();
}

function addToSummary(
  prior: SessionCedarContext["prior"],
  action: ToolName,
  input: Record<string, unknown>,
  timestamp: string,
) {
  const entry = (prior[action] ??= {
    count: 0,
    latest: timestamp,
    orderIds: [],
    customerIds: [],
    amountTotal: 0,
  });
  entry.count += 1;
  if (timestamp > entry.latest) entry.latest = timestamp;
  if (typeof input.orderId === "string" && !entry.orderIds.includes(input.orderId)) entry.orderIds.push(input.orderId);
  if (typeof input.customerId === "string" && !entry.customerIds.includes(input.customerId)) {
    entry.customerIds.push(input.customerId);
  }
  if (typeof input.amount === "number") entry.amountTotal += Math.trunc(input.amount);
}

export function pruneExpiredReservations(state: AuthorizationSessionDocument, now: string): AuthorizationSessionDocument {
  return {
    ...state,
    reservations: state.reservations.filter((reservation) => reservation.expiresAt > now),
  };
}

export function buildSessionContext(
  state: AuthorizationSessionDocument,
  now: string,
  turn = 0,
  currentInput: Record<string, unknown> = {},
): SessionCedarContext {
  const active = state.reservations.filter((reservation) => reservation.expiresAt > now);
  const counts = Object.fromEntries(TOOL_NAMES.map((tool) => [tool, 0])) as Record<ToolName, number>;
  const prior: SessionCedarContext["prior"] = {};

  for (const operation of state.completed) {
    counts[operation.action] += 1;
    addToSummary(prior, operation.action, operation.input, operation.completedAt);
  }
  for (const reservation of active) {
    counts[reservation.action] += 1;
    if (reservation.action === "process_refund") {
      addToSummary(prior, reservation.action, reservation.input, reservation.createdAt);
    }
  }

  const orderId = typeof currentInput.orderId === "string" ? currentInput.orderId : undefined;
  let refundApproval: RefundApprovalContext | undefined;
  if (orderId) {
    const cutoff = new Date(new Date(now).getTime() - 60 * 60 * 1000).toISOString();
    const approvals = state.completed.filter(
      (operation) =>
        operation.action === "approve_refund" &&
        operation.input.orderId === orderId &&
        operation.completedAt >= cutoff,
    );
    if (approvals.length > 0) {
      const earliest = approvals.reduce(
        (value, operation) => (operation.completedAt < value ? operation.completedAt : value),
        approvals[0].completedAt,
      );
      const approved = approvals.reduce(
        (sum, operation) => sum + (typeof operation.input.amount === "number" ? operation.input.amount : 0),
        0,
      );
      const consumed = [...state.completed, ...active]
        .filter(
          (operation) =>
            operation.action === "process_refund" &&
            operation.input.orderId === orderId &&
            operationTime(operation) >= earliest,
        )
        .reduce(
          (sum, operation) => sum + (typeof operation.input.amount === "number" ? operation.input.amount : 0),
          0,
        );
      refundApproval = {
        orderId,
        availableAmount: Math.max(0, Math.trunc(approved - consumed)),
        latest: approvals.reduce(
          (value, operation) => (operation.completedAt > value ? operation.completedAt : value),
          approvals[0].completedAt,
        ),
      };
    }
  }

  return { id: state.sessionId, turn, counts, prior, refundApproval };
}

function toCedarDatetime(iso: string) {
  return { __extn: { fn: "datetime", arg: iso } };
}

function encodeSessionContext(session: SessionCedarContext) {
  const prior: Record<string, unknown> = {};
  for (const [tool, summary] of Object.entries(session.prior)) {
    if (summary) prior[tool] = { ...summary, latest: toCedarDatetime(summary.latest) };
  }
  return {
    id: session.id,
    turn: session.turn,
    counts: session.counts,
    prior,
    ...(session.refundApproval
      ? { refundApproval: { ...session.refundApproval, latest: toCedarDatetime(session.refundApproval.latest) } }
      : {}),
  };
}

export interface AuthorizeRequest {
  principal: CedarPrincipal;
  action: ToolName;
  input: Record<string, unknown>;
  policies: PolicySet;
  mode: EngineMode;
  policyRevision: number;
  now: string;
  session: SessionCedarContext;
}

export interface AuthorizeResult {
  decision: "ALLOW" | "DENY";
  mode: EngineMode;
  policyRevision: number;
  enforced: boolean;
  valid: boolean;
  determiningPolicies: string[];
  errors: string[];
  durationMs: number;
  request: {
    principal: { type: string; id: string };
    action: { type: string; id: string };
    resource: { type: string; id: string };
    context: unknown;
  };
  entities: unknown[];
}

function buildEntities(principal: CedarPrincipal): cedar.Entities {
  const type = principal.kind === "user" ? ENTITY_TYPES.user : ENTITY_TYPES.service;
  return [
    { uid: { type, id: principal.id }, attrs: {}, parents: [], tags: { ...principal.tags } },
    { uid: AGENT_RESOURCE, attrs: {}, parents: [] },
  ];
}

export async function evaluate(requestInput: AuthorizeRequest): Promise<AuthorizeResult> {
  const started = performance.now();
  const principalType = requestInput.principal.kind === "user" ? ENTITY_TYPES.user : ENTITY_TYPES.service;
  const request = {
    principal: { type: principalType, id: requestInput.principal.id },
    action: { type: ENTITY_TYPES.action, id: requestInput.action },
    resource: AGENT_RESOURCE,
    context: {
      input: requestInput.input as cedar.CedarValueJson,
      system: { now: toCedarDatetime(requestInput.now) },
      session: encodeSessionContext(requestInput.session) as cedar.CedarValueJson,
    },
  };
  const entities = buildEntities(requestInput.principal);
  let decision: "ALLOW" | "DENY" = "DENY";
  let determiningPolicies: string[] = [];
  let errors: string[] = [];

  try {
    const result = cedar.isAuthorized({
      ...request,
      policies: { staticPolicies: requestInput.policies },
      entities,
      schema: getCedarSchema(),
    });
    if (result.type === "success") {
      decision = result.response.decision === "allow" ? "ALLOW" : "DENY";
      determiningPolicies = Array.from(result.response.diagnostics.reason);
      errors = result.response.diagnostics.errors.map((error) => `${error.policyId}: ${error.error.message}`);
    } else {
      errors = result.errors.map((error) => error.message);
    }
  } catch (error) {
    errors = [error instanceof Error ? error.message : String(error)];
  }

  const valid = errors.length === 0;
  const enforced = !valid || (decision === "DENY" && requestInput.mode === "ENFORCE");
  return {
    decision,
    mode: requestInput.mode,
    policyRevision: requestInput.policyRevision,
    enforced,
    valid,
    determiningPolicies,
    errors,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    request: { ...request, context: { ...request.context, system: { now: requestInput.now } } },
    entities,
  };
}

export interface ValidationIssue {
  severity: "error" | "warning";
  policyId?: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  policyIds: string[];
  policyCount: number;
}

export function validatePolicies(policies: string | PolicySet): ValidationReport {
  const issues: ValidationIssue[] = [];
  const asText = typeof policies === "string" ? policies : Object.values(policies).join("\n\n");
  const parsed = cedar.policySetTextToParts(asText);
  if (parsed.type === "failure") {
    return { ok: false, issues: parsed.errors.map((error) => ({ severity: "error", message: error.message })), policyIds: [], policyCount: 0 };
  }
  const policyIds =
    typeof policies === "string"
      ? parsed.policies.map((policy) => idAnnotationOf(policy)).filter((id): id is string => Boolean(id))
      : Object.keys(policies);
  const staticPolicies: PolicySet =
    typeof policies === "string"
      ? Object.fromEntries(parsed.policies.map((policy, index) => [idAnnotationOf(policy) ?? `policy${index}`, policy]))
      : policies;
  const validation = cedar.validate({
    validationSettings: { mode: "strict" },
    schema: getCedarSchema(),
    policies: { staticPolicies },
  });
  if (validation.type === "failure") {
    return {
      ok: false,
      issues: validation.errors.map((error) => ({ severity: "error", message: error.message })),
      policyIds,
      policyCount: parsed.policies.length,
    };
  }
  for (const error of validation.validationErrors) {
    issues.push({ severity: "error", policyId: error.policyId, message: error.error.message });
  }
  for (const warning of validation.validationWarnings) {
    issues.push({ severity: "warning", policyId: warning.policyId, message: warning.error.message });
  }
  for (const warning of validation.otherWarnings) issues.push({ severity: "warning", message: warning.message });
  return { ok: !issues.some((issue) => issue.severity === "error"), issues, policyIds, policyCount: parsed.policies.length };
}

function idAnnotationOf(policyText: string): string | undefined {
  return policyText.match(/@id\("([^"]+)"\)/)?.[1];
}

export interface AnalysisFinding {
  kind: "always-permits" | "always-forbids" | "never-fires" | "unconditional" | "info";
  message: string;
}

export function analyzePolicy(policyText: string): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const parsed = cedar.policySetTextToParts(policyText);
  if (parsed.type === "failure" || parsed.policies.length === 0) return findings;
  const policy = parsed.policies[0];
  const effect = /^\s*(?:@\w+\([^)]*\)\s*)*permit/.test(policy) ? "permit" : "forbid";
  const scopeAll = /(permit|forbid)\s*\(\s*principal\s*,\s*action\s*,\s*resource\s*\)/.test(policy);
  const hasWhen = /\bwhen\s*\{/.test(policy);
  const hasUnless = /\bunless\s*\{/.test(policy);
  if (scopeAll && !hasWhen && !hasUnless) {
    findings.push({
      kind: effect === "permit" ? "always-permits" : "always-forbids",
      message: effect === "permit" ? "Unconditional permit for every request." : "Unconditional forbid for every request.",
    });
  } else if (!hasWhen && !hasUnless) {
    findings.push({ kind: "unconditional", message: `This ${effect} fires for every request matching its scope.` });
  }
  if (/when\s*\{\s*false\s*\}/.test(policy)) findings.push({ kind: "never-fires", message: "The when clause is false." });
  if (/when\s*\{\s*true\s*\}/.test(policy)) findings.push({ kind: "unconditional", message: "The when clause is true." });
  return findings;
}

export function emptySessionContext(sessionId = "dry-run"): SessionCedarContext {
  return {
    id: sessionId,
    turn: 0,
    counts: Object.fromEntries(TOOL_NAMES.map((tool) => [tool, 0])) as Record<ToolName, number>,
    prior: {},
  };
}

export function cedarVersion(): string {
  return cedar.getCedarVersion();
}

export const AGENT_RESOURCE_STRING = `${AGENT_RESOURCE.type}::\"${AGENT_ID}\"`;
