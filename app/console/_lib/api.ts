"use client";

import useSWR, { mutate as globalMutate } from "swr";
import type { AnalysisFinding, AuthorizeResult, ValidationReport } from "@/lib/cedar/engine";
import type { EngineMode } from "@/lib/db/schema";

/* ------------------------------------------------------------------ */
/* Types (serialized shapes of the API routes)                          */
/* ------------------------------------------------------------------ */

export interface PolicyDto {
  id: string;
  description: string;
  cedar: string;
  enabled: boolean;
  origin: "seed" | "console" | "ai";
  createdAt: string;
  updatedAt: string;
}

export interface DecisionDto {
  id: number;
  createdAt: string;
  sessionId: string;
  principalType: string;
  principalId: string;
  action: string;
  resource: string;
  input: Record<string, unknown>;
  context: unknown;
  decision: "ALLOW" | "DENY";
  mode: EngineMode;
  enforced: boolean;
  determiningPolicies: string[];
  errors: string[];
  durationMs: number;
}

export type AnalysisReport = AnalysisFinding[];

export interface SchemaDto {
  schema: string;
  tools: { name: string; description: string; mutating: boolean }[];
}

/* ------------------------------------------------------------------ */
/* Fetching                                                             */
/* ------------------------------------------------------------------ */

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error(data.error ?? `${url} failed: ${res.status}`) as Error & { data?: unknown };
    err.data = data;
    throw err;
  }
  return data;
}

export const KEYS = {
  policies: "/api/policies",
  engine: "/api/engine",
  schema: "/api/schema",
  decisions: (sessionId?: string) =>
    sessionId ? `/api/decisions?limit=100&sessionId=${encodeURIComponent(sessionId)}` : "/api/decisions?limit=100",
};

export function usePolicies() {
  return useSWR<{ policies: PolicyDto[]; mode: EngineMode }>(KEYS.policies, jsonFetcher, {
    keepPreviousData: true,
  });
}

export function useEngineMode() {
  return useSWR<{ mode: EngineMode; cedarVersion: string }>(KEYS.engine, jsonFetcher, {
    refreshInterval: 5000,
  });
}

export function useSchema() {
  return useSWR<SchemaDto>(KEYS.schema, jsonFetcher, { revalidateOnFocus: false });
}

export function useDecisions(sessionId?: string, live = true) {
  return useSWR<{ decisions: DecisionDto[] }>(KEYS.decisions(sessionId), jsonFetcher, {
    refreshInterval: live ? 1500 : 0,
    keepPreviousData: true,
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                            */
/* ------------------------------------------------------------------ */

export async function savePolicy(body: {
  id: string;
  description: string;
  cedar: string;
  enabled?: boolean;
  origin?: PolicyDto["origin"];
}) {
  const out = await postJson<{ policy: PolicyDto; validation: ValidationReport; analysis: AnalysisReport }>(
    KEYS.policies,
    body,
  );
  await globalMutate(KEYS.policies);
  return out;
}

export async function togglePolicy(id: string, enabled: boolean) {
  await postJson(`/api/policies/${encodeURIComponent(id)}`, { enabled }, "PATCH");
  await globalMutate(KEYS.policies);
}

export async function deletePolicy(id: string) {
  await postJson(`/api/policies/${encodeURIComponent(id)}`, undefined, "DELETE");
  await globalMutate(KEYS.policies);
}

export async function resetPolicies() {
  await postJson(KEYS.policies, undefined, "DELETE");
  await globalMutate(KEYS.policies);
}

export async function setEngineMode(mode: EngineMode) {
  await postJson(KEYS.engine, { mode }, "PUT");
  await Promise.all([globalMutate(KEYS.engine), globalMutate(KEYS.policies)]);
}

export async function clearDecisions() {
  await postJson("/api/decisions", undefined, "DELETE");
  await globalMutate((key) => typeof key === "string" && key.startsWith("/api/decisions"));
}

export function validateCedar(cedar: string) {
  return postJson<{ validation: ValidationReport; analysis?: AnalysisReport }>("/api/policies/validate", {
    cedar,
  });
}

export interface DryRunBody {
  personaId: string;
  action: string;
  input: Record<string, unknown>;
  now?: string;
  session?: {
    counts: Record<string, number>;
    prior: Record<
      string,
      { count: number; latest: string; orderIds: string[]; customerIds: string[]; amountTotal: number }
    >;
  };
  draft?: { id: string; cedar: string };
  includeStored?: boolean;
}

export function dryRun(body: DryRunBody) {
  return postJson<{ result: AuthorizeResult; policyIds: string[]; draftValidation?: ValidationReport }>(
    "/api/policies/test",
    body,
  );
}

export interface AuthorResponse {
  draft: { id: string; description: string; cedar: string; notes: string };
  validation: ValidationReport;
  analysis?: AnalysisReport;
  attempts: number;
  model: string;
  error?: string;
}

export function authorPolicy(prompt: string) {
  return postJson<AuthorResponse>("/api/policies/author", { prompt });
}
