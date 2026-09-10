import { extractBearerToken, type AuthFn } from "eve/channels/auth";
import { findPersona } from "./personas";

/** Public, unsigned persona selector. Never use this as real authentication. */
export const simulatedPersona: AuthFn<Request> = (request) => {
  const selector = extractBearerToken(request.headers.get("authorization"));
  if (!selector?.startsWith("demo:")) return null;
  const persona = findPersona(selector.slice(5));
  if (!persona) return null;
  return {
    authenticator: "simulated-persona",
    principalId: String(persona.claims.sub),
    principalType: persona.kind === "service" ? "service" : "user",
    subject: String(persona.claims.sub),
    attributes: { ...persona.claims, demo_persona_id: persona.id, identity_mode: "simulated" },
  };
};
