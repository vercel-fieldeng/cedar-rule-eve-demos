import { expect, it } from "vitest";
import { emptyAuthorizationSession } from "../documents";
import { buildSessionContext } from "../engine";

it("retains expired, unresolved count and budget reservations", () => {
  const now = "2026-09-09T14:00:00.000Z";
  const state = emptyAuthorizationSession("s", now);
  state.reservations.push({ operationId: "pending", action: "process_refund",
    input: { orderId: "ORD-1001", amount: 700 }, policyRevision: 1,
    createdAt: "2026-09-09T13:00:00.000Z", expiresAt: "2026-09-09T13:00:30.000Z" });
  const context = buildSessionContext(state, now);
  expect(context.counts.process_refund).toBe(1);
  expect(context.prior.process_refund?.amountTotal).toBe(700);
});
