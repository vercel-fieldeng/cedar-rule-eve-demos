/**
 * Deterministic demo fixtures for OrderDesk. The tools mutate a copy of these
 * per process; Cedar decisions (the thing being demonstrated) are persisted in
 * Neon, the order book is intentionally ephemeral.
 */
export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  region: string;
  lifetimeValue: number;
  riskFlags: string[];
}

export interface Order {
  id: string;
  customerId: string;
  status: "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  total: number;
  currency: string;
  items: { sku: string; name: string; qty: number; price: number }[];
  shipping: { country: string; line1: string; city: string; postalCode: string };
  refunded: number;
  discountPercent: number;
  placedAt: string;
}

const customers: Customer[] = [
  {
    id: "CUST-1",
    name: "Avery Chen",
    email: "avery.chen@example.com",
    phone: "+1 415 555 0142",
    region: "us-west",
    lifetimeValue: 4820,
    riskFlags: [],
  },
  {
    id: "CUST-2",
    name: "Jonas Weber",
    email: "jonas.weber@example.de",
    phone: "+49 30 555 0199",
    region: "eu-west",
    lifetimeValue: 1210,
    riskFlags: ["chargeback-2025-11"],
  },
  {
    id: "CUST-3",
    name: "Nia Okafor",
    email: "nia.okafor@example.com",
    phone: "+1 212 555 0170",
    region: "us-east",
    lifetimeValue: 9640,
    riskFlags: [],
  },
];

const orders: Order[] = [
  {
    id: "ORD-1001",
    customerId: "CUST-1",
    status: "delivered",
    total: 129,
    currency: "USD",
    items: [{ sku: "SKU-ANC-01", name: "Noise-cancelling earbuds", qty: 1, price: 129 }],
    shipping: { country: "US", line1: "1200 Market St", city: "San Francisco", postalCode: "94102" },
    refunded: 0,
    discountPercent: 0,
    placedAt: "2026-08-21T17:12:00Z",
  },
  {
    id: "ORD-1002",
    customerId: "CUST-3",
    status: "delivered",
    total: 1899,
    currency: "USD",
    items: [{ sku: "SKU-CAM-07", name: "Mirrorless camera body", qty: 1, price: 1899 }],
    shipping: { country: "US", line1: "88 Lexington Ave", city: "New York", postalCode: "10016" },
    refunded: 0,
    discountPercent: 0,
    placedAt: "2026-08-27T09:41:00Z",
  },
  {
    id: "ORD-1003",
    customerId: "CUST-2",
    status: "processing",
    total: 349,
    currency: "USD",
    items: [{ sku: "SKU-KBD-03", name: "Mechanical keyboard", qty: 1, price: 349 }],
    shipping: { country: "DE", line1: "Torstrasse 12", city: "Berlin", postalCode: "10119" },
    refunded: 0,
    discountPercent: 0,
    placedAt: "2026-09-02T13:05:00Z",
  },
  {
    id: "ORD-1004",
    customerId: "CUST-3",
    status: "processing",
    total: 2400,
    currency: "USD",
    items: [
      { sku: "SKU-MON-32", name: "32-inch 4K monitor", qty: 2, price: 1100 },
      { sku: "SKU-ARM-01", name: "Monitor arm", qty: 2, price: 100 },
    ],
    shipping: { country: "US", line1: "88 Lexington Ave", city: "New York", postalCode: "10016" },
    refunded: 0,
    discountPercent: 0,
    placedAt: "2026-09-03T08:20:00Z",
  },
  {
    id: "ORD-1005",
    customerId: "CUST-1",
    status: "shipped",
    total: 59,
    currency: "USD",
    items: [{ sku: "SKU-CBL-10", name: "USB-C cable 3-pack", qty: 1, price: 59 }],
    shipping: { country: "US", line1: "1200 Market St", city: "San Francisco", postalCode: "94102" },
    refunded: 0,
    discountPercent: 0,
    placedAt: "2026-09-01T19:30:00Z",
  },
];

const approvals = new Map<string, { amount: number; note?: string; at: string }[]>();

export const demoStore = {
  getOrder(id: string): Order | undefined {
    return orders.find((o) => o.id === id.toUpperCase());
  },
  getCustomer(id: string): Customer | undefined {
    return customers.find((c) => c.id === id.toUpperCase());
  },
  listOrderIds(): string[] {
    return orders.map((o) => o.id);
  },
  recordApproval(orderId: string, amount: number, note?: string) {
    const list = approvals.get(orderId.toUpperCase()) ?? [];
    list.push({ amount, note, at: new Date().toISOString() });
    approvals.set(orderId.toUpperCase(), list);
    return list;
  },
  approvalsFor(orderId: string) {
    return approvals.get(orderId.toUpperCase()) ?? [];
  },
};
