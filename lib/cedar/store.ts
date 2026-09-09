import { randomUUID } from "node:crypto";
import type { JsonObjectStore, StoredJson } from "./blob-storage";
import { blobObjectStore, StorageConflictError } from "./blob-storage";
import {
  authorizationSessionDocumentSchema,
  decisionRecordSchema,
  emptyAuthorizationSession,
  policyConfigDocumentSchema,
  type AuthorizationSessionDocument,
  type DecisionRecord,
  type EngineMode,
  type PolicyConfigDocument,
  type PolicyOrigin,
  type PolicyRecord,
} from "./documents";
import { validatePolicies } from "./engine";
import { SEED_POLICIES } from "./seed-policies";

export const STORAGE_PATHS = {
  policyConfig: "orderdesk/v1/config/policies.json",
  authorizationSessions: "orderdesk/v1/authorization-sessions/",
  decisions: "orderdesk/v1/decisions/",
} as const;

export class StalePolicyConfigError extends StorageConflictError {
  constructor() {
    super("Policy configuration changed in another session. Reload and apply your change again.");
    this.name = "StalePolicyConfigError";
  }
}

export interface PolicyConfigSnapshot {
  config: PolicyConfigDocument;
  etag: string;
}

export interface SessionSnapshot {
  state: AuthorizationSessionDocument;
  etag: string | null;
}

function nowIso(clock: () => Date): string {
  return clock().toISOString();
}

function sessionPath(sessionId: string): string {
  return `${STORAGE_PATHS.authorizationSessions}${encodeURIComponent(sessionId)}.json`;
}

function decisionPrefix(sessionId?: string): string {
  return sessionId
    ? `${STORAGE_PATHS.decisions}${encodeURIComponent(sessionId)}/`
    : STORAGE_PATHS.decisions;
}

function decisionPath(sessionId: string, id: string): string {
  return `${decisionPrefix(sessionId)}${id}.json`;
}

