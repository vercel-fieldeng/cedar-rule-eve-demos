import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

export default guarded("apply_discount", {
  description: TOOL_CATALOG.apply_discount.description,
  inputSchema: TOOL_CATALOG.apply_discount.inputSchema,
  execute({ orderId, percent, code }) {
    const order = demoStore.getOrder(orderId);
    if (!order) return { ok: false, error: `Unknown order ${orderId}`, simulated: true };
    // Simulated write: fixtures stay pristine so guided scenarios are repeatable.
    const discounted = Math.round(order.total * (1 - percent / 100));
    return {
      ok: true,
      orderId: order.id,
      percent,
      code: code ?? null,
      originalTotal: order.total,
      discountedTotal: discounted,
      simulated: true,
    };
  },
});
