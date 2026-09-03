import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

export default guarded("update_shipping_address", {
  description: TOOL_CATALOG.update_shipping_address.description,
  inputSchema: TOOL_CATALOG.update_shipping_address.inputSchema,
  execute({ orderId, country, line1, city, postalCode }) {
    const order = demoStore.getOrder(orderId);
    if (!order) return { ok: false, error: `Unknown order ${orderId}` };
    if (order.status !== "processing") {
      return { ok: false, error: `Order ${order.id} is ${order.status}; the address can no longer be changed` };
    }
    const previous = { ...order.shipping };
    order.shipping = { country: country.toUpperCase(), line1, city, postalCode };
    return { ok: true, orderId: order.id, previous, shipping: order.shipping };
  },
});
