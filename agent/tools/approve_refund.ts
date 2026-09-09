import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

export default guarded("approve_refund", {
  description: TOOL_CATALOG.approve_refund.description,
  inputSchema: TOOL_CATALOG.approve_refund.inputSchema,
  execute({ orderId, amount, note }) {
    const order = demoStore.getOrder(orderId);
    if (!order) return { ok: false, error: `Unknown order ${orderId}`, simulated: true };
    if (amount > order.total - order.refunded) {
      return {
        ok: false,
        error: `Approval of ${amount} exceeds the refundable balance of ${order.total - order.refunded}`,
        simulated: true,
      };
    }
    return {
      ok: true,
      orderId: order.id,
      approvedAmount: amount,
      note: note ?? null,
      expiresIn: "1h",
      simulated: true,
    };
  },
});
