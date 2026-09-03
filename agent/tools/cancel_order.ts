import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

export default guarded("cancel_order", {
  description: TOOL_CATALOG.cancel_order.description,
  inputSchema: TOOL_CATALOG.cancel_order.inputSchema,
  execute({ orderId, notifyCustomer }) {
    const order = demoStore.getOrder(orderId);
    if (!order) return { ok: false, error: `Unknown order ${orderId}` };
    if (order.status !== "processing") {
      return { ok: false, error: `Order ${order.id} is ${order.status}; only processing orders can be cancelled` };
    }
    order.status = "cancelled";
    return { ok: true, orderId: order.id, status: order.status, customerNotified: notifyCustomer };
  },
});
