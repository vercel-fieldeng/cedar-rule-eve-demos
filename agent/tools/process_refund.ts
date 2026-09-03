import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

/**
 * Simulated payment write. The demo fixtures are intentionally NOT mutated so
 * every guided scenario is repeatable: the point of this tool is the Cedar
 * decision in front of it, not the ledger behind it.
 */
export default guarded("process_refund", {
  description: TOOL_CATALOG.process_refund.description,
  inputSchema: TOOL_CATALOG.process_refund.inputSchema,
  execute({ orderId, amount, reason }) {
    const order = demoStore.getOrder(orderId);
    if (!order) return { ok: false, error: `Unknown order ${orderId}` };
    const refundable = order.total - order.refunded;
    if (amount > refundable) {
      return { ok: false, error: `Refund of ${amount} exceeds refundable balance ${refundable}` };
    }
    const refundedAfter = order.refunded + amount;
    return {
      ok: true,
      refundId: `RF-${order.id.slice(4)}-${Date.now().toString(36).toUpperCase().slice(-5)}`,
      orderId: order.id,
      amount,
      reason,
      remainingBalance: order.total - refundedAfter,
      status: refundedAfter >= order.total ? "refunded" : order.status,
      simulated: true,
    };
  },
});
