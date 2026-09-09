import { randomUUID } from "node:crypto";
import { StorageConflictError } from "./blob-storage";
import type { AuthorizationSessionDocument, DecisionOutcome, PendingReservation } from "./documents";
import {
  AGENT_RESOURCE_STRING,
  buildSessionContext,
  evaluate,
  pruneExpiredReservations,
  type AuthorizeResult,
  type CedarPrincipal,
} from "./engine";
import { ENTITY_TYPES } from "./schema";
import { CedarRepository, cedarRepository } from "./store";
import type { ToolName } from "./catalog";

const RESERVATION_TTL_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 5;

export interface RunAuthorizedOperationInput<T> {
  sessionId: string;
  turn: number;
  principal: CedarPrincipal;
  action: ToolName;
  input: Record<string, unknown>;
  execute: () => Promise<T>;
  isSuccess?: (output: T) => boolean;
}

export interface BlockedOperation {
  kind: "blocked";
  evaluation: AuthorizeResult;
  decisionId: string;
}

export interface ExecutedOperation<T> {
  kind: "executed";
  evaluation: AuthorizeResult;
  decisionId: string;
  outcome: "succeeded" | "failed";
  output: T;
}

export type AuthorizedOperationResult<T> = BlockedOperation | ExecutedOperation<T>;

export interface AuthorizationRunnerOptions {
  repository?: CedarRepository;
  maxAttempts?: number;
  reservationTtlMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

function defaultSuccess(output: unknown): boolean {
  if (typeof output !== "object" || output === null) return true;
  const record = output as Record<string, unknown>;
  if (typeof record.ok === "boolean") return record.ok;
  if (typeof record.found === "boolean") return record.found;
  return true;
}

export class AuthorizationOperationRunner {
  readonly repository: CedarRepository;
  readonly maxAttempts: number;
  readonly reservationTtlMs: number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;

  constructor(options: AuthorizationRunnerOptions = {}) {
    this.repository = options.repository ?? cedarRepository;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.reservationTtlMs = options.reservationTtlMs ?? RESERVATION_TTL_MS;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
  }

  private async pause(attempt: number) {
    await this.sleep(Math.floor((8 + this.random() * 18) * attempt));
  }

  async run<T>(request: RunAuthorizedOperationInput<T>): Promise<AuthorizedOperationResult<T>> {
    const operationId = randomUUID();
    let reservation: PendingReservation | undefined;
    let evaluation: AuthorizeResult | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const now = this.repository.clock().toISOString();
      const [policySnapshot, sessionSnapshot] = await Promise.all([
        this.repository.getPolicyConfig(),
        this.repository.getSession(request.sessionId),
      ]);
      const state = pruneExpiredReservations(sessionSnapshot.state, now);
      const session = buildSessionContext(state, now, request.turn, request.input);
      const policies = Object.fromEntries(
        policySnapshot.config.policies
          .filter((policy) => policy.enabled)
          .map((policy) => [policy.id, policy.cedar]),
      );
      evaluation = await evaluate({
        principal: request.principal,
        action: request.action,
        input: request.input,
        policies,
        mode: policySnapshot.config.mode,
        policyRevision: policySnapshot.config.revision,
        now,
        session,
      });

      if (evaluation.enforced) {
        const audit = await this.repository.createDecision({
          operationId,
          sessionId: request.sessionId,
          principalType: request.principal.kind === "user" ? ENTITY_TYPES.user : ENTITY_TYPES.service,
          principalId: request.principal.id,
          action: request.action,
          resource: AGENT_RESOURCE_STRING,
          input: request.input,
          context: evaluation.request.context,
          decision: evaluation.decision,
          mode: evaluation.mode,
          enforced: true,
          policyRevision: evaluation.policyRevision,
          outcome: "blocked",
          determiningPolicies: evaluation.determiningPolicies,
          errors: evaluation.errors,
          durationMs: evaluation.durationMs,
        });
        return { kind: "blocked", evaluation, decisionId: audit.decision.id };
      }

      reservation = {
        operationId,
        action: request.action,
        input: request.input,
        policyRevision: evaluation.policyRevision,
        createdAt: now,
        expiresAt: new Date(new Date(now).getTime() + this.reservationTtlMs).toISOString(),
      };
      try {
        await this.repository.saveSession(
          { ...state, reservations: [...state.reservations, reservation] },
          sessionSnapshot.etag,
        );
        break;
      } catch (error) {
        if (!(error instanceof StorageConflictError)) throw error;
        if (attempt === this.maxAttempts) {
          throw new Error("Authorization state remained busy after bounded retries; the tool was not executed.");
        }
        await this.pause(attempt);
      }
    }

