import { guarded } from "@/lib/cedar/guard";
import { TOOL_CATALOG } from "@/lib/cedar/catalog";
import { demoStore } from "@/lib/demo-data/orders";

export default guarded("lookup_customer", {
  description: TOOL_CATALOG.lookup_customer.description,
  inputSchema: TOOL_CATALOG.lookup_customer.inputSchema,
  execute({ customerId }) {
    const customer = demoStore.getCustomer(customerId);
    if (!customer) return { found: false, customerId };
    return {
      found: true,
      customer: {
        id: customer.id,
        name: customer.name,
        region: customer.region,
        lifetimeValue: customer.lifetimeValue,
        riskFlags: customer.riskFlags,
        // Contact details are PII: only the export tool with includePii returns them.
        emailMasked: customer.email.replace(/^(.).*(@.*)$/, "$1***$2"),
      },
    };
  },
});
