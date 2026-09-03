import type { CedarPrincipal } from "@/lib/cedar/engine";
import type { Persona } from "./personas";

/**
 * Projects a persona to the same Cedar principal the eve channel would build
 * from its verified JWT: `sub` becomes the entity id and every other string
 * claim becomes a tag (arrays joined with a space).
 */
export function principalFromPersona(persona: Persona): CedarPrincipal {
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(persona.claims)) {
    if (k === "sub") continue;
    tags[k] = Array.isArray(v) ? (v as readonly string[]).join(" ") : (v as string);
  }
  return { kind: persona.kind, id: String(persona.claims.sub), tags };
}
