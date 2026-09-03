import { NextResponse } from "next/server";
import { DEFAULT_PERSONA_ID, PERSONAS } from "@/lib/personas/personas";

export function GET() {
  return NextResponse.json({ personas: PERSONAS, defaultPersonaId: DEFAULT_PERSONA_ID });
}
