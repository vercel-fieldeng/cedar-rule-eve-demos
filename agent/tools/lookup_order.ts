import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

export default guarded("lookup_order", {
  description: TOOL_CATALOG.lookup_order.description,
  inputSchema: TOOL_CATALOG.lookup_order.inputSchema,
  execute({ orderId }) {
    const order = demoStore.getOrder(orderId);
    if (!order) {
      return { found: false, orderId, knownOrders: demoStore.listOrderIds() };
    }
    return {
      found: true,
      order: {
        id: order.id,
        customerId: order.customerId,
        status: order.status,
        total: order.total,
        currency: order.currency,
        refunded: order.refunded,
        discountPercent: order.discountPercent,
        items: order.items,
        shipping: order.shipping,
        placedAt: order.placedAt,
        approvals: demoStore.approvalsFor(order.id),
      },
    };
  },
});
