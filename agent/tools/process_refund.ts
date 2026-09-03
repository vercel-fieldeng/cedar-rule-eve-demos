import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

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
    order.refunded += amount;
    if (order.refunded >= order.total) order.status = "refunded";
    return {
      ok: true,
      refundId: `RF-${order.id.slice(4)}-${String(order.refunded).padStart(4, "0")}`,
      orderId: order.id,
      amount,
      reason,
      remainingBalance: order.total - order.refunded,
      status: order.status,
    };
  },
});
