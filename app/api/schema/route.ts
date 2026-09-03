import { NextResponse } from "next/server";
import { TOOL_CATALOG, TOOL_NAMES } from "@/lib/cedar/catalog";
import { getCedarSchema } from "@/lib/cedar/schema";

export const runtime = "nodejs";

/**
 * GET /api/schema — the Cedar schema generated from the tool catalog, plus a
 * tool summary. AgentCore derives its schema from the gateway's tool
 * definitions; we derive ours from each tool's Zod input schema.
 */
export async function GET() {
  const tools = TOOL_NAMES.map((name) => ({
    name,
    description: TOOL_CATALOG[name].description,
    mutating: TOOL_CATALOG[name].mutating,
  }));
  return NextResponse.json({ schema: getCedarSchema(), tools });
}
