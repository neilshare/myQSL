import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { problem, Problems } from "./problem";
import type { RequestVariables } from "./request-context";

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const requireOwner: MiddlewareHandler<{
  Bindings: Env;
  Variables: RequestVariables;
}> = async (c, next) => {
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  const allowTestIdentity = (c.env.APP_ENV === "local" || (c.env as any).APP_ENV === "test") && c.env.TEST_AUTH_ENABLED === "1";
  if (!token) {
    if (allowTestIdentity) {
      const testActor = c.req.header("X-EQSR-Test-Actor");
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

  const issuer = c.env.ACCESS_TEAM_DOMAIN.replace(/\/$/u, "");
  const jwks = jwksByTeam.get(issuer) ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  jwksByTeam.set(issuer, jwks);
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: c.env.ACCESS_AUD,
      algorithms: ["RS256"]
    });
    c.set("actor", String(payload.email ?? payload.sub ?? "access-owner"));
    await next();
  } catch {
    return problem(
      401,
      Problems.authInvalid,
      "Invalid authentication",
      "Cloudflare Access assertion is invalid",
      c.req.path
    );
  }
};
