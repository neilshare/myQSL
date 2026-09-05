import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { problem, Problems } from "./problem";
import type { RequestVariables } from "./request-context";

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const requireOwner: MiddlewareHandler<{
  Bindings: Env;
  Variables: RequestVariables;
}> = async (c, next) => {
  // Allow explicit auth bypass if disabled by operator
  const authDisabled =
    c.env.AUTH_DISABLED === "true" ||
    c.env.AUTH_DISABLED === "1" ||
    c.env.ACCESS_AUD === "disabled" ||
    c.env.ACCESS_TEAM_DOMAIN === "disabled";
  if (authDisabled) {
    c.set("actor", "admin-owner");
    await next();
    return;
  }

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  const allowTestIdentity = (c.env.APP_ENV === "local" || (c.env as any).APP_ENV === "test") && c.env.TEST_AUTH_ENABLED === "1";
  if (!token) {
    if (allowTestIdentity) {
      const testActor = c.req.header("X-MYQSL-Test-Actor") ?? c.req.header("X-EQSR-Test-Actor");
      if (testActor) {
        c.set("actor", testActor.slice(0, 160));
        await next();
        return;
      }
      if (c.req.header("Authorization") === "Bearer local-e2e-owner") {
        c.set("actor", "e2e-owner");
        await next();
        return;
      }
    }
    return problem(
      401,
      Problems.authRequired,
      "Authentication required",
      "Cloudflare Access assertion is missing",
      c.req.path
    );
  }

  // Parse token payload preview to inspect claims
  let payloadPreview: Record<string, unknown> | null = null;
  try {
    payloadPreview = decodeJwt(token);
  } catch {
    return problem(
      401,
      Problems.authInvalid,
      "Invalid authentication",
      "Malformed Cloudflare Access assertion token",
      c.req.path
    );
  }

  // Resolve team domain issuer
  let issuer = c.env.ACCESS_TEAM_DOMAIN ? c.env.ACCESS_TEAM_DOMAIN.replace(/\/$/u, "") : "";
  const isPlaceholderTeam = !issuer || issuer === "https://myqsl.cloudflareaccess.com";
  if (isPlaceholderTeam && typeof payloadPreview?.iss === "string" && payloadPreview.iss.endsWith(".cloudflareaccess.com")) {
    issuer = payloadPreview.iss.replace(/\/$/u, "");
  }

  if (!issuer) {
    return problem(
      401,
      Problems.authInvalid,
      "Invalid authentication",
      "Unable to determine Cloudflare Access team domain",
      c.req.path
    );
  }

  // Resolve audience requirement
  const isPlaceholderAud = !c.env.ACCESS_AUD || c.env.ACCESS_AUD === "myqsl-production-audience";
  const expectedAudience = isPlaceholderAud ? undefined : c.env.ACCESS_AUD;

  const jwks = jwksByTeam.get(issuer) ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  jwksByTeam.set(issuer, jwks);
  try {
    const verifyOptions: Parameters<typeof jwtVerify>[2] = {
      issuer,
      algorithms: ["RS256"]
    };
    if (expectedAudience) {
      verifyOptions.audience = expectedAudience;
    }

    const { payload } = await jwtVerify(token, jwks, verifyOptions);
    c.set("actor", String(payload.email ?? payload.sub ?? "access-owner"));
    await next();
  } catch (err) {
    console.error("[Cloudflare Access] JWT verification failed:", err);
    const detailMsg = err instanceof Error ? err.message : "verification failed";
    return problem(
      401,
      Problems.authInvalid,
      "Invalid authentication",
      `Cloudflare Access assertion is invalid: ${detailMsg}`,
      c.req.path
    );
  }
};
