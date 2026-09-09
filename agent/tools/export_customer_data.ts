import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

export default guarded("export_customer_data", {
  description: TOOL_CATALOG.export_customer_data.description,
  inputSchema: TOOL_CATALOG.export_customer_data.inputSchema,
  execute({ customerId, format, includePii }) {
    const customer = demoStore.getCustomer(customerId);
    if (!customer) return { ok: false, error: `Unknown customer ${customerId}`, simulated: true };

    const orders = demoStore
      .listOrderIds()
      .map((id) => demoStore.getOrder(id)!)
      .filter((o) => o.customerId === customer.id)
      .map((o) => ({ id: o.id, status: o.status, total: o.total, refunded: o.refunded }));

    const summary = {
      customerId: customer.id,
      region: customer.region,
      lifetimeValue: customer.lifetimeValue,
      orderCount: orders.length,
      riskFlags: customer.riskFlags,
    };

    if (format === "summary") {
      return { ok: true, format, includePii: false, export: summary, simulated: true };
    }
    return {
      ok: true,
      format,
      includePii,
      simulated: true,
      export: {
        ...summary,
        orders,
        ...(includePii ? { name: customer.name, email: customer.email, phone: customer.phone } : {}),
      },
    };
  },
});
