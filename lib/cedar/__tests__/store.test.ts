import { describe, expect, it } from "vitest";
import { CedarRepository, STORAGE_PATHS, StalePolicyConfigError } from "../store";
import { MemoryObjectStore } from "./memory-store";

const clock = () => new Date("2026-09-09T14:00:00.000Z");

describe("CedarRepository", () => {
  it("converges on one initializer during a create race", async () => {
    const objects = new MemoryObjectStore();
    let entered = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    objects.beforeCreate = async (pathname) => {
      if (pathname !== STORAGE_PATHS.policyConfig) return;
      entered += 1;
      if (entered === 2) release();
      await gate;
    };
    const first = new CedarRepository(objects, clock);
    const second = new CedarRepository(objects, clock);
    const [a, b] = await Promise.all([first.getPolicyConfig(), second.getPolicyConfig()]);
    expect(a.config).toEqual(b.config);
    expect(a.etag).toBe(b.etag);
  });

  it("rejects stale policy writes without losing the winner", async () => {
    const objects = new MemoryObjectStore();
    const repository = new CedarRepository(objects, clock);
    const initial = await repository.getPolicyConfig();
    const winner = await repository.setEngineMode("LOG_ONLY", initial.etag);
    await expect(repository.setEngineMode("ENFORCE", initial.etag)).rejects.toBeInstanceOf(StalePolicyConfigError);
    expect((await repository.getPolicyConfig()).config).toEqual(winner.config);
  });

  it("clears audit scope without touching authorization state", async () => {
    const objects = new MemoryObjectStore();
    const repository = new CedarRepository(objects, clock);
    await repository.saveSession({ schemaVersion: 1, revision: 0, sessionId: "a", updatedAt: clock().toISOString(), completed: [], reservations: [] }, null);
    for (const sessionId of ["a", "b"]) {
      await repository.createDecision({
        operationId: `op-${sessionId}`,
        sessionId,
        principalType: "Eve::User",
        principalId: "user",
        action: "lookup_order",
        resource: "Eve::Agent::\"orderdesk\"",
        input: {},
        context: {},
        decision: "ALLOW",
        mode: "ENFORCE",
        enforced: false,
        policyRevision: 1,
        outcome: "succeeded",
        determiningPolicies: [],
        errors: [],
        durationMs: 1,
      });
    }
    expect(await repository.clearDecisions("a")).toBe(1);
    expect(await repository.listDecisions({})).toHaveLength(1);
    expect((await repository.getSession("a")).etag).not.toBeNull();
  });
});
