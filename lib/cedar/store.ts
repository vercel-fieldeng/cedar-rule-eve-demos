import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  cedarDecisions,
  cedarEngine,
  cedarPolicies,
  type CedarDecisionRow,
  type CedarPolicyRow,
  type EngineMode,
} from "../db/schema";
import { SEED_POLICIES } from "./seed-policies";

/* ------------------------------------------------------------------ */
/* Policies                                                             */
/* ------------------------------------------------------------------ */

let seeded = false;

/** Idempotently loads the seed policies on first use so the demo works cold. */
export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cedarPolicies);
  if (count === 0) {
    await db.insert(cedarPolicies).values(
      SEED_POLICIES.map((p) => ({
        id: p.id,
        description: p.description,
        cedar: p.cedar,
        enabled: p.enabled ?? true,
        origin: "seed",
      })),
    );
  }
  seeded = true;
}

export async function listPolicies(): Promise<CedarPolicyRow[]> {
  await ensureSeeded();
  return db.select().from(cedarPolicies).orderBy(cedarPolicies.createdAt, cedarPolicies.id);
}

/**
 * Enabled policies as an id-keyed record. Cedar uses the record keys as policy
 * ids in its diagnostics, so decisions cite `refund-under-500-for-leads`
 * instead of `policy3`.
 */
export async function getEnabledPolicySet(): Promise<Record<string, string>> {
  const rows = await listPolicies();
  const set: Record<string, string> = {};
  for (const r of rows) if (r.enabled) set[r.id] = r.cedar;
  return set;
}

export async function upsertPolicy(input: {
  id: string;
  description: string;
  cedar: string;
  enabled?: boolean;
  origin?: string;
}): Promise<CedarPolicyRow> {
  await ensureSeeded();
  const [row] = await db
    .insert(cedarPolicies)
    .values({
      id: input.id,
      description: input.description,
      cedar: input.cedar,
      enabled: input.enabled ?? true,
      origin: input.origin ?? "console",
    })
    .onConflictDoUpdate({
      target: cedarPolicies.id,
      set: {
        description: input.description,
        cedar: input.cedar,
        enabled: input.enabled ?? true,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function setPolicyEnabled(id: string, enabled: boolean): Promise<void> {
  await db
    .update(cedarPolicies)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(cedarPolicies.id, id));
}

export async function deletePolicy(id: string): Promise<void> {
  await db.delete(cedarPolicies).where(eq(cedarPolicies.id, id));
}

/** Restores the seed set: deletes everything and re-inserts the seeds. */
export async function resetPolicies(): Promise<void> {
  await db.delete(cedarPolicies);
  seeded = false;
  await ensureSeeded();
}

/* ------------------------------------------------------------------ */
/* Engine mode                                                          */
/* ------------------------------------------------------------------ */

export async function getEngineMode(): Promise<EngineMode> {
  const [row] = await db.select().from(cedarEngine).where(eq(cedarEngine.id, "default"));
  if (!row) {
    await db.insert(cedarEngine).values({ id: "default", mode: "ENFORCE" }).onConflictDoNothing();
    return "ENFORCE";
  }
  return row.mode === "LOG_ONLY" ? "LOG_ONLY" : "ENFORCE";
}

export async function setEngineMode(mode: EngineMode): Promise<void> {
  await db
    .insert(cedarEngine)
    .values({ id: "default", mode })
    .onConflictDoUpdate({ target: cedarEngine.id, set: { mode, updatedAt: new Date() } });
}

/* ------------------------------------------------------------------ */
/* Decisions                                                            */
/* ------------------------------------------------------------------ */

export interface DecisionRecord {
  sessionId: string;
  principalType: string;
  principalId: string;
  action: string;
  resource: string;
  input: unknown;
  context: unknown;
  decision: "ALLOW" | "DENY";
  mode: EngineMode;
  enforced: boolean;
  determiningPolicies: string[];
  errors: string[];
  durationMs: number;
}

export async function recordDecision(rec: DecisionRecord): Promise<number> {
  const [row] = await db
    .insert(cedarDecisions)
    .values({
      sessionId: rec.sessionId,
      principalType: rec.principalType,
      principalId: rec.principalId,
      action: rec.action,
      resource: rec.resource,
      input: rec.input ?? {},
      context: rec.context ?? {},
      decision: rec.decision,
      mode: rec.mode,
      enforced: rec.enforced,
      determiningPolicies: rec.determiningPolicies,
      errors: rec.errors,
      durationMs: Math.max(0, Math.round(rec.durationMs)),
    })
    .returning({ id: cedarDecisions.id });
  return row.id;
}

export async function listDecisions(opts: {
  limit?: number;
  sessionId?: string;
  afterId?: number;
}): Promise<CedarDecisionRow[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conds = [];
  if (opts.sessionId) conds.push(eq(cedarDecisions.sessionId, opts.sessionId));
  if (opts.afterId !== undefined) conds.push(sql`${cedarDecisions.id} > ${opts.afterId}`);
  return db
    .select()
    .from(cedarDecisions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(cedarDecisions.id))
    .limit(limit);
}

export async function clearDecisions(): Promise<void> {
  await db.delete(cedarDecisions);
}

/**
 * Prior *executed* actions in this session. Only decisions that actually ran
 * the tool count (ALLOW in either mode, or DENY that was not enforced in
 * LOG_ONLY). This is the substrate for temporal policies.
 */
export async function listExecutedActionsForSession(sessionId: string): Promise<CedarDecisionRow[]> {
  return db
    .select()
    .from(cedarDecisions)
    .where(and(eq(cedarDecisions.sessionId, sessionId), eq(cedarDecisions.enforced, false)))
    .orderBy(cedarDecisions.id);
}
