import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzePolicy, validatePolicies } from "@/lib/cedar/engine";

export const runtime = "nodejs";

const schema = z.object({ cedar: z.string().min(1).max(20_000) });

/**
 * POST /api/policies/validate — strict schema validation plus static analysis
 * for an unsaved policy (AgentCore validates on create; the console does it
 * live while you type).
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const validation = validatePolicies(parsed.data.cedar);
  const analysis = validation.ok ? analyzePolicy(parsed.data.cedar) : [];
  return NextResponse.json({ validation, analysis }, { headers: { "Cache-Control": "no-store" } });
}
