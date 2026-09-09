import { describe, expect, it } from "vitest";
import { emptyAuthorizationSession } from "../documents";
import { buildSessionContext } from "../engine";

const now = "2026-09-09T14:00:00.000Z";

function complete(state: ReturnType<typeof emptyAuthorizationSession>, action: "approve_refund" | "process_refund", orderId: string, amount: number, completedAt: string) {
  state.completed.push({ operationId: `${action}-${state.completed.length}`, action, input: { orderId, amount }, policyRevision: 1, completedAt });
}

describe("buildSessionContext", () => {
  it("isolates, consumes, and expires approval capacity by order", () => {
    const state = emptyAuthorizationSession("session-1", now);
    complete(state, "approve_refund", "ORD-1002", 1000, "2026-09-09T13:30:00.000Z");
    complete(state, "approve_refund", "ORD-1004", 900, "2026-09-09T13:40:00.000Z");
    complete(state, "process_refund", "ORD-1002", 400, "2026-09-09T13:45:00.000Z");
    state.reservations.push({
      operationId: "pending-refund",
      action: "process_refund",
      input: { orderId: "ORD-1002", amount: 100 },
      policyRevision: 1,
      createdAt: "2026-09-09T13:50:00.000Z",
      expiresAt: "2026-09-09T14:01:00.000Z",
    });

    expect(buildSessionContext(state, now, 1, { orderId: "ORD-1002" }).refundApproval).toMatchObject({
      orderId: "ORD-1002",
      availableAmount: 500,
    });
    expect(buildSessionContext(state, now, 1, { orderId: "ORD-1004" }).refundApproval).toMatchObject({
      orderId: "ORD-1004",
      availableAmount: 900,
    });

    const expired = emptyAuthorizationSession("session-2", now);
    complete(expired, "approve_refund", "ORD-1002", 1000, "2026-09-09T12:59:59.000Z");
    expect(buildSessionContext(expired, now, 1, { orderId: "ORD-1002" }).refundApproval).toBeUndefined();
  });

  it("counts active reservations conservatively", () => {
    const state = emptyAuthorizationSession("session-1", now);
    state.reservations.push({
      operationId: "pending",
      action: "process_refund",
      input: { orderId: "ORD-1004", amount: 700 },
      policyRevision: 1,
      createdAt: "2026-09-09T13:59:00.000Z",
      expiresAt: "2026-09-09T14:01:00.000Z",
    });
    const context = buildSessionContext(state, now, 1, { orderId: "ORD-1004" });
    expect(context.counts.process_refund).toBe(1);
    expect(context.prior.process_refund?.amountTotal).toBe(700);
  });
});
