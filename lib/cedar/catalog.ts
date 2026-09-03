import { z } from "zod";

/**
 * The tool catalog is the single source of truth for what the agent can do.
 * Each entry's `inputSchema` is used both as the eve tool `inputSchema` and to
 * generate the Cedar schema (`context.input` shape for each action). This is
 * the eve analogue of AgentCore deriving its Cedar schema from a Gateway's
 * tool definitions.
 */
export const AGENT_ID = "orderdesk";
export const CEDAR_NAMESPACE = "Eve";

export interface CatalogEntry<T extends z.ZodObject = z.ZodObject> {
  readonly description: string;
  readonly inputSchema: T;
  /** Read-only tools are safe to run without side effects. */
  readonly mutating: boolean;
}

export const TOOL_CATALOG = {
  lookup_order: {
    description: "Look up an order by id. Returns status, total, customer and shipping details.",
    inputSchema: z.object({
      orderId: z.string().min(1).describe("Order id, e.g. ORD-1001"),
    }),
    mutating: false,
  },
  lookup_customer: {
    description: "Look up a customer profile by id, including risk flags and lifetime value.",
    inputSchema: z.object({
      customerId: z.string().min(1).describe("Customer id, e.g. CUST-1"),
    }),
    mutating: false,
  },
  approve_refund: {
    description:
      "Record a refund approval for an order. Required before processing refunds of 500 or more.",
    inputSchema: z.object({
      orderId: z.string().min(1),
      amount: z.number().int().nonnegative().describe("Approved refund amount in whole currency units"),
      note: z.string().optional(),
    }),
    mutating: true,
  },
  process_refund: {
    description: "Issue a refund for an order. Amount is in whole currency units.",
    inputSchema: z.object({
      orderId: z.string().min(1),
      amount: z.number().int().positive().describe("Refund amount in whole currency units"),
      reason: z
        .enum(["defective", "not_received", "changed_mind", "fraud", "goodwill", "other"])
        .describe("Refund reason code"),
    }),
    mutating: true,
  },
  cancel_order: {
    description: "Cancel an order that has not shipped yet.",
    inputSchema: z.object({
      orderId: z.string().min(1),
      notifyCustomer: z.boolean().default(true),
    }),
    mutating: true,
  },
  update_shipping_address: {
    description: "Change the shipping address on an unshipped order.",
    inputSchema: z.object({
      orderId: z.string().min(1),
      country: z.string().length(2).describe("ISO 3166-1 alpha-2 country code"),
      line1: z.string().min(1),
      city: z.string().min(1),
      postalCode: z.string().min(1),
    }),
    mutating: true,
  },
  apply_discount: {
    description: "Apply a percentage discount to an order.",
    inputSchema: z.object({
      orderId: z.string().min(1),
      percent: z.number().int().min(1).max(100).describe("Discount percentage 1-100"),
      code: z.string().optional().describe("Optional promo code"),
    }),
    mutating: true,
  },
  export_customer_data: {
    description: "Export a customer's records. Formats: summary (no PII) or full (includes PII).",
    inputSchema: z.object({
      customerId: z.string().min(1),
      format: z.enum(["summary", "full"]),
      includePii: z.boolean().default(false),
    }),
    mutating: true,
  },
} as const satisfies Record<string, CatalogEntry>;

export type ToolName = keyof typeof TOOL_CATALOG;
export const TOOL_NAMES = Object.keys(TOOL_CATALOG) as ToolName[];

export function isToolName(value: string): value is ToolName {
  return value in TOOL_CATALOG;
}
