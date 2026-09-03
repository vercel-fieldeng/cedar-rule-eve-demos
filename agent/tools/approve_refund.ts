import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

export default guarded("approve_refund", {
  description: TOOL_CATALOG.approve_refund.description,
  inputSchema: TOOL_CATALOG.approve_refund.inputSchema,
  execute({ orderId, amount, note }) {
    const order = demoStore.getOrder(orderId);
    if (!order) return { ok: false, error: `Unknown order ${orderId}` };
    if (amount > order.total - order.refunded) {
      return {
        ok: false,
        error: `Approval of ${amount} exceeds the refundable balance of ${order.total - order.refunded}`,
      };
    }
    const approvals = demoStore.recordApproval(order.id, amount, note);
    return {
      ok: true,
      orderId: order.id,
      approvedAmount: amount,
      approvalsOnFile: approvals.length,
      note: "This approval is now visible to Cedar as context.session.prior.approve_refund for the rest of this session.",
    };
  },
});
