import { expect, it } from "vitest";
import { CedarRepository } from "../store";
import { AuthorizationOperationRunner } from "../operation-runner";
import { MemoryObjectStore } from "./memory-store";

it("preserves pending audit records during execution and clears them afterward", async () => {
  const repository = new CedarRepository(new MemoryObjectStore());
  const runner = new AuthorizationOperationRunner({ repository });
  const result = await runner.run({
    sessionId: "s", turn: 1,
    principal: { kind: "user", id: "staff", tags: { scope: "orders:read" } },
    action: "lookup_order", input: { orderId: "ORD-1001" },
    execute: async () => {
      expect(await repository.clearDecisions("s")).toBe(0);
      return { found: true };
    },
  });
  expect(result.kind).toBe("executed");
  expect((await repository.listDecisions({ sessionId: "s" }))[0].outcome).toBe("succeeded");
  expect(await repository.clearDecisions("s")).toBe(1);
  expect((await repository.getSession("s")).state.completed).toHaveLength(1);
});
