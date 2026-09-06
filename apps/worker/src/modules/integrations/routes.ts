import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { RequestVariables } from "../../platform/request-context";
import { hashAgentToken } from "../../platform/agent-auth";
import { problem } from "../../platform/problem";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  profiles: z.array(z.object({
    station_id: z.coerce.number().int().positive(),
    source_kind: z.enum(["wsjtx", "n1mm"]),
    source_instance: z.string().trim().min(1).max(160),
    expected_station_callsign: z.string().trim().min(3).max(16)
  })).min(1).max(8)
});

function token(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let raw = ""; for (const byte of bytes) raw += String.fromCharCode(byte);
  return `mqa_${btoa(raw).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "")}`;
}

export function registerIntegrationRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.get("/api/v1/integrations/agents", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT d.id, d.name, d.token_expires_at, d.revoked_at, d.created_at, d.last_seen_at,
              COUNT(p.id) AS profile_count
         FROM agent_devices d LEFT JOIN agent_profiles p ON p.device_id = d.id
        GROUP BY d.id ORDER BY d.created_at DESC`
    ).all();
    return c.json({ data: rows.results.map((row) => ({
      id: String(row.id), name: String(row.name), token_expires_at: Number(row.token_expires_at),
      revoked_at: row.revoked_at == null ? null : Number(row.revoked_at), created_at: Number(row.created_at),
      last_seen_at: row.last_seen_at == null ? null : Number(row.last_seen_at), profile_count: Number(row.profile_count)
    })) });
  });

  app.post("/api/v1/integrations/agents", async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", parsed.error.message, c.req.path);
    const now = Date.now();
  const deviceId = `dev_${crypto.randomUUID()}`;
    const secret = token();
    const tokenHash = await hashAgentToken(secret);
    const expires = now + 90 * 24 * 60 * 60 * 1000;
    const stationIds = parsed.data.profiles.map((profile) => profile.station_id);
    const placeholders = stationIds.map(() => "?").join(",");
    const stations = await c.env.DB.prepare(`SELECT id, callsign FROM stations WHERE id IN (${placeholders})`).bind(...stationIds).all<{ id: number; callsign: string }>();
    const stationMap = new Map(stations.results.map((row) => [Number(row.id), String(row.callsign)]));
    if (stationMap.size !== new Set(stationIds).size) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "One or more stations do not exist", c.req.path);
    const statements: D1PreparedStatement[] = [c.env.DB.prepare(
      "INSERT INTO agent_devices(id,name,token_sha256,token_expires_at,created_at) VALUES(?,?,?,?,?)"
    ).bind(deviceId, parsed.data.name, tokenHash, expires, now)];
    for (const profile of parsed.data.profiles) {
      const profileId = `profile_${crypto.randomUUID()}`;
      const callsign = stationMap.get(profile.station_id) ?? profile.expected_station_callsign;
      if (callsign.toUpperCase() !== profile.expected_station_callsign.toUpperCase()) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", `Station callsign mismatch for ${profile.station_id}`, c.req.path);
      statements.push(c.env.DB.prepare(
        `INSERT INTO agent_profiles(id,device_id,station_id,source_kind,source_instance,expected_station_callsign,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?)`
      ).bind(profileId, deviceId, profile.station_id, profile.source_kind, profile.source_instance, profile.expected_station_callsign.toUpperCase(), now, now));
    }
    try { await c.env.DB.batch(statements); } catch (error) {
      return problem(409, "https://myqsl.app/problems/conflict", "Device conflict", error instanceof Error ? error.message : "Unable to create device", c.req.path);
    }
    c.header("Cache-Control", "no-store");
    return c.json({ data: { id: deviceId, name: parsed.data.name, token: secret, token_expires_at: expires } }, 201);
  });

  app.post("/api/v1/integrations/agents/:id/revoke", async (c) => {
    const result = await c.env.DB.prepare("UPDATE agent_devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(Date.now(), c.req.param("id")).run();
    if (!result.meta.changes) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Agent device not found or already revoked", c.req.path);
    return c.json({ data: { id: c.req.param("id"), revoked: true } });
  });

  app.post("/api/v1/integrations/agents/:id/rotate-token", async (c) => {
    const secret = token();
    const expires = Date.now() + 90 * 24 * 60 * 60 * 1000;
    const result = await c.env.DB.prepare("UPDATE agent_devices SET token_sha256 = ?, token_expires_at = ?, revoked_at = NULL WHERE id = ?").bind(await hashAgentToken(secret), expires, c.req.param("id")).run();
    if (!result.meta.changes) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Agent device not found", c.req.path);
    c.header("Cache-Control", "no-store");
    return c.json({ data: { id: c.req.param("id"), token: secret, token_expires_at: expires } });
  });
}
