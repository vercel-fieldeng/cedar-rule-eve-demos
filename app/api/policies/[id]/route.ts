import { NextResponse } from "next/server";
import { z } from "zod";
import { deletePolicy, listPolicies, setPolicyEnabled } from "@/lib/cedar/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({ enabled: z.boolean() });

/** PATCH /api/policies/:id — toggle enabled (AgentCore: policy ACTIVE/INACTIVE). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  await setPolicyEnabled(id, parsed.data.enabled);
  const policies = await listPolicies();
  return NextResponse.json({ policies });
}

/** DELETE /api/policies/:id */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deletePolicy(id);
  const policies = await listPolicies();
  return NextResponse.json({ policies });
}
