import { jwtHmac, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { PERSONA_JWT } from "../../lib/personas/jwt-config";

/**
 * Web chat channel. Browser requests carry a persona JWT minted by the Next.js
 * app (`/api/personas/token`). The verified claims become the Cedar principal:
 * `sub` -> Eve::User id, every other string/string[] claim -> entity tags.
 *
 * This mirrors AgentCore's inbound OAuth identity: the gateway validates a JWT,
 * and the claims are exposed to Cedar as `AgentCore::OAuthUser` tags.
 */
export default eveChannel({
  auth: [
    vercelOidc(),
    jwtHmac({
      algorithm: "HS256",
      issuer: PERSONA_JWT.issuer,
      audiences: [PERSONA_JWT.audience],
      secret: PERSONA_JWT.secret(),
    }),
    localDev(),
  ],
});
