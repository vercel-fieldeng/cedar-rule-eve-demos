import { expect, it } from "vitest";
import { CedarRepository } from "../store";
import { MemoryObjectStore } from "./memory-store";

it("downloads only the requested page, across sessions, with exclusive cursors", async () => {
  const objects = new MemoryObjectStore();
  let now = Date.parse("2026-09-09T14:00:00.000Z");
  const repository = new CedarRepository(objects, () => new Date(now++));
  const ids: string[] = [];
  for (let i = 0; i < 50; i++) {
    const { decision } = await repository.createDecision({ operationId: String(i), sessionId: i % 2 ? "a" : "b",
      principalType: "Eve::User", principalId: "u", action: "lookup_order", resource: "agent", input: {}, context: {},
      decision: "ALLOW", mode: "ENFORCE", enforced: false, policyRevision: 1, outcome: "succeeded",
      determiningPolicies: [], errors: [], durationMs: 0 });
    ids.push(decision.id);
  }
  let reads = 0;
  const original = objects.read.bind(objects);
  objects.read = async <T>(path: string) => { reads++; return original<T>(path); };
  const newest = await repository.listDecisions({ limit: 5 });
  expect(reads).toBe(5);
  expect(newest.map(row => row.id)).toEqual(ids.slice(-5).reverse());
  reads = 0;
  const older = await repository.listDecisions({ limit: 5, beforeId: newest.at(-1)!.id });
  expect(reads).toBe(5);
  expect(older.map(row => row.id)).toEqual(ids.slice(-10, -5).reverse());
  reads = 0;
  expect(await repository.listDecisions({ afterId: ids.at(-1)! })).toEqual([]);
  expect(reads).toBe(0);
});
