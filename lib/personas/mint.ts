import { SignJWT } from "jose";
import { PERSONA_JWT } from "./jwt-config";
import { findPersona, type Persona } from "./personas";

const encoder = new TextEncoder();

/**
 * Mints a short-lived HS256 JWT for a demo persona. The eve channel verifies
 * it with `jwtHmac` and projects every non-standard string claim to a Cedar
 * tag on the `Eve::User` / `Eve::ServicePrincipal` entity.
 */
export async function mintPersonaToken(persona: Persona): Promise<{ token: string; expiresAt: string }> {
  const { sub, ...rest } = persona.claims;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const token = await new SignJWT({ ...rest })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(sub))
    .setIssuer(PERSONA_JWT.issuer)
    .setAudience(PERSONA_JWT.audience)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(encoder.encode(PERSONA_JWT.secret()));
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function mintPersonaTokenById(personaId: string) {
  const persona = findPersona(personaId);
  if (!persona) return null;
  return { persona, ...(await mintPersonaToken(persona)) };
}
