import type { CedarPrincipal } from "@/lib/cedar/engine";
import type { Persona } from "./personas";

export type ClaimValue = string | readonly string[];

export function claimsToStringTags(claims: Readonly<Record<string, ClaimValue>>): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(claims)) {
    if (key === "sub") continue;
    tags[key] = Array.isArray(value) ? value.join(" ") : String(value);
  }
  return tags;
}

export function principalFromPersona(persona: Persona): CedarPrincipal {
  return {
    kind: persona.kind,
    id: String(persona.claims.sub),
    tags: claimsToStringTags(persona.claims),
  };
}

export function principalFromSessionAuth(auth: {
  readonly principalId: string;
  readonly principalType: string;
  readonly subject?: string;
  readonly attributes: Readonly<Record<string, string | readonly string[]>>;
} | null): CedarPrincipal {
  if (!auth) throw new Error("Cedar authorization requires an authenticated Eve session.");
  const tags = claimsToStringTags(auth.attributes);
  const isService = tags.principal_kind === "service" || auth.principalType === "vercel-oidc";
  return {
    kind: isService ? "service" : "user",
    id: auth.subject ?? auth.principalId,
    tags,
  };
}
