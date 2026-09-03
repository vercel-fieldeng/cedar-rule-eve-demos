import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Cedar policy store. One row per `@id(...)` policy. */
export const cedarPolicies = pgTable("cedar_policies", {
  id: text("id").primaryKey(),
  description: text("description").notNull().default(""),
  cedar: text("cedar").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  /** "seed" | "console" | "ai" */
  origin: text("origin").notNull().default("seed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Single-row engine configuration: ENFORCE or LOG_ONLY. */
export const cedarEngine = pgTable("cedar_engine", {
  id: text("id").primaryKey().default("default"),
  mode: text("mode").notNull().default("ENFORCE"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Authorization decision audit log. */
export const cedarDecisions = pgTable(
  "cedar_decisions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sessionId: text("session_id").notNull(),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    input: jsonb("input").notNull().default({}),
    context: jsonb("context").notNull().default({}),
    decision: text("decision").notNull(),
    mode: text("mode").notNull(),
    enforced: boolean("enforced").notNull(),
    determiningPolicies: jsonb("determining_policies").notNull().default([]),
    errors: jsonb("errors").notNull().default([]),
    durationMs: integer("duration_ms").notNull().default(0),
  },
  (t) => [index("cedar_decisions_session_idx").on(t.sessionId, t.createdAt)],
);

export type CedarPolicyRow = typeof cedarPolicies.$inferSelect;
export type CedarDecisionRow = typeof cedarDecisions.$inferSelect;
export type EngineMode = "ENFORCE" | "LOG_ONLY";
