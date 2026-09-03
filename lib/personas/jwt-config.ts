/**
 * Shared HMAC JWT settings for demo persona tokens. The Next.js app mints
 * tokens with these values, and the eve channel verifies them with `jwtHmac`.
 *
 * `PERSONA_JWT_SECRET` may be set in the environment; otherwise a fixed demo
 * secret is used so the preview works with zero configuration. Do not reuse
 * this pattern for real identity: use your IdP's OIDC issuer with `oidc()`.
 */
export const PERSONA_JWT = {
  issuer: "https://orderdesk.demo/personas",
  audience: "orderdesk-agent",
  secret(): string {
    return (
      process.env.PERSONA_JWT_SECRET ??
      "orderdesk-demo-persona-secret-do-not-use-in-production-0123456789"
    );
  },
} as const;
