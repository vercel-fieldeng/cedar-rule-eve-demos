export const PERSONA_JWT = {
  issuer: "https://orderdesk.demo/personas",
  audience: "orderdesk-agent",
  secret(): string {
    const secret = process.env.PERSONA_JWT_SECRET;
    if (!secret) {
      throw new Error("PERSONA_JWT_SECRET must be set to a unique value.");
    }
    return secret;
  },
} as const;
