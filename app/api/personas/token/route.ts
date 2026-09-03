import { NextResponse } from "next/server";
import { mintPersonaTokenById } from "@/lib/personas/mint";
import { DEFAULT_PERSONA_ID, PERSONAS } from "@/lib/personas/personas";

export const runtime = "nodejs";

/**
 * GET /api/personas/token?persona=<id>
 *
 * Returns a signed persona JWT plus the public persona record. The browser
 * passes the token as a bearer credential to the eve channel, where `jwtHmac`
 * verifies it and the claims become Cedar tags.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("persona") ?? DEFAULT_PERSONA_ID;
  const minted = await mintPersonaTokenById(id);
  if (!minted) {
    return NextResponse.json(
      { error: `Unknown persona "${id}"`, personas: PERSONAS.map((p) => p.id) },
      { status: 404 },
    );
  }
  return NextResponse.json(
    {
      token: minted.token,
      expiresAt: minted.expiresAt,
      persona: minted.persona,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
