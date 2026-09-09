"use client";

import useSWR, { mutate as globalMutate } from "swr";
import type { AnalysisFinding, AuthorizeResult, ValidationReport } from "@/lib/cedar/engine";
import type { DecisionOutcome, EngineMode } from "@/lib/cedar/documents";

export interface PolicyDto {
  id: string;
  description: string;
  cedar: string;
  enabled: boolean;
  origin: "seed" | "console" | "ai";
  createdAt: string;
  updatedAt: string;
}

export interface PolicyConfigDto {
  policies: PolicyDto[];
  mode: EngineMode;
  revision: number;
  etag: string;
  updatedAt: string;
  updatedBy: string;
}

export interface DecisionDto {
  id: string;
  operationId: string;
  createdAt: string;
  updatedAt: string;
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
  policyRevision: number;
  outcome: DecisionOutcome;
  determiningPolicies: string[];
  errors: string[];
  durationMs: number;
  resultSummary?: unknown;
  executionError?: string;
}

export type AnalysisReport = AnalysisFinding[];

export interface SchemaDto {
  schema: string;
  tools: { name: string; description: string; mutating: boolean }[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function jsonFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? `${url} failed: ${response.status}`, response.status, data);
  return data;
}

export async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? `${url} failed: ${response.status}`, response.status, data);
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
  return useSWR<PolicyConfigDto>(KEYS.policies, jsonFetcher, { keepPreviousData: true });
}

export function useEngineMode() {
  return useSWR<{ mode: EngineMode; revision: number; etag: string; cedarVersion: string }>(KEYS.engine, jsonFetcher, {
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

async function refreshConfig() {
  await Promise.all([globalMutate(KEYS.policies), globalMutate(KEYS.engine)]);
}

export async function savePolicy(body: {
  id: string;
  description: string;
  cedar: string;
  expectedEtag: string;
  enabled?: boolean;
  origin?: PolicyDto["origin"];
}) {
  try {
    return await postJson<{
      policy: PolicyDto;
      validation: ValidationReport;
      analysis: AnalysisReport;
      revision: number;
      etag: string;
    }>(KEYS.policies, body);
  } finally {
    await refreshConfig();
  }
}

export async function togglePolicy(id: string, enabled: boolean, expectedEtag: string) {
  try {
    return await postJson(`/api/policies/${encodeURIComponent(id)}`, { enabled, expectedEtag }, "PATCH");
  } finally {
    await refreshConfig();
  }
}

export async function deletePolicy(id: string, expectedEtag: string) {
  try {
    return await postJson(`/api/policies/${encodeURIComponent(id)}`, { expectedEtag }, "DELETE");
  } finally {
    await refreshConfig();
  }
}

export async function resetPolicies(expectedEtag: string) {
  try {
    return await postJson(KEYS.policies, { expectedEtag }, "DELETE");
  } finally {
    await refreshConfig();
  }
}

export async function setEngineMode(mode: EngineMode, expectedEtag: string) {
  try {
    return await postJson(KEYS.engine, { mode, expectedEtag }, "PUT");
  } finally {
    await refreshConfig();
  }
}

export async function clearDecisions(sessionId?: string) {
  const url = sessionId ? `/api/decisions?sessionId=${encodeURIComponent(sessionId)}` : "/api/decisions";
  await postJson(url, undefined, "DELETE");
  await globalMutate((key) => typeof key === "string" && key.startsWith("/api/decisions"));
}

export function validateCedar(cedar: string) {
  return postJson<{ validation: ValidationReport; analysis?: AnalysisReport }>("/api/policies/validate", { cedar });
}

export interface DryRunBody {
  personaId: string;
  action: string;
  input: Record<string, unknown>;
  now?: string;
  session?: {
    counts: Record<string, number>;
    prior: Record<string, { count: number; latest: string; orderIds: string[]; customerIds: string[]; amountTotal: number }>;
    refundApproval?: { orderId: string; availableAmount: number; latest: string };
  };
  draft?: { id: string; cedar: string };
  includeStored?: boolean;
}

export function dryRun(body: DryRunBody) {
  return postJson<{ result: AuthorizeResult; policyIds: string[]; draftValidation?: ValidationReport; testedRevision: number }>(
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
