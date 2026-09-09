import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

export default guarded("cancel_order", {
  description: TOOL_CATALOG.cancel_order.description,
  inputSchema: TOOL_CATALOG.cancel_order.inputSchema,
  execute({ orderId, notifyCustomer }) {
    const order = demoStore.getOrder(orderId);
    if (!order) return { ok: false, error: `Unknown order ${orderId}`, simulated: true };
    if (order.status !== "processing") {
      return { ok: false, error: `Order ${order.id} is ${order.status}; only processing orders can be cancelled`, simulated: true };
    }
    // Simulated write: fixtures stay pristine so guided scenarios are repeatable.
    return { ok: true, orderId: order.id, status: "cancelled", customerNotified: notifyCustomer, simulated: true };
  },
});
