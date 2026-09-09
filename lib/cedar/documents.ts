import { z } from "zod";
import { TOOL_NAMES } from "./catalog";

export const engineModeSchema = z.enum(["ENFORCE", "LOG_ONLY"]);
export type EngineMode = z.infer<typeof engineModeSchema>;

export const policyOriginSchema = z.enum(["seed", "console", "ai"]);
export type PolicyOrigin = z.infer<typeof policyOriginSchema>;

export const policyRecordSchema = z.object({
  id: z.string().min(1).max(80),
  description: z.string().max(500),
  cedar: z.string().min(1).max(20_000),
  enabled: z.boolean(),
  origin: policyOriginSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PolicyRecord = z.infer<typeof policyRecordSchema>;

export const policyConfigDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().min(1),
  mode: engineModeSchema,
  policies: z.array(policyRecordSchema),
});
export type PolicyConfigDocument = z.infer<typeof policyConfigDocumentSchema>;

const operationSchema = z.object({
  operationId: z.string().min(1),
  action: z.enum(TOOL_NAMES as [typeof TOOL_NAMES[number], ...typeof TOOL_NAMES[number][]]),
  input: z.record(z.string(), z.unknown()),
  policyRevision: z.number().int().positive(),
});

export const completedOperationSchema = operationSchema.extend({
  completedAt: z.string().datetime(),
});
export type CompletedOperation = z.infer<typeof completedOperationSchema>;

export const pendingReservationSchema = operationSchema.extend({
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type PendingReservation = z.infer<typeof pendingReservationSchema>;

export const authorizationSessionDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  sessionId: z.string().min(1),
  updatedAt: z.string().datetime(),
  completed: z.array(completedOperationSchema),
  reservations: z.array(pendingReservationSchema),
});
export type AuthorizationSessionDocument = z.infer<typeof authorizationSessionDocumentSchema>;

export const decisionOutcomeSchema = z.enum(["blocked", "pending", "succeeded", "failed", "threw"]);
export type DecisionOutcome = z.infer<typeof decisionOutcomeSchema>;

export const decisionRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  operationId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sessionId: z.string().min(1),
  principalType: z.string().min(1),
  principalId: z.string().min(1),
  action: z.string().min(1),
  resource: z.string().min(1),
  input: z.unknown(),
  context: z.unknown(),
  decision: z.enum(["ALLOW", "DENY"]),
  mode: engineModeSchema,
  enforced: z.boolean(),
  policyRevision: z.number().int().positive(),
  outcome: decisionOutcomeSchema,
  determiningPolicies: z.array(z.string()),
  errors: z.array(z.string()),
  durationMs: z.number().nonnegative(),
  resultSummary: z.unknown().optional(),
  executionError: z.string().optional(),
});
export type DecisionRecord = z.infer<typeof decisionRecordSchema>;

export function emptyAuthorizationSession(sessionId: string, now: string): AuthorizationSessionDocument {
  return { schemaVersion: 1, revision: 0, sessionId, updatedAt: now, completed: [], reservations: [] };
}