function parseDocument<T>(pathname: string, schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Malformed private Blob document at ${pathname}: ${detail}`);
  }
}

export class CedarRepository {
  constructor(
    readonly objects: JsonObjectStore = blobObjectStore,
    readonly clock: () => Date = () => new Date(),
  ) {}

  private defaultConfig(): PolicyConfigDocument {
    const timestamp = nowIso(this.clock);
    return {
      schemaVersion: 1,
      revision: 1,
      updatedAt: timestamp,
      updatedBy: "repository-defaults",
      mode: "ENFORCE",
      policies: SEED_POLICIES.map((policy) => ({
        ...policy,
        origin: "seed" as const,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    };
  }

  async getPolicyConfig(): Promise<PolicyConfigSnapshot> {
    const stored = await this.objects.read<unknown>(STORAGE_PATHS.policyConfig);
    if (stored) {
      return {
        config: parseDocument(stored.pathname, policyConfigDocumentSchema, stored.value),
        etag: stored.etag,
      };
    }

    const initial = this.defaultConfig();
    this.validateConfig(initial);
    try {
      const created = await this.objects.create(STORAGE_PATHS.policyConfig, initial);
      return { config: initial, etag: created.etag };
    } catch (error) {
      if (!(error instanceof StorageConflictError)) throw error;
      const winner = await this.objects.read<unknown>(STORAGE_PATHS.policyConfig);
      if (!winner) throw new Error("Policy configuration initialization raced but no winning document was found.");
      return {
        config: parseDocument(winner.pathname, policyConfigDocumentSchema, winner.value),
        etag: winner.etag,
      };
    }
  }

  private validateConfig(config: PolicyConfigDocument): void {
    policyConfigDocumentSchema.parse(config);
    const report = validatePolicies(Object.fromEntries(config.policies.map((policy) => [policy.id, policy.cedar])));
    if (!report.ok) {
      throw new Error(`Policy configuration failed Cedar validation: ${report.issues.map((issue) => issue.message).join("; ")}`);
    }
  }

  async replacePolicyConfig(
    expectedEtag: string,
    updatedBy: string,
    transform: (current: PolicyConfigDocument) => PolicyConfigDocument,
  ): Promise<PolicyConfigSnapshot> {
    const current = await this.getPolicyConfig();
    if (current.etag !== expectedEtag) throw new StalePolicyConfigError();
    const timestamp = nowIso(this.clock);
    const next = transform(structuredClone(current.config));
    const activated: PolicyConfigDocument = {
      ...next,
      schemaVersion: 1,
      revision: current.config.revision + 1,
      updatedAt: timestamp,
      updatedBy,
    };
    this.validateConfig(activated);
    try {
      const stored = await this.objects.write(STORAGE_PATHS.policyConfig, activated, expectedEtag);
      return { config: activated, etag: stored.etag };
    } catch (error) {
      if (error instanceof StorageConflictError) throw new StalePolicyConfigError();
      throw error;
    }
  }

  async upsertPolicy(
    input: { id: string; description: string; cedar: string; enabled?: boolean; origin?: PolicyOrigin },
    expectedEtag: string,
  ): Promise<{ policy: PolicyRecord; snapshot: PolicyConfigSnapshot }> {
    let savedPolicy: PolicyRecord | undefined;
    const snapshot = await this.replacePolicyConfig(expectedEtag, "console", (config) => {
      const timestamp = nowIso(this.clock);
      const existing = config.policies.find((policy) => policy.id === input.id);
      savedPolicy = {
        id: input.id,
        description: input.description,
        cedar: input.cedar,
        enabled: input.enabled ?? existing?.enabled ?? true,
        origin: input.origin ?? existing?.origin ?? "console",
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      return {
        ...config,
        policies: [...config.policies.filter((policy) => policy.id !== input.id), savedPolicy].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      };
    });
    if (!savedPolicy) throw new Error("Policy update did not produce a record.");
    return { policy: savedPolicy, snapshot };
  }

  async setPolicyEnabled(id: string, enabled: boolean, expectedEtag: string): Promise<PolicyConfigSnapshot> {
    return this.replacePolicyConfig(expectedEtag, "console", (config) => {
      const timestamp = nowIso(this.clock);
      let found = false;
      const policies = config.policies.map((policy) => {
        if (policy.id !== id) return policy;
        found = true;
        return { ...policy, enabled, updatedAt: timestamp };
      });
      if (!found) throw new Error(`Unknown policy ${id}`);
      return { ...config, policies };
    });
  }

  async deletePolicy(id: string, expectedEtag: string): Promise<PolicyConfigSnapshot> {
    return this.replacePolicyConfig(expectedEtag, "console", (config) => {
      if (!config.policies.some((policy) => policy.id === id)) throw new Error(`Unknown policy ${id}`);
      return { ...config, policies: config.policies.filter((policy) => policy.id !== id) };
    });
  }

  async resetPolicies(expectedEtag: string): Promise<PolicyConfigSnapshot> {
    return this.replacePolicyConfig(expectedEtag, "console-reset", (config) => ({
      ...this.defaultConfig(),
      mode: config.mode,
    }));
  }

  async setEngineMode(mode: EngineMode, expectedEtag: string): Promise<PolicyConfigSnapshot> {
    return this.replacePolicyConfig(expectedEtag, "console", (config) => ({ ...config, mode }));
  }

  async getSession(sessionId: string): Promise<SessionSnapshot> {
    const pathname = sessionPath(sessionId);
    const stored = await this.objects.read<unknown>(pathname);
    if (!stored) return { state: emptyAuthorizationSession(sessionId, nowIso(this.clock)), etag: null };
    const state = parseDocument(stored.pathname, authorizationSessionDocumentSchema, stored.value);
    if (state.sessionId !== sessionId) throw new Error(`Authorization session path mismatch for ${sessionId}`);
    return { state, etag: stored.etag };
  }

  async saveSession(state: AuthorizationSessionDocument, expectedEtag: string | null): Promise<SessionSnapshot> {
    const updated: AuthorizationSessionDocument = {
      ...state,
      revision: state.revision + 1,
      updatedAt: nowIso(this.clock),
    };
    authorizationSessionDocumentSchema.parse(updated);
    const pathname = sessionPath(state.sessionId);
    const stored = expectedEtag
      ? await this.objects.write(pathname, updated, expectedEtag)
      : await this.objects.create(pathname, updated);
    return { state: updated, etag: stored.etag };
  }

  async createDecision(input: Omit<DecisionRecord, "schemaVersion" | "id" | "createdAt" | "updatedAt">) {
    const timestamp = nowIso(this.clock);
    const id = `${String(this.clock().getTime()).padStart(13, "0")}-${randomUUID()}`;
    const decision: DecisionRecord = {
      ...input,
      schemaVersion: 1,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    decisionRecordSchema.parse(decision);
    const stored = await this.objects.create(decisionPath(decision.sessionId, id), decision);
    return { decision, etag: stored.etag, pathname: stored.pathname };
  }

  async updateDecision(
    pathname: string,
    etag: string,
    decision: DecisionRecord,
    patch: Partial<Pick<DecisionRecord, "outcome" | "resultSummary" | "executionError">>,
  ) {
    const updated: DecisionRecord = { ...decision, ...patch, updatedAt: nowIso(this.clock) };
    decisionRecordSchema.parse(updated);
    const stored = await this.objects.write(pathname, updated, etag);
    return { decision: updated, etag: stored.etag, pathname: stored.pathname };
  }

  async listDecisions(options: { sessionId?: string; afterId?: string; beforeId?: string; limit?: number } = {}) {
    const metadata = await this.objects.list(decisionPrefix(options.sessionId));
    const limit = Number.isFinite(options.limit) ? Math.min(Math.max(Math.trunc(options.limit!), 1), 500) : 100;
    const idOf = (pathname: string) => pathname.slice(pathname.lastIndexOf("/") + 1, -5);
    const page = metadata
      .filter((item) => (!options.afterId || idOf(item.pathname) > options.afterId) &&
        (!options.beforeId || idOf(item.pathname) < options.beforeId))
      .sort((a, b) => idOf(b.pathname).localeCompare(idOf(a.pathname)))
      .slice(0, limit);
    const records: DecisionRecord[] = [];
    // Metadata listing remains paginated by the adapter. Download only this
    // page, with bounded concurrency even when the caller requests 500 rows.
    for (let offset = 0; offset < page.length; offset += 16) {
      const batch = await Promise.all(page.slice(offset, offset + 16).map(async (item) => {
        const stored = await this.objects.read<unknown>(item.pathname);
        if (!stored) return null;
        return parseDocument(stored.pathname, decisionRecordSchema, stored.value);
      }));
      records.push(...batch.filter((record): record is DecisionRecord => record !== null));
    }
    return records;
  }

  async clearDecisions(sessionId?: string): Promise<number> {
    const objects = await this.objects.list(decisionPrefix(sessionId));
    let cleared = 0;
    // Pending records are still owned by the operation runner. Deleting one
    // would make its final conditional write fail after execution succeeded.
    for (const object of objects) {
      const stored = await this.objects.read<unknown>(object.pathname);
      if (!stored) continue;
      const decision = parseDocument(stored.pathname, decisionRecordSchema, stored.value);
      if (decision.outcome === "pending") continue;
      await this.objects.delete([object.pathname]);
      cleared += 1;
    }
    return cleared;
  }
}

export const cedarRepository = new CedarRepository();

export async function getPolicyConfig() {
  return cedarRepository.getPolicyConfig();
}

export async function listPolicies() {
  const snapshot = await cedarRepository.getPolicyConfig();
  return { ...snapshot, policies: snapshot.config.policies, mode: snapshot.config.mode, revision: snapshot.config.revision };
}

export async function getEnabledPolicySet() {
  const snapshot = await cedarRepository.getPolicyConfig();
  return {
    policies: Object.fromEntries(
      snapshot.config.policies.filter((policy) => policy.enabled).map((policy) => [policy.id, policy.cedar]),
    ),
    mode: snapshot.config.mode,
    revision: snapshot.config.revision,
    etag: snapshot.etag,
  };
}

export async function upsertPolicy(input: Parameters<CedarRepository["upsertPolicy"]>[0], expectedEtag: string) {
  return cedarRepository.upsertPolicy(input, expectedEtag);
}
export async function setPolicyEnabled(id: string, enabled: boolean, expectedEtag: string) {
  return cedarRepository.setPolicyEnabled(id, enabled, expectedEtag);
}
export async function deletePolicy(id: string, expectedEtag: string) {
  return cedarRepository.deletePolicy(id, expectedEtag);
}
export async function resetPolicies(expectedEtag: string) {
  return cedarRepository.resetPolicies(expectedEtag);
}
export async function getEngineMode() {
  const snapshot = await cedarRepository.getPolicyConfig();
  return { mode: snapshot.config.mode, revision: snapshot.config.revision, etag: snapshot.etag };
}
export async function setEngineMode(mode: EngineMode, expectedEtag: string) {
  return cedarRepository.setEngineMode(mode, expectedEtag);
}
export async function listDecisions(options: Parameters<CedarRepository["listDecisions"]>[0]) {
  return cedarRepository.listDecisions(options);
}
export async function clearDecisions(sessionId?: string) {
  return cedarRepository.clearDecisions(sessionId);
}

export type { DecisionRecord, EngineMode, PolicyRecord } from "./documents";
export type { StoredJson };