    if (!reservation || !evaluation) throw new Error("Authorization reservation was not created.");

    let audit;
    try {
      audit = await this.repository.createDecision({
        operationId,
        sessionId: request.sessionId,
        principalType: request.principal.kind === "user" ? ENTITY_TYPES.user : ENTITY_TYPES.service,
        principalId: request.principal.id,
        action: request.action,
        resource: AGENT_RESOURCE_STRING,
        input: request.input,
        context: evaluation.request.context,
        decision: evaluation.decision,
        mode: evaluation.mode,
        enforced: false,
        policyRevision: evaluation.policyRevision,
        outcome: "pending",
        determiningPolicies: evaluation.determiningPolicies,
        errors: evaluation.errors,
        durationMs: evaluation.durationMs,
      });
    } catch (error) {
      await this.finalizeSession(request.sessionId, reservation, "failed").catch(() => undefined);
      throw new Error(`Audit storage failed before execution; the tool was not run. ${error instanceof Error ? error.message : ""}`.trim());
    }

    let output: T;
    try {
      output = await request.execute();
    } catch (error) {
      await this.finalizeSession(request.sessionId, reservation, "threw");
      await this.repository.updateDecision(audit.pathname, audit.etag, audit.decision, {
        outcome: "threw",
        executionError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const succeeded = (request.isSuccess ?? defaultSuccess)(output);
    const outcome: DecisionOutcome = succeeded ? "succeeded" : "failed";
    await this.finalizeSession(request.sessionId, reservation, outcome);
    await this.repository.updateDecision(audit.pathname, audit.etag, audit.decision, {
      outcome,
      resultSummary: output,
    });
    return {
      kind: "executed",
      evaluation,
      decisionId: audit.decision.id,
      outcome,
      output,
    };
  }

  private async finalizeSession(
    sessionId: string,
    reservation: PendingReservation,
    outcome: "succeeded" | "failed" | "threw",
  ): Promise<void> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const snapshot = await this.repository.getSession(sessionId);
      const pending = snapshot.state.reservations.find((item) => item.operationId === reservation.operationId);
      if (!pending) throw new Error("Authorization reservation disappeared before completion could be confirmed.");
      const next: AuthorizationSessionDocument = {
        ...snapshot.state,
        reservations: snapshot.state.reservations.filter((item) => item.operationId !== reservation.operationId),
        completed:
          outcome === "succeeded"
            ? [
                ...snapshot.state.completed,
                {
                  operationId: pending.operationId,
                  action: pending.action,
                  input: pending.input,
                  policyRevision: pending.policyRevision,
                  completedAt: this.repository.clock().toISOString(),
                },
              ]
            : snapshot.state.completed,
      };
      try {
        await this.repository.saveSession(next, snapshot.etag);
        return;
      } catch (error) {
        if (!(error instanceof StorageConflictError)) throw error;
        if (attempt === this.maxAttempts) {
          throw new Error("Tool execution finished, but authorization state finalization could not be confirmed.");
        }
        await this.pause(attempt);
      }
    }
  }
}

export const authorizationRunner = new AuthorizationOperationRunner();
