import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../env";
import { problem, Problems } from "./problem";
import type { AgentContext, RequestVariables } from "./request-context";

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const requireAgent: MiddlewareHandler<{ Bindings: Env; Variables: RequestVariables }> = async (c, next) => {
  const authDisabled = c.env.AUTH_DISABLED === "true" || c.env.AUTH_DISABLED === "1";
  if (authDisabled && c.env.APP_ENV !== "production") {
    c.set("agent", { deviceId: "local-agent", profileIds: [], actor: "agent:local-agent" });
    c.set("actor", "agent:local-agent");
    await next();
    return;
  }
  if (c.env.APP_ENV === "production" && (!c.env.AGENT_ACCESS_AUD || !c.env.AGENT_ACCESS_CLIENT_ID)) {
    return problem(503, Problems.serviceUnavailable, "Agent authentication unavailable", "Agent Access service credentials are not configured", c.req.path);
  }
  const bearer = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim();
  if (!bearer || bearer.length < 32 || bearer.length > 512) {
    return problem(401, Problems.authRequired, "Authentication required", "Agent bearer token is missing", c.req.path);
  }
  if (c.env.AGENT_ACCESS_CLIENT_ID) {
    if (c.req.header("CF-Access-Client-Id") !== c.env.AGENT_ACCESS_CLIENT_ID || c.req.header("CF-Access-Client-Secret") !== c.env.AGENT_ACCESS_CLIENT_SECRET) {
      return problem(401, Problems.authInvalid, "Invalid authentication", "Cloudflare Access service credentials are invalid", c.req.path);
    }
  }
  const accessAssertion = c.req.header("Cf-Access-Jwt-Assertion");
  if (!accessAssertion || !c.env.AGENT_ACCESS_TEAM_DOMAIN || !c.env.AGENT_ACCESS_AUD) {
    return problem(401, Problems.authInvalid, "Invalid authentication", "Agent Cloudflare Access assertion is missing or not configured", c.req.path);
  }
  const issuer = c.env.AGENT_ACCESS_TEAM_DOMAIN.replace(/\/$/u, "");
  try {
    const jwks = jwksByIssuer.get(issuer) ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuer, jwks);
    await jwtVerify(accessAssertion, jwks, { issuer, audience: c.env.AGENT_ACCESS_AUD, algorithms: ["RS256"] });
  } catch {
    return problem(401, Problems.authInvalid, "Invalid authentication", "Agent Cloudflare Access assertion failed verification", c.req.path);
  }
  const tokenHash = await sha256Hex(bearer);
  const row = await c.env.DB.prepare(
    `SELECT d.id, d.token_expires_at, d.revoked_at,
            GROUP_CONCAT(p.id) AS profile_ids
       FROM agent_devices d LEFT JOIN agent_profiles p ON p.device_id = d.id AND p.enabled = 1
      WHERE d.token_sha256 = ? GROUP BY d.id`
  ).bind(tokenHash).first<{ id: string; token_expires_at: number; revoked_at: number | null; profile_ids: string | null }>();
  const now = Date.now();
  if (!row || row.revoked_at !== null || Number(row.token_expires_at) <= now) {
    return problem(401, Problems.authInvalid, "Invalid authentication", "Agent token is invalid, expired, or revoked", c.req.path);
  }
  const context: AgentContext = { deviceId: row.id, profileIds: row.profile_ids ? row.profile_ids.split(",") : [], actor: `agent:${row.id}` };
  c.set("agent", context);
  c.set("actor", context.actor);
  await c.env.DB.prepare("UPDATE agent_devices SET last_seen_at = ? WHERE id = ?").bind(now, row.id).run();
  await next();
};

export async function hashAgentToken(token: string): Promise<string> {
  return sha256Hex(token);
}
